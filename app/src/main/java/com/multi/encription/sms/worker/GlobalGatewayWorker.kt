package com.multi.encription.sms.worker

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.telephony.TelephonyManager
import android.util.Log
import com.multi.encription.sms.core.SmsManager
import com.multi.encription.sms.database.SmsDatabase
import com.multi.encription.sms.database.SmsStatus
import com.multi.encription.sms.network.*
import com.multi.encription.sms.utils.ConfigManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.min
import kotlin.random.Random

/**
 * Observable UI state for the Global Worker Dashboard.
 */
data class WorkerUiState(
    val isRunning: Boolean = false,
    val backendStatus: BackendConnectionStatus = BackendConnectionStatus.UNKNOWN,
    val lastSyncTimestamp: Long = 0L,
    val lastClaimedJobId: String? = null,
    val lastSmsStatus: String? = null,
    val simStatus: String = "UNKNOWN",
    val activeJobsInFlight: Int = 0,
    val statusMessage: String = "Idle"
)

enum class BackendConnectionStatus {
    CONNECTED,
    OFFLINE,
    AUTH_ERROR,
    SERVER_ERROR,
    UNKNOWN
}

/**
 * Background Outbound Polling Worker.
 * Periodically polls the Vercel cloud queue for SMS jobs and dispatches them via physical cellular hardware.
 */
