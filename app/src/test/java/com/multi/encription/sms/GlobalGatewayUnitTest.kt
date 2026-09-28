package com.multi.encription.sms

import com.google.gson.Gson
import com.multi.encription.sms.database.SmsEntity
import com.multi.encription.sms.database.SmsStatus
import com.multi.encription.sms.models.GatewayMode
import com.multi.encription.sms.network.*
import org.junit.Assert.*
import org.junit.Test

class GlobalGatewayUnitTest {

    private val gson = Gson()

    @Test
    fun testGatewayModeEnumValues() {
        assertEquals(2, GatewayMode.values().size)
        assertEquals(GatewayMode.GLOBAL_WORKER, GatewayMode.valueOf("GLOBAL_WORKER"))
        assertEquals(GatewayMode.LOCAL_API, GatewayMode.valueOf("LOCAL_API"))
    }

    @Test
    fun testUrlNormalizationLogic() {
        fun normalizeUrl(url: String): String {
            var trimmed = url.trim()
            if (trimmed.isBlank()) {
                return "https://global-otp-service.vercel.app"
            }
            if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
                trimmed = "https://$trimmed"
            }
            while (trimmed.endsWith("/")) {
                trimmed = trimmed.substring(0, trimmed.length - 1)
            }
            return trimmed
        }

        assertEquals("https://global-otp-service.vercel.app", normalizeUrl("https://global-otp-service.vercel.app/"))
        assertEquals("https://global-otp-service.vercel.app", normalizeUrl("https://global-otp-service.vercel.app///"))
        assertEquals("https://global-otp-service.vercel.app", normalizeUrl("global-otp-service.vercel.app"))
        assertEquals("http://192.168.1.50:8080", normalizeUrl("http://192.168.1.50:8080/"))
        assertEquals("https://global-otp-service.vercel.app", normalizeUrl("   "))
    }

    @Test
    fun testClaimedJobDeserialization() {
        val json = """
            {
              "success": true,
              "data": {
                "jobs": [
                  {
                    "job_id": "56ee5a31-c79c-4000-b5a7-5edb908d60ef",
                    "phone_number": "+919876543210",
                    "message": "Your verification code is 768523. Valid for 5 minutes.",
                    "created_at": "2026-09-27T18:21:39.000Z",
                    "lease_expires_at": "2026-09-27T18:22:39.000Z"
                  }
                ]
              }
            }
        """.trimIndent()

        val response = gson.fromJson(json, GatewayJobsResponse::class.java)
        assertTrue(response.success)
        assertNotNull(response.data)
        assertEquals(1, response.data!!.jobs.size)

        val job = response.data!!.jobs[0]
        assertEquals("56ee5a31-c79c-4000-b5a7-5edb908d60ef", job.jobId)
        assertEquals("+919876543210", job.phoneNumber)
        assertEquals("Your verification code is 768523. Valid for 5 minutes.", job.message)
        assertEquals("2026-09-27T18:21:39.000Z", job.createdAt)
        assertEquals("2026-09-27T18:22:39.000Z", job.leaseExpiresAt)
    }

    @Test
    fun testEmptyJobClaimDeserialization() {
        val json = """
            {
              "success": true,
              "data": {
                "jobs": []
              }
            }
        """.trimIndent()

        val response = gson.fromJson(json, GatewayJobsResponse::class.java)
        assertTrue(response.success)
        assertNotNull(response.data)
        assertTrue(response.data!!.jobs.isEmpty())
    }

    @Test
    fun testJobStatusUpdateRequestSerialization() {
        val requestSending = JobStatusUpdateRequest(status = "SENDING")
        val jsonSending = gson.toJson(requestSending)
        assertTrue(jsonSending.contains("\"status\":\"SENDING\""))

        val requestFailed = JobStatusUpdateRequest(
            status = "FAILED",
            errorCode = "RESULT_ERROR_NO_SERVICE",
            errorMessage = "No cellular carrier signal"
        )
        val jsonFailed = gson.toJson(requestFailed)
        assertTrue(jsonFailed.contains("\"status\":\"FAILED\""))
        assertTrue(jsonFailed.contains("\"error_code\":\"RESULT_ERROR_NO_SERVICE\""))
        assertTrue(jsonFailed.contains("\"error_message\":\"No cellular carrier signal\""))
    }

    @Test
    fun testHeartbeatRequestSerializationPrivacy() {
        val heartbeat = GatewayHeartbeatRequest(
            model = "Pixel 8 Pro",
            androidSdk = 35,
            appVersion = "1.0",
            simStatus = "READY",
            batteryPct = 88,
            workerEnabled = true
        )
        val json = gson.toJson(heartbeat)
        assertTrue(json.contains("\"model\":\"Pixel 8 Pro\""))
        assertTrue(json.contains("\"android_sdk\":35"))
        assertTrue(json.contains("\"sim_status\":\"READY\""))
        assertTrue(json.contains("\"battery_pct\":88"))
        assertTrue(json.contains("\"worker_enabled\":true"))

        // Security check: Verify NO PII or raw credentials present
        assertFalse(json.contains("imei"))
        assertFalse(json.contains("imsi"))
        assertFalse(json.contains("phone_number"))
        assertFalse(json.contains("contacts"))
        assertFalse(json.contains("otp_gw_"))
    }

    @Test
    fun testHealthCheckResponseDeserialization() {
        val json = """
            {
              "status": "healthy",
              "version": "1.0.0",
              "timestamp": "2026-09-27T18:18:24.602Z",
              "services": {
                "database": "connected",
                "queue_depth": 0,
                "active_gateways": 1
              }
            }
        """.trimIndent()

        val response = gson.fromJson(json, HealthCheckResponse::class.java)
        assertEquals("healthy", response.status)
        assertEquals("1.0.0", response.version)
        assertNotNull(response.services)
        assertEquals("connected", response.services?.database)
        assertEquals(0, response.services?.queueDepth)
        assertEquals(1, response.services?.activeGateways)
    }

    @Test
    fun testKeyMasking() {
        fun maskKey(key: String?): String {
            if (key.isNullOrBlank()) return "Not Configured"
            return if (key.length >= 16) {
                "${key.substring(0, 16)}••••••••"
            } else {
                "••••••••"
            }
        }

        val testKey = "otp_gw_test_0e150c1578291c5fa4b6ff78d9ddf7d867e37a79fe2e4e870611d3fbdf027d1c"
        val masked = maskKey(testKey)

        assertEquals("otp_gw_test_0e15••••••••", masked)
        assertFalse(masked.contains("0c1578291c5fa4b6"))
        assertEquals("Not Configured", maskKey(null))
        assertEquals("Not Configured", maskKey(""))
    }

    @Test
    fun testSmsEntityMappingWithGlobalJobId() {
        val entity = SmsEntity(
            phoneNumber = "+919876543210",
            message = "Your verification code is 123456",
            status = SmsStatus.SENDING,
            globalJobId = "56ee5a31-c79c-4000-b5a7-5edb908d60ef"
        )

        assertEquals("+919876543210", entity.phoneNumber)
        assertEquals(SmsStatus.SENDING, entity.status)
        assertEquals("56ee5a31-c79c-4000-b5a7-5edb908d60ef", entity.globalJobId)
    }
}
