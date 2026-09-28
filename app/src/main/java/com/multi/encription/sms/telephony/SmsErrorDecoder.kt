package com.multi.encription.sms.telephony

import android.app.Activity
import android.telephony.SmsManager as AndroidSmsManager

/**
 * Decoded result from telephony status callbacks.
 */
data class DecodedSmsResult(
    val isSuccess: Boolean,
    val resultCode: Int,
    val errorName: String,
    val decodedReason: String,
    val radioErrorCode: Int?,
    val radioErrorDescription: String?,
    val isRateLimited: Boolean,
    val noDefault: Boolean,
    val subscriptionId: Int?
) {
    /**
     * Formats a sanitized, multi-line diagnostic string suitable for UI display and log persistence.
     * Guaranteed free of PII, recipient numbers, gateway keys, and OTP payloads.
     */
    fun toSanitizedDiagnosticString(): String {
        val statusStr = if (isSuccess) "SENT" else "FAILED"
        val builder = StringBuilder()
        builder.append("Status: $statusStr\n")
        builder.append("resultCode=$resultCode\n")
        builder.append("errorName=$errorName\n")
        builder.append("Reason: $decodedReason\n")
        if (radioErrorCode != null && radioErrorCode > 0) {
            builder.append("radioErrorCode=$radioErrorCode")
            if (!radioErrorDescription.isNullOrBlank()) {
                builder.append(" ($radioErrorDescription)")
            }
            builder.append("\n")
        }
        builder.append("noDefault=$noDefault\n")
        if (subscriptionId != null && subscriptionId > 0) {
            builder.append("subscriptionId=$subscriptionId\n")
        }
        return builder.toString().trimEnd()
    }
}

object SmsErrorDecoder {

    // Standard Android Telephony Result Code Constants
    private const val RESULT_NETWORK_REJECT = 10
    private const val RESULT_INVALID_ARGUMENTS = 11
    private const val RESULT_INVALID_STATE = 12
    private const val RESULT_NO_MEMORY = 13
    private const val RESULT_INVALID_SMS_FORMAT = 14
    private const val RESULT_SYSTEM_ERROR = 15
    private const val RESULT_MODEM_ERROR = 16
    private const val RESULT_NETWORK_ERROR = 17
    private const val RESULT_ENCODING_ERROR = 18
    private const val RESULT_INVALID_SMSC_ADDRESS = 19
    private const val RESULT_OPERATION_NOT_ALLOWED = 20
    private const val RESULT_INTERNAL_ERROR = 21
    private const val RESULT_NO_RESOURCES = 22
    private const val RESULT_CANCELLED = 23
    private const val RESULT_REQUEST_NOT_SUPPORTED = 24
    private const val RESULT_DISABLED = 28

    // RIL-specific Result Code Constants (100+)
    private const val RESULT_RIL_RADIO_NOT_AVAILABLE = 100
    private const val RESULT_RIL_SMS_SEND_FAIL_RETRY = 101
    private const val RESULT_RIL_NETWORK_REJECT = 102
    private const val RESULT_RIL_INVALID_STATE = 103
    private const val RESULT_RIL_INVALID_ARGUMENTS = 104
    private const val RESULT_RIL_NO_MEMORY = 105
    private const val RESULT_RIL_REQUEST_RATE_LIMITED = 106
    private const val RESULT_RIL_INVALID_SMS_FORMAT = 107
    private const val RESULT_RIL_SYSTEM_ERR = 108
    private const val RESULT_RIL_ENCODING_ERR = 109
    private const val RESULT_RIL_INVALID_SMSC_ADDRESS = 110
    private const val RESULT_RIL_MODEM_ERR = 111
    private const val RESULT_RIL_NETWORK_ERR = 112
    private const val RESULT_RIL_INTERNAL_ERR = 113
    private const val RESULT_RIL_REQUEST_NOT_SUPPORTED = 114
    private const val RESULT_RIL_INVALID_MODEM_STATE = 115
    private const val RESULT_RIL_NETWORK_NOT_READY = 116
    private const val RESULT_RIL_NO_RESOURCES = 118
    private const val RESULT_RIL_CANCELLED_LEGACY = 119
    private const val RESULT_RIL_SIM_ABSENT = 120
    private const val RESULT_RIL_BLOCKED_DUE_TO_CALL = 122
    private const val RESULT_RIL_CANCELLED = 123
    private const val RESULT_RIL_GENERIC_ERROR = 124
    private const val RESULT_RIL_INVALID_SIM_STATE = 125
    private const val RESULT_RIL_SIM_PIN2 = 126
    private const val RESULT_RIL_SIM_PUK2 = 127

