package com.multi.encription.sms.core

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.multi.encription.sms.database.SmsDatabase
import com.multi.encription.sms.database.SmsEntity
import com.multi.encription.sms.database.SmsStatus
import com.multi.encription.sms.telephony.SubscriptionHelper
import com.multi.encription.sms.utils.ConfigManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.UUID

class SmsManager(
    private val context: Context,
    private val configManager: ConfigManager = ConfigManager(context)
) {

    private val database = SmsDatabase.getDatabase(context)
    private val smsDao = database.smsDao()

    companion object {
        private const val TAG = "SmsManager"
        const val SMS_SENT_ACTION = "SMS_SENT"
        const val SMS_DELIVERED_ACTION = "SMS_DELIVERED"
        const val EXTRA_SMS_ID = "sms_id"
        const val EXTRA_REQUEST_ID = "request_id"
        const val EXTRA_GLOBAL_JOB_ID = "global_job_id"
        const val EXTRA_SUB_ID = "sub_id"
        const val EXTRA_PART_INDEX = "part_index"
        const val EXTRA_TOTAL_PARTS = "total_parts"
    }

    suspend fun sendSms(
        phoneNumber: String,
        message: String,
        apiKey: String? = null,
        requestId: String? = null,
        globalJobId: String? = null
    ): Result<Long> {
        return try {
            // 1. Validate phone number
            if (!isValidPhoneNumber(phoneNumber)) {
                return Result.failure(IllegalArgumentException("Invalid phone number format"))
            }

            // 2. Validate message
            if (message.isBlank()) {
                return Result.failure(IllegalArgumentException("Message cannot be empty"))
            }

            // 3. Check for duplicate global job processing
            if (!globalJobId.isNullOrBlank()) {
                val existing = smsDao.getSmsByGlobalJobId(globalJobId)
                if (existing != null && (existing.status == SmsStatus.SENT || existing.status == SmsStatus.DELIVERED)) {
                    Log.w(TAG, "Skipping duplicate dispatch for already processed global job: $globalJobId")
                    return Result.success(existing.id)
                }
            }

            // 4. Resolve Active Cellular Subscription ID explicitly
            val resolvedSubId = SubscriptionHelper.resolveSubscriptionId(context, configManager)
            val subDiagnostics = SubscriptionHelper.getSubscriptionDiagnostics(context, configManager)
            Log.i(TAG, "Pre-dispatch Telephony Diagnostics: ${subDiagnostics.toSummaryString()}")

            // 5. Create SMS entity with subscription tracking
            val smsEntity = SmsEntity(
                phoneNumber = phoneNumber,
                message = message,
                status = SmsStatus.PENDING,
                apiKey = apiKey,
                requestId = requestId ?: UUID.randomUUID().toString(),
                globalJobId = globalJobId,
                subscriptionId = if (resolvedSubId > 0) resolvedSubId else null
            )

            // 6. Insert into database
            val smsId = smsDao.insertSms(smsEntity)

            // 7. Dispatch SMS via resolved Android telephony stack
            sendSmsInternal(smsId, phoneNumber, message, globalJobId, resolvedSubId)

            Log.d(TAG, "SMS queued for cellular dispatch: ID=$smsId, GlobalJobId=$globalJobId, SubId=$resolvedSubId")
            Result.success(smsId)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to send SMS", e)
            Result.failure(e)
        }
    }

    private fun sendSmsInternal(
        smsId: Long,
        phoneNumber: String,
        message: String,
        globalJobId: String?,
        subscriptionId: Int
    ) {
        try {
            // Get explicit SmsManager instance for resolved subscription
            val telephonySmsManager = SubscriptionHelper.getSmsManagerForSubscription(context, subscriptionId)

            // Split message if multi-part
            val parts = telephonySmsManager.divideMessage(message)
            val totalParts = parts.size

            val requestDelivery = configManager.requestDeliveryReports

            if (totalParts == 1) {
                // Single part message: deliveredIntent null avoids TP-SRR PDU flag that causes RIL error 124 on carriers like Airtel
                val sentIntent = createSentIntent(smsId, globalJobId, subscriptionId, partIndex = 0, totalParts = 1)
                val deliveredIntent = if (requestDelivery) {
                    createDeliveredIntent(smsId, globalJobId, subscriptionId, partIndex = 0, totalParts = 1)
                } else null

                telephonySmsManager.sendTextMessage(
                    phoneNumber,
                    null,
                    message,
                    sentIntent,
                    deliveredIntent
                )
            } else {
                // Multi-part message with unique PendingIntents per part
                val sentIntents = ArrayList<PendingIntent>(totalParts)
                val deliveredIntents = if (requestDelivery) ArrayList<PendingIntent>(totalParts) else null

                for (i in 0 until totalParts) {
                    sentIntents.add(createSentIntent(smsId, globalJobId, subscriptionId, partIndex = i, totalParts = totalParts))
                    if (requestDelivery) {
                        deliveredIntents?.add(createDeliveredIntent(smsId, globalJobId, subscriptionId, partIndex = i, totalParts = totalParts))
                    }
                }

                telephonySmsManager.sendMultipartTextMessage(
                    phoneNumber,
                    null,
                    parts,
                    sentIntents,
                    deliveredIntents
                )
            }

        } catch (e: Exception) {
            Log.e(TAG, "Failed to send SMS internally via telephony stack", e)
            CoroutineScope(Dispatchers.IO).launch {
                updateSmsStatus(smsId, SmsStatus.FAILED, e.message, subscriptionId = subscriptionId)
            }
        }
    }

    private fun createSentIntent(
        smsId: Long,
        globalJobId: String?,
        subscriptionId: Int,
        partIndex: Int,
        totalParts: Int
    ): PendingIntent {
        val intent = Intent(context, SmsStatusReceiver::class.java).apply {
            action = SMS_SENT_ACTION
            putExtra(EXTRA_SMS_ID, smsId)
            putExtra(EXTRA_SUB_ID, subscriptionId)
            putExtra(EXTRA_PART_INDEX, partIndex)
            putExtra(EXTRA_TOTAL_PARTS, totalParts)
            if (globalJobId != null) {
                putExtra(EXTRA_GLOBAL_JOB_ID, globalJobId)
            }
        }

        // Unique requestCode prevents collision between jobs and between message parts
        val requestCode = (smsId * 100 + partIndex).toInt()

        // Explicit intent targeting SmsStatusReceiver: FLAG_MUTABLE allows telephony service to populate errorCode & noDefault
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)

        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            flags
        )
    }

    private fun createDeliveredIntent(
        smsId: Long,
        globalJobId: String?,
        subscriptionId: Int,
        partIndex: Int,
        totalParts: Int
    ): PendingIntent {
        val intent = Intent(context, SmsStatusReceiver::class.java).apply {
            action = SMS_DELIVERED_ACTION
            putExtra(EXTRA_SMS_ID, smsId)
            putExtra(EXTRA_SUB_ID, subscriptionId)
            putExtra(EXTRA_PART_INDEX, partIndex)
            putExtra(EXTRA_TOTAL_PARTS, totalParts)
            if (globalJobId != null) {
                putExtra(EXTRA_GLOBAL_JOB_ID, globalJobId)
            }
        }

        // Distinct requestCode offset to avoid collision with sent intent
        val requestCode = (smsId * 100 + partIndex + 500000).toInt()

        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)

        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            flags
        )
    }

    suspend fun updateSmsStatus(
        smsId: Long,
        status: SmsStatus,
        errorMessage: String? = null,
        subscriptionId: Int? = null,
        radioErrorCode: Int? = null,
        diagnosticInfo: String? = null
    ) {
        try {
            val sms = smsDao.getSmsById(smsId)
            if (sms != null) {
                val updatedSms = sms.copy(
                    status = status,
                    errorMessage = errorMessage,
                    subscriptionId = subscriptionId ?: sms.subscriptionId,
                    radioErrorCode = radioErrorCode ?: sms.radioErrorCode,
                    diagnosticInfo = diagnosticInfo ?: sms.diagnosticInfo,
                    deliveryTimestamp = if (status == SmsStatus.DELIVERED) System.currentTimeMillis() else sms.deliveryTimestamp
                )
                smsDao.updateSms(updatedSms)
                Log.d(TAG, "Updated SMS status: ID=$smsId, Status=$status, ErrorCode=$radioErrorCode")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update SMS status", e)
        }
    }

    suspend fun getSmsById(smsId: Long): SmsEntity? {
        return smsDao.getSmsById(smsId)
    }

    suspend fun getSmsByRequestId(requestId: String): SmsEntity? {
        return smsDao.getSmsByRequestId(requestId)
    }

    suspend fun getSmsByGlobalJobId(globalJobId: String): SmsEntity? {
        return smsDao.getSmsByGlobalJobId(globalJobId)
    }

    private fun isValidPhoneNumber(phoneNumber: String): Boolean {
        // International E.164 and local standard phone number format validation
        val cleanNumber = phoneNumber.replace(Regex("[^+\\d]"), "")
        return cleanNumber.length >= 10 && cleanNumber.matches(Regex("^\\+?[1-9]\\d{1,14}$"))
    }
}
