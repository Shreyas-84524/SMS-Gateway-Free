package com.multi.encription.sms

import android.app.Activity
import android.telephony.SmsManager as AndroidSmsManager
import com.multi.encription.sms.database.SmsEntity
import com.multi.encription.sms.database.SmsStatus
import com.multi.encription.sms.telephony.SmsErrorDecoder
import org.junit.Assert.*
import org.junit.Test

class SmsDispatchDiagnosticTest {

    @Test
    fun testDecodeResultOk() {
        val result = SmsErrorDecoder.decode(
            resultCode = Activity.RESULT_OK,
            radioErrorCode = 0,
            noDefault = false,
            subscriptionId = 1
        )
        assertEquals("RESULT_OK", result.errorName)
        assertTrue(result.isSuccess)
        assertFalse(result.isRateLimited)
        assertTrue(result.toSanitizedDiagnosticString().contains("RESULT_OK"))
    }

    @Test
    fun testDecodeResultCanceled() {
        val result = SmsErrorDecoder.decode(
            resultCode = Activity.RESULT_CANCELED,
            radioErrorCode = 0,
            noDefault = false,
            subscriptionId = 1
        )
        assertEquals("RESULT_CANCELED", result.errorName)
        assertFalse(result.isSuccess)
        assertTrue(result.decodedReason.contains("cancelled"))
    }

    @Test
    fun testDecodeGenericFailureWithoutRadioCode() {
        val result = SmsErrorDecoder.decode(
            resultCode = AndroidSmsManager.RESULT_ERROR_GENERIC_FAILURE,
            radioErrorCode = null,
            noDefault = false,
            subscriptionId = 1
        )
        assertEquals("RESULT_ERROR_GENERIC_FAILURE", result.errorName)
        assertTrue(result.decodedReason.contains("Generic radio/modem failure"))
        assertFalse(result.isSuccess)
        assertTrue(result.toSanitizedDiagnosticString().contains("RESULT_ERROR_GENERIC_FAILURE"))
    }

    @Test
    fun testDecodeGenericFailureWithNoDefaultFlag() {
        val result = SmsErrorDecoder.decode(
            resultCode = AndroidSmsManager.RESULT_ERROR_GENERIC_FAILURE,
            radioErrorCode = null,
            noDefault = true,
            subscriptionId = -1
        )
        assertEquals("RESULT_ERROR_GENERIC_FAILURE", result.errorName)
        assertTrue(result.decodedReason.contains("No default SMS SIM configured"))
        assertFalse(result.isSuccess)
        assertTrue(result.toSanitizedDiagnosticString().contains("noDefault=true"))
    }

    @Test
    fun testDecodeRadioOff() {
        val result = SmsErrorDecoder.decode(
            resultCode = AndroidSmsManager.RESULT_ERROR_RADIO_OFF,
            radioErrorCode = 0,
            noDefault = false,
            subscriptionId = 1
        )
        assertEquals("RESULT_ERROR_RADIO_OFF", result.errorName)
        assertTrue(result.decodedReason.contains("Airplane Mode"))
        assertTrue(result.toSanitizedDiagnosticString().contains("RESULT_ERROR_RADIO_OFF"))
    }

    @Test
    fun testDecodeNullPdu() {
        val result = SmsErrorDecoder.decode(
            resultCode = AndroidSmsManager.RESULT_ERROR_NULL_PDU,
            radioErrorCode = 0,
            noDefault = false,
            subscriptionId = 1
        )
        assertEquals("RESULT_ERROR_NULL_PDU", result.errorName)
        assertTrue(result.decodedReason.contains("Null PDU"))
    }

    @Test
    fun testDecodeNoService() {
        val result = SmsErrorDecoder.decode(
            resultCode = AndroidSmsManager.RESULT_ERROR_NO_SERVICE,
            radioErrorCode = 0,
            noDefault = false,
            subscriptionId = 1
        )
        assertEquals("RESULT_ERROR_NO_SERVICE", result.errorName)
        assertTrue(result.decodedReason.contains("No cellular network service"))
    }