    /**
     * Decodes integer telephony result codes into human-readable, actionable diagnostics.
     */
    fun decode(
        resultCode: Int,
        radioErrorCode: Int? = null,
        noDefault: Boolean = false,
        subscriptionId: Int? = null
    ): DecodedSmsResult {
        if (resultCode == Activity.RESULT_OK) {
            return DecodedSmsResult(
                isSuccess = true,
                resultCode = resultCode,
                errorName = "RESULT_OK",
                decodedReason = "SMS dispatched successfully to cellular radio tower",
                radioErrorCode = null,
                radioErrorDescription = null,
                isRateLimited = false,
                noDefault = noDefault,
                subscriptionId = subscriptionId
            )
        }

        val (errorName, decodedReason, isRateLimit) = when (resultCode) {
            Activity.RESULT_CANCELED -> {
                Triple("RESULT_CANCELED", "SMS dispatch was cancelled by the operating system, telephony stack, or carrier policy (code: 0)", false)
            }
            AndroidSmsManager.RESULT_ERROR_GENERIC_FAILURE -> {
                val reason = if (noDefault) {
                    "Generic failure: No default SMS SIM configured on device"
                } else {
                    "Generic radio/modem failure. Often caused by carrier network reject, unassigned default SIM, or modem error."
                }
                Triple("RESULT_ERROR_GENERIC_FAILURE", reason, false)
            }
            AndroidSmsManager.RESULT_ERROR_RADIO_OFF -> {
                Triple("RESULT_ERROR_RADIO_OFF", "Cellular radio powered off or Airplane Mode enabled", false)
            }
            AndroidSmsManager.RESULT_ERROR_NULL_PDU -> {
                Triple("RESULT_ERROR_NULL_PDU", "Null PDU received from telephony stack", false)
            }
            AndroidSmsManager.RESULT_ERROR_NO_SERVICE -> {
                Triple("RESULT_ERROR_NO_SERVICE", "No cellular network service or emergency calls only", false)
            }
            AndroidSmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> {
                Triple("RESULT_ERROR_LIMIT_EXCEEDED", "Android SMS sending limit reached. Wait before retrying.", true)
            }
            AndroidSmsManager.RESULT_ERROR_FDN_CHECK_FAILURE -> {
                Triple("RESULT_ERROR_FDN_CHECK_FAILURE", "Fixed Dialing Numbers (FDN) check failure", false)
            }
            AndroidSmsManager.RESULT_ERROR_SHORT_CODE_NOT_ALLOWED -> {
                Triple("RESULT_ERROR_SHORT_CODE_NOT_ALLOWED", "Short code SMS destination not allowed", false)
            }
            AndroidSmsManager.RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED -> {
                Triple("RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED", "Short code SMS destination never allowed by policy", false)
            }
            RESULT_NETWORK_REJECT -> {
                Triple("RESULT_NETWORK_REJECT", "Cellular network rejected SMS transmission", false)
            }
            RESULT_INVALID_ARGUMENTS -> {
                Triple("RESULT_INVALID_ARGUMENTS", "Invalid telephony arguments provided", false)
            }
            RESULT_INVALID_STATE -> {
                Triple("RESULT_INVALID_STATE", "Telephony stack in invalid state", false)
            }
            RESULT_NO_MEMORY -> {
                Triple("RESULT_NO_MEMORY", "Device or SIM card memory full", false)
            }
            RESULT_INVALID_SMS_FORMAT -> {
                Triple("RESULT_INVALID_SMS_FORMAT", "Invalid SMS format / PDU structure", false)
            }
            RESULT_SYSTEM_ERROR -> {
                Triple("RESULT_SYSTEM_ERROR", "Telephony system internal error", false)
            }
            RESULT_MODEM_ERROR -> {
                Triple("RESULT_MODEM_ERROR", "Hardware modem error reported by radio stack", false)
            }
            RESULT_NETWORK_ERROR -> {
                Triple("RESULT_NETWORK_ERROR", "Carrier network error occurred during dispatch", false)
            }
            RESULT_ENCODING_ERROR -> {
                Triple("RESULT_ENCODING_ERROR", "SMS character encoding error", false)
            }
            RESULT_INVALID_SMSC_ADDRESS -> {
                Triple("RESULT_INVALID_SMSC_ADDRESS", "Invalid SMS Service Center (SMSC) address", false)
            }
            RESULT_OPERATION_NOT_ALLOWED -> {
                Triple("RESULT_OPERATION_NOT_ALLOWED", "Telephony operation not permitted by operator", false)
            }
            RESULT_INTERNAL_ERROR -> {
                Triple("RESULT_INTERNAL_ERROR", "Internal telephony stack failure", false)
            }
            RESULT_NO_RESOURCES -> {
                Triple("RESULT_NO_RESOURCES", "No telephony radio resources available", false)
            }
            RESULT_CANCELLED -> {
                Triple("RESULT_CANCELLED", "SMS transmission cancelled", false)
            }
            RESULT_REQUEST_NOT_SUPPORTED -> {
                Triple("RESULT_REQUEST_NOT_SUPPORTED", "SMS request not supported by current radio", false)
            }
            RESULT_DISABLED -> {
                Triple("RESULT_DISABLED", "SMS service is disabled on this subscription", false)
            }
            RESULT_RIL_RADIO_NOT_AVAILABLE -> {
                Triple("RESULT_RIL_RADIO_NOT_AVAILABLE", "RIL: Radio hardware not available", false)
            }
            RESULT_RIL_SMS_SEND_FAIL_RETRY -> {
                Triple("RESULT_RIL_SMS_SEND_FAIL_RETRY", "RIL: Send failed, retry requested", false)
            }
            RESULT_RIL_NETWORK_REJECT -> {
                Triple("RESULT_RIL_NETWORK_REJECT", "RIL: Cellular network reject", false)
            }
            RESULT_RIL_REQUEST_RATE_LIMITED -> {
                Triple("RESULT_RIL_REQUEST_RATE_LIMITED", "RIL: Modem rate limit exceeded. Wait before retrying.", true)
            }
            RESULT_RIL_MODEM_ERR -> {
                Triple("RESULT_RIL_MODEM_ERR", "RIL: Modem hardware error", false)
            }
            RESULT_RIL_NETWORK_ERR -> {
                Triple("RESULT_RIL_NETWORK_ERR", "RIL: Cellular network error", false)
            }
            RESULT_RIL_SIM_ABSENT -> {
                Triple("RESULT_RIL_SIM_ABSENT", "RIL: SIM card absent", false)
            }
            RESULT_RIL_GENERIC_ERROR -> {
                Triple(
                    "RESULT_RIL_GENERIC_ERROR",
                    "RIL: Modem generic error (code: 124). Common causes: 1) Carrier network rejected delivery status report (TP-SRR), 2) International destination without active ISD pack on Indian SIM, 3) Insufficient balance or SMS pack expired, 4) OEM background SMS restriction (MIUI/ColorOS 'Send SMS in background' permission).",
                    false
                )
            }
            RESULT_RIL_BLOCKED_DUE_TO_CALL -> {
                Triple("RESULT_RIL_BLOCKED_DUE_TO_CALL", "RIL: Blocked due to active call or call control (122)", false)
            }
            RESULT_RIL_CANCELLED -> {
                Triple("RESULT_RIL_CANCELLED", "RIL: Request was cancelled by the radio (123)", false)
            }
            RESULT_RIL_INVALID_SIM_STATE -> {
                Triple("RESULT_RIL_INVALID_SIM_STATE", "RIL: SIM card is in an invalid state for SMS (125)", false)
            }
            RESULT_RIL_SIM_PIN2 -> {
                Triple("RESULT_RIL_SIM_PIN2", "RIL: Operation requires SIM PIN2 (126)", false)
            }
            RESULT_RIL_SIM_PUK2 -> {
                Triple("RESULT_RIL_SIM_PUK2", "RIL: Operation requires SIM PUK2 (127)", false)
            }
            else -> {
                Triple("RESULT_UNKNOWN_$resultCode", "Carrier telephony error (code: $resultCode)", false)
            }
        }

        val radioDescription = decodeRadioErrorCode(radioErrorCode)

        return DecodedSmsResult(
            isSuccess = false,
            resultCode = resultCode,
            errorName = errorName,
            decodedReason = decodedReason,
            radioErrorCode = radioErrorCode,
            radioErrorDescription = radioDescription,
            isRateLimited = isRateLimit,
            noDefault = noDefault,
            subscriptionId = subscriptionId
        )
    }

