package com.multi.encription.sms.utils

import android.content.Context
import android.content.SharedPreferences
import com.multi.encription.sms.models.GatewayMode
import java.util.UUID

class ConfigManager(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val secureStorage: SecureStorageManager = SecureStorageManager(context)

    companion object {
        private const val PREFS_NAME = "sms_gateway_config"
        private const val KEY_API_KEY = "api_key"
        private const val KEY_SERVER_PORT = "server_port"
        private const val KEY_SERVER_ENABLED = "server_enabled"
        private const val KEY_RATE_LIMIT_ENABLED = "rate_limit_enabled"
        private const val KEY_RATE_LIMIT_PER_MINUTE = "rate_limit_per_minute"
        private const val KEY_RATE_LIMIT_PER_HOUR = "rate_limit_per_hour"
        private const val KEY_AUTO_DELETE_OLD_SMS = "auto_delete_old_sms"
        private const val KEY_AUTO_DELETE_DAYS = "auto_delete_days"
        private const val KEY_NOTIFICATION_ENABLED = "notification_enabled"
        private const val KEY_EXTERNAL_DOMAIN = "external_domain"
        private const val KEY_USE_EXTERNAL_DOMAIN = "use_external_domain"

        // Phase 3 Configuration Keys
        private const val KEY_GATEWAY_MODE = "gateway_mode"
        private const val KEY_WORKER_ENABLED = "worker_enabled"
        private const val KEY_GLOBAL_BACKEND_URL = "global_backend_url"
        private const val KEY_POLLING_INTERVAL_SECONDS = "polling_interval_seconds"
        private const val KEY_PREFERRED_SUBSCRIPTION_ID = "preferred_subscription_id"
        private const val KEY_REQUEST_DELIVERY_REPORTS = "request_delivery_reports"

        const val DEFAULT_PORT = 8080
        const val DEFAULT_RATE_LIMIT_PER_MINUTE = 10
        const val DEFAULT_RATE_LIMIT_PER_HOUR = 100
        const val DEFAULT_AUTO_DELETE_DAYS = 30
        const val DEFAULT_GLOBAL_BACKEND_URL = "https://global-otp-service.vercel.app"
        const val DEFAULT_POLLING_INTERVAL_SECONDS = 5
        const val DEFAULT_REQUEST_DELIVERY_REPORTS = false
    }

    // Delivery report flag (TP-SRR). Disabled by default to avoid carrier RIL rejects (e.g. error 124 on Airtel)
    var requestDeliveryReports: Boolean
        get() = prefs.getBoolean(KEY_REQUEST_DELIVERY_REPORTS, DEFAULT_REQUEST_DELIVERY_REPORTS)
        set(value) = prefs.edit().putBoolean(KEY_REQUEST_DELIVERY_REPORTS, value).apply()

    // Preferred SIM Subscription ID (for Multi-SIM devices)
    var preferredSubscriptionId: Int?
        get() {
            val subId = prefs.getInt(KEY_PREFERRED_SUBSCRIPTION_ID, -1)
            return if (subId > 0) subId else null
        }
        set(value) {
            if (value != null && value > 0) {
                prefs.edit().putInt(KEY_PREFERRED_SUBSCRIPTION_ID, value).apply()
            } else {
                prefs.edit().remove(KEY_PREFERRED_SUBSCRIPTION_ID).apply()
            }
        }

    // Operating Mode (LOCAL_API vs GLOBAL_WORKER)
    var gatewayMode: GatewayMode
        get() {
            val modeStr = prefs.getString(KEY_GATEWAY_MODE, GatewayMode.GLOBAL_WORKER.name)
            return try {
                GatewayMode.valueOf(modeStr ?: GatewayMode.GLOBAL_WORKER.name)
            } catch (e: Exception) {
                GatewayMode.GLOBAL_WORKER
            }
        }
        set(value) = prefs.edit().putString(KEY_GATEWAY_MODE, value.name).apply()

    // Global Outbound Worker Enable/Disable State
    var isWorkerEnabled: Boolean
        get() = prefs.getBoolean(KEY_WORKER_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_WORKER_ENABLED, value).apply()

    // Global Backend URL
    var globalBackendUrl: String
        get() = normalizeBackendUrl(prefs.getString(KEY_GLOBAL_BACKEND_URL, DEFAULT_GLOBAL_BACKEND_URL) ?: DEFAULT_GLOBAL_BACKEND_URL)
        set(value) = prefs.edit().putString(KEY_GLOBAL_BACKEND_URL, normalizeBackendUrl(value)).apply()

    var pollingIntervalSeconds: Int
        get() = prefs.getInt(KEY_POLLING_INTERVAL_SECONDS, DEFAULT_POLLING_INTERVAL_SECONDS)
        set(value) = prefs.edit().putInt(KEY_POLLING_INTERVAL_SECONDS, value.coerceIn(3, 60)).apply()

    // Legacy Local Server Settings
    var apiKey: String
        get() = prefs.getString(KEY_API_KEY, null) ?: generateAndSaveApiKey()
        set(value) = prefs.edit().putString(KEY_API_KEY, value).apply()

    var serverPort: Int
        get() = prefs.getInt(KEY_SERVER_PORT, DEFAULT_PORT)
        set(value) = prefs.edit().putInt(KEY_SERVER_PORT, value).apply()

    var isServerEnabled: Boolean
        get() = prefs.getBoolean(KEY_SERVER_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_SERVER_ENABLED, value).apply()

    var isRateLimitEnabled: Boolean
        get() = prefs.getBoolean(KEY_RATE_LIMIT_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_RATE_LIMIT_ENABLED, value).apply()

    var rateLimitPerMinute: Int
        get() = prefs.getInt(KEY_RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT_PER_MINUTE)
        set(value) = prefs.edit().putInt(KEY_RATE_LIMIT_PER_MINUTE, value).apply()

    var rateLimitPerHour: Int
        get() = prefs.getInt(KEY_RATE_LIMIT_PER_HOUR, DEFAULT_RATE_LIMIT_PER_HOUR)
        set(value) = prefs.edit().putInt(KEY_RATE_LIMIT_PER_HOUR, value).apply()

    var isAutoDeleteOldSmsEnabled: Boolean
        get() = prefs.getBoolean(KEY_AUTO_DELETE_OLD_SMS, true)
        set(value) = prefs.edit().putBoolean(KEY_AUTO_DELETE_OLD_SMS, value).apply()

    var autoDeleteDays: Int
        get() = prefs.getInt(KEY_AUTO_DELETE_DAYS, DEFAULT_AUTO_DELETE_DAYS)
        set(value) = prefs.edit().putInt(KEY_AUTO_DELETE_DAYS, value).apply()

    var isNotificationEnabled: Boolean
        get() = prefs.getBoolean(KEY_NOTIFICATION_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_NOTIFICATION_ENABLED, value).apply()

    var externalDomain: String
        get() = prefs.getString(KEY_EXTERNAL_DOMAIN, "") ?: ""
        set(value) = prefs.edit().putString(KEY_EXTERNAL_DOMAIN, value).apply()

    var useExternalDomain: Boolean
        get() = prefs.getBoolean(KEY_USE_EXTERNAL_DOMAIN, false)
        set(value) = prefs.edit().putBoolean(KEY_USE_EXTERNAL_DOMAIN, value).apply()

    fun getApiBaseUrl(localIp: String): String {
        return if (useExternalDomain && externalDomain.isNotBlank()) {
            if (externalDomain.startsWith("http")) {
                externalDomain
            } else {
                "https://$externalDomain"
            }
        } else {
            "http://$localIp:$serverPort"
        }
    }

    private fun generateAndSaveApiKey(): String {
        val newApiKey = "sms_" + UUID.randomUUID().toString().replace("-", "")
        apiKey = newApiKey
        return newApiKey
    }

    fun regenerateApiKey(): String {
        return generateAndSaveApiKey()
    }

    fun resetToDefaults() {
        prefs.edit().clear().apply()
        secureStorage.clearGatewayKey()
    }

    /**
     * Sanitizes backend URLs: removes trailing slashes, ensures https:// prefix when missing scheme.
     */
    fun normalizeBackendUrl(url: String): String {
        var trimmed = url.trim()
        if (trimmed.isBlank()) {
            return DEFAULT_GLOBAL_BACKEND_URL
        }
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            trimmed = "https://$trimmed"
        }
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length - 1)
        }
        return trimmed
    }
}
