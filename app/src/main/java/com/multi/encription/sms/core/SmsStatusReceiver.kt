package com.multi.encription.sms.core

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.multi.encription.sms.database.SmsDatabase
import com.multi.encription.sms.database.SmsStatus
import com.multi.encription.sms.network.GlobalGatewayApiClient
import com.multi.encription.sms.telephony.SmsErrorDecoder
import com.multi.encription.sms.utils.ConfigManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsStatusReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SmsStatusReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val capturedResultCode = resultCode
        val smsId = intent.getLongExtra(SmsManager.EXTRA_SMS_ID, -1L)
        val globalJobIdExtra = intent.getStringExtra(SmsManager.EXTRA_GLOBAL_JOB_ID)

        if (smsId == -1L) {
            Log.w(TAG, "Received SMS status callback without valid SMS ID")
            return
        }

        // Read diagnostic extras populated by telephony stack
        val noDefault = intent.getBooleanExtra("noDefault", false)
        val rawErrorCode = intent.getIntExtra("errorCode", -1).let {
            if (it == -1) intent.getIntExtra("android.telephony.extra.ERROR_CODE", -1) else it
        }
        val radioErrorCode = if (rawErrorCode != -1) rawErrorCode else null
        val subIdExtra = intent.getIntExtra(SmsManager.EXTRA_SUB_ID, -1).let {
            if (it != -1) it else null
        }

        val database = SmsDatabase.getDatabase(context)
        val smsDao = database.smsDao()
        val smsManager = SmsManager(context)
        val configManager = ConfigManager(context)
        val apiClient = GlobalGatewayApiClient(configManager)

        val pendingResult = goAsync()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Fetch the SMS entity to ensure we have the correct global job ID
                val entity = smsDao.getSmsById(smsId)
                val targetGlobalJobId = globalJobIdExtra ?: entity?.globalJobId

                when (intent.action) {
                    SmsManager.SMS_SENT_ACTION -> {
                        handleSmsSent(
                            resultCode = capturedResultCode,
                            smsId = smsId,
                            globalJobId = targetGlobalJobId,
                            noDefault = noDefault,
                            radioErrorCode = radioErrorCode,
                            subscriptionId = subIdExtra ?: entity?.subscriptionId,
                            smsManager = smsManager,
                            apiClient = apiClient
                        )
                    }
                    SmsManager.SMS_DELIVERED_ACTION -> {
                        handleSmsDelivered(smsId, targetGlobalJobId, smsManager, apiClient)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling SMS status receiver callback", e)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private suspend fun handleSmsSent(
        resultCode: Int,
        smsId: Long,
        globalJobId: String?,
        noDefault: Boolean,
        radioErrorCode: Int?,
        subscriptionId: Int?,
        smsManager: SmsManager,
        apiClient: GlobalGatewayApiClient
    ) {
        val decoded = SmsErrorDecoder.decode(
            resultCode = resultCode,
            radioErrorCode = radioErrorCode,
            noDefault = noDefault,
            subscriptionId = subscriptionId
        )

        val status = if (decoded.isSuccess) SmsStatus.SENT else SmsStatus.FAILED
        val diagnosticString = decoded.toSanitizedDiagnosticString()

        Log.i(TAG, "SMS Sent Status Callback [SMS ID: $smsId, GlobalJobId: $globalJobId]:\n$diagnosticString")

        if (decoded.isRateLimited) {
            Log.w(TAG, "Android SMS sending rate limit condition detected: ${decoded.decodedReason}")
        }

        // 1. Update local Room database with detailed diagnostics
        smsManager.updateSmsStatus(
            smsId = smsId,
            status = status,
            errorMessage = if (decoded.isSuccess) null else decoded.decodedReason,
            subscriptionId = subscriptionId,
            radioErrorCode = radioErrorCode,
            diagnosticInfo = diagnosticString
        )

        // 2. Report status callback back to cloud queue if associated with a global job
        if (!globalJobId.isNullOrBlank()) {
            if (decoded.isSuccess) {
                apiClient.updateJobStatus(globalJobId, "SENT")
            } else {
                val formattedBackendMsg = if (radioErrorCode != null && radioErrorCode > 0) {
                    "${decoded.decodedReason} (Radio: $radioErrorCode)"
                } else {
                    decoded.decodedReason
                }
                apiClient.updateJobStatus(
                    jobId = globalJobId,
                    status = "FAILED",
                    errorCode = decoded.errorName,
                    errorMessage = formattedBackendMsg
                )
            }
        }
    }

    private suspend fun handleSmsDelivered(
        smsId: Long,
        globalJobId: String?,
        smsManager: SmsManager,
        apiClient: GlobalGatewayApiClient
    ) {
        Log.d(TAG, "SMS delivery receipt received: ID=$smsId, GlobalJobId=$globalJobId")

        // 1. Update local database
        smsManager.updateSmsStatus(smsId, SmsStatus.DELIVERED)

        // 2. Report delivery acknowledgment back to cloud queue
        if (!globalJobId.isNullOrBlank()) {
            apiClient.updateJobStatus(globalJobId, "DELIVERED")
        }
    }
}