    @Test
    fun testDecodeLimitExceededRateLimit() {
        val result = SmsErrorDecoder.decode(
            resultCode = AndroidSmsManager.RESULT_ERROR_LIMIT_EXCEEDED,
            radioErrorCode = 0,
            noDefault = false,
            subscriptionId = 1
        )
        assertEquals("RESULT_ERROR_LIMIT_EXCEEDED", result.errorName)
        assertTrue(result.decodedReason.contains("SMS sending limit reached"))
        assertTrue(result.isRateLimited)
    }

    @Test
    fun testDecodeFdnCheckFailure() {
        val result = SmsErrorDecoder.decode(
            resultCode = AndroidSmsManager.RESULT_ERROR_FDN_CHECK_FAILURE,
            radioErrorCode = 0,
            noDefault = false,
            subscriptionId = 1
        )
        assertEquals("RESULT_ERROR_FDN_CHECK_FAILURE", result.errorName)
        assertTrue(result.decodedReason.contains("Fixed Dialing Numbers"))
    }

    @Test
    fun testDecodeModernAndRilErrors() {
        // Short code not allowed (7)
        val r7 = SmsErrorDecoder.decode(7, null, false, 1)
        assertEquals("RESULT_ERROR_SHORT_CODE_NOT_ALLOWED", r7.errorName)

        // Modem error (16)
        val r16 = SmsErrorDecoder.decode(16, null, false, 1)
        assertEquals("RESULT_MODEM_ERROR", r16.errorName)

        // Network reject (10)
        val r10 = SmsErrorDecoder.decode(10, null, false, 1)
        assertEquals("RESULT_NETWORK_REJECT", r10.errorName)

        // RIL rate limited (106)
        val r106 = SmsErrorDecoder.decode(106, null, false, 1)
        assertEquals("RESULT_RIL_REQUEST_RATE_LIMITED", r106.errorName)
        assertTrue(r106.isRateLimited)

        // RIL generic error (124)
        val r124 = SmsErrorDecoder.decode(124, null, false, 1)
        assertEquals("RESULT_RIL_GENERIC_ERROR", r124.errorName)
        assertTrue(r124.decodedReason.contains("Modem generic error"))
    }

    @Test
    fun testDecode3GppCauseCodes() {
        // Cause 1: Unassigned number
        assertEquals("3GPP: Unassigned (unallocated) number", SmsErrorDecoder.decodeRadioErrorCode(1))

        // Cause 21: Short message transfer rejected
        assertEquals("3GPP: Short message transfer rejected", SmsErrorDecoder.decodeRadioErrorCode(21))

        // Cause 27: Destination out of order
        assertEquals("3GPP: Destination out of order", SmsErrorDecoder.decodeRadioErrorCode(27))

        // Cause 38: Network out of order
        assertEquals("3GPP: Network out of order", SmsErrorDecoder.decodeRadioErrorCode(38))

        // Cause 42: Congestion
        assertEquals("3GPP: Congestion", SmsErrorDecoder.decodeRadioErrorCode(42))

        // Cause 111: Protocol error
        assertEquals("3GPP: Protocol error, unspecified", SmsErrorDecoder.decodeRadioErrorCode(111))
    }

    @Test
    fun testMultiPartPendingIntentRequestCodeUniqueness() {
        val smsId = 42L
        val partsCount = 5
        val requestCodes = (0 until partsCount).map { partIndex ->
            (smsId * 100 + partIndex).toInt()
        }

        assertEquals(5, requestCodes.size)
        assertEquals(5, requestCodes.distinct().size)
        assertEquals(4200, requestCodes[0])
        assertEquals(4201, requestCodes[1])
        assertEquals(4202, requestCodes[2])
        assertEquals(4203, requestCodes[3])
        assertEquals(4204, requestCodes[4])
    }

    @Test
    fun testSmsEntityDiagnosticsFields() {
        val sms = SmsEntity(
            id = 10,
            phoneNumber = "+919876543210",
            message = "Test OTP: 123456",
            status = SmsStatus.FAILED,
            subscriptionId = 1,
            radioErrorCode = 106,
            diagnosticInfo = "Radio Rate Limited"
        )

        assertEquals(10L, sms.id)
        assertEquals("+919876543210", sms.phoneNumber)
        assertEquals("Test OTP: 123456", sms.message)
        assertEquals(SmsStatus.FAILED, sms.status)
        assertEquals(1, sms.subscriptionId)
        assertEquals(106, sms.radioErrorCode)
        assertEquals("Radio Rate Limited", sms.diagnosticInfo)
    }
}