    /**
     * Decodes standard 3GPP TS 24.011 / 3GPP TS 24.008 RP/CP cause codes commonly returned as errorCode.
     */
    fun decodeRadioErrorCode(code: Int?): String? {
        if (code == null || code <= 0) return null
        return when (code) {
            1 -> "3GPP: Unassigned (unallocated) number"
            8 -> "3GPP: Operator determined barring"
            10 -> "3GPP: Call barred"
            21 -> "3GPP: Short message transfer rejected"
            27 -> "3GPP: Destination out of order"
            28 -> "3GPP: Unidentified subscriber"
            29 -> "3GPP: Facility rejected"
            30 -> "3GPP: Unknown subscriber"
            38 -> "3GPP: Network out of order"
            41 -> "3GPP: Temporary failure"
            42 -> "3GPP: Congestion"
            47 -> "3GPP: Resources unavailable, unspecified"
            50 -> "3GPP: Requested facility not subscribed"
            69 -> "3GPP: Requested facility not implemented"
            95 -> "3GPP: Semantically incorrect message"
            96 -> "3GPP: Invalid mandatory information"
            97 -> "3GPP: Message type non-existent or not implemented"
            98 -> "3GPP: Message not compatible with short message protocol state"
            111 -> "3GPP: Protocol error, unspecified"
            127 -> "3GPP: Interworking, unspecified"
            else -> "Radio cause code $code"
        }
    }
}