class GlobalGatewayWorker(
    private val context: Context,
    private val configManager: ConfigManager,
    private val scope: CoroutineScope
) {

    private val apiClient = GlobalGatewayApiClient(configManager)
    private val smsManager = SmsManager(context)
    private val database = SmsDatabase.getDatabase(context)
    private val smsDao = database.smsDao()

    private var pollingJob: Job? = null
    private var heartbeatJob: Job? = null

    private val _uiState = MutableStateFlow(WorkerUiState())
    val uiState: StateFlow<WorkerUiState> = _uiState.asStateFlow()

    companion object {
        private const val TAG = "GlobalGatewayWorker"
        private const val MIN_POLL_INTERVAL_MS = 3_000L
        private const val MAX_POLL_INTERVAL_MS = 60_000L
        private const val HEARTBEAT_INTERVAL_MS = 60_000L
    }

    private var currentPollIntervalMs = MIN_POLL_INTERVAL_MS

    /**
     * Starts background polling and periodic heartbeats.
     */
    fun start() {
        if (pollingJob?.isActive == true) {
            Log.d(TAG, "Global Gateway Worker is already running")
            return
        }

        Log.i(TAG, "Starting Global Gateway Outbound Polling Worker...")
        _uiState.value = _uiState.value.copy(
            isRunning = true,
            statusMessage = "Starting worker...",
            simStatus = getSimStatusString()
        )

        currentPollIntervalMs = MIN_POLL_INTERVAL_MS
        startPollingLoop()
        startHeartbeatLoop()
    }

    /**
     * Stops polling and heartbeat coroutines.
     */
    fun stop() {
        Log.i(TAG, "Stopping Global Gateway Worker...")
        pollingJob?.cancel()
        heartbeatJob?.cancel()
        pollingJob = null
        heartbeatJob = null

        _uiState.value = _uiState.value.copy(
            isRunning = false,
            statusMessage = "Worker stopped"
        )
    }

    /**
     * Triggers an immediate manual poll outside of normal backoff schedule.
     */
    fun syncNow() {
        scope.launch {
            Log.d(TAG, "Manual Sync requested")
            currentPollIntervalMs = MIN_POLL_INTERVAL_MS
            pollAndProcessJobs()
        }
    }

    private fun startPollingLoop() {
        pollingJob = scope.launch {
            while (isActive) {
                try {
                    val hasMoreJobs = pollAndProcessJobs()
                    if (hasMoreJobs) {
                        // Keep polling fast when jobs are flowing
                        currentPollIntervalMs = MIN_POLL_INTERVAL_MS
                    } else {
                        // Idle backoff
                        currentPollIntervalMs = min(currentPollIntervalMs + 5_000L, MAX_POLL_INTERVAL_MS)
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.e(TAG, "Unexpected error in polling loop", e)
                    currentPollIntervalMs = min(currentPollIntervalMs * 2, MAX_POLL_INTERVAL_MS)
                }

                // Add small jitter to avoid synchronized stampedes
                val jitter = Random.nextLong(0, 1000)
                delay(currentPollIntervalMs + jitter)
            }
        }
    }

    private suspend fun pollAndProcessJobs(): Boolean {
        if (!configManager.secureStorage.hasGatewayKey()) {
            _uiState.value = _uiState.value.copy(
                backendStatus = BackendConnectionStatus.AUTH_ERROR,
                statusMessage = "Missing Gateway API Key"
            )
            return false
        }

        val result = apiClient.claimJobs(limit = 1, leaseSeconds = 60)
        val now = System.currentTimeMillis()

        return when (result) {
            is ApiResult.Success -> {
                val jobs = result.data
                _uiState.value = _uiState.value.copy(
                    backendStatus = BackendConnectionStatus.CONNECTED,
                    lastSyncTimestamp = now,
                    statusMessage = if (jobs.isEmpty()) "Connected (Idle)" else "Claimed ${jobs.size} job(s)"
                )

                if (jobs.isNotEmpty()) {
                    for (job in jobs) {
                        processClaimedJob(job)
                    }
                    true
                } else {
                    false
                }
            }
            is ApiResult.AuthError -> {
                _uiState.value = _uiState.value.copy(
                    backendStatus = BackendConnectionStatus.AUTH_ERROR,
                    lastSyncTimestamp = now,
                    statusMessage = "Authentication Failed (Check Key)"
                )
                // Back off on auth failure
                currentPollIntervalMs = MAX_POLL_INTERVAL_MS
                false
            }
            is ApiResult.HttpError -> {
                _uiState.value = _uiState.value.copy(
                    backendStatus = BackendConnectionStatus.SERVER_ERROR,
                    lastSyncTimestamp = now,
                    statusMessage = "Server Error (HTTP ${result.statusCode})"
                )
                false
            }
            is ApiResult.NetworkError -> {
                _uiState.value = _uiState.value.copy(
                    backendStatus = BackendConnectionStatus.OFFLINE,
                    lastSyncTimestamp = now,
                    statusMessage = "Offline / Connection Failed"
                )
                false
            }
        }
    }

    /**
     * Dispatches a single claimed SMS job with idempotency and duplicate-send protection.
     */
    private suspend fun processClaimedJob(job: ClaimedJobDto) {
        Log.i(TAG, "Processing claimed SMS Job: ${job.jobId} for recipient ${job.phoneNumber}")

        _uiState.value = _uiState.value.copy(
            lastClaimedJobId = job.jobId,
            lastSmsStatus = "PROCESSING",
            statusMessage = "Sending SMS to ${job.phoneNumber}..."
        )

        // 1. Idempotency Check: verify if already SENT or DELIVERED locally
        val isDuplicate = smsDao.isJobAlreadyProcessed(job.jobId)
        if (isDuplicate) {
            Log.w(TAG, "Job ${job.jobId} was already sent previously. Skipping duplicate dispatch.")
            apiClient.updateJobStatus(job.jobId, "SENT")
            _uiState.value = _uiState.value.copy(
                lastSmsStatus = "SKIPPED_DUPLICATE",
                statusMessage = "Skipped duplicate job ${job.jobId.take(8)}"
            )
            return
        }

        // 2. Report SENDING status to backend
        apiClient.updateJobStatus(job.jobId, "SENDING")

        // 3. Dispatch via physical SmsManager
        val sendResult = smsManager.sendSms(
            phoneNumber = job.phoneNumber,
            message = job.message,
            requestId = job.jobId,
            globalJobId = job.jobId
        )

        if (sendResult.isSuccess) {
            val smsId = sendResult.getOrThrow()
            Log.d(TAG, "Dispatched job ${job.jobId} to telephony stack (local SMS ID: $smsId)")
            _uiState.value = _uiState.value.copy(
                lastSmsStatus = "DISPATCHED",
                statusMessage = "Dispatched to cellular hardware"
            )
        } else {
            val error = sendResult.exceptionOrNull()
            Log.e(TAG, "Telephony dispatch failed for job ${job.jobId}", error)
            apiClient.updateJobStatus(job.jobId, "FAILED", "LOCAL_DISPATCH_EXCEPTION", error?.message)
            _uiState.value = _uiState.value.copy(
                lastSmsStatus = "FAILED",
                statusMessage = "Dispatch Failed: ${error?.message}"
            )
        }
    }

    private fun startHeartbeatLoop() {
        heartbeatJob = scope.launch {
            while (isActive) {
                try {
                    sendHeartbeatInternal()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "Error during heartbeat: ${e.message}")
                }
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    private suspend fun sendHeartbeatInternal() {
        if (!configManager.secureStorage.hasGatewayKey()) return

        val batteryPct = getBatteryPercentage()
        val simStatus = getSimStatusString()

        val heartbeat = GatewayHeartbeatRequest(
            model = "${Build.MANUFACTURER} ${Build.MODEL}",
            androidSdk = Build.VERSION.SDK_INT,
            appVersion = "1.0",
            simStatus = simStatus,
            batteryPct = batteryPct,
            workerEnabled = configManager.isWorkerEnabled
        )

        apiClient.sendHeartbeat(heartbeat)
    }

    private fun getBatteryPercentage(): Int? {
        return try {
            val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { filter ->
                context.registerReceiver(null, filter)
            }
            val level: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level >= 0 && scale > 0) {
                (level * 100 / scale)
            } else null
        } catch (e: Exception) {
            null
        }
    }

    private fun getSimStatusString(): String {
        return try {
            val diag = com.multi.encription.sms.telephony.SubscriptionHelper.getSubscriptionDiagnostics(context, configManager)
            if (diag.resolvedSubId > 0) {
                "${diag.simState} (${diag.carrierName}, Sub: ${diag.resolvedSubId})"
            } else {
                diag.simState
            }
        } catch (e: Exception) {
            "UNKNOWN"
        }
    }
}
