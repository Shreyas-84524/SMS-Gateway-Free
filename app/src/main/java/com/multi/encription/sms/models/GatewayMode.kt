package com.multi.encription.sms.models

/**
 * Operating mode of the SMS Gateway application.
 */
enum class GatewayMode {
    /**
     * Legacy mode: Embedded NanoHTTPD server listening on local port (default 8080).
     * Requires inbound connectivity / local Wi-Fi / Cloudflare tunnel.
     */
    LOCAL_API,

    /**
     * Modern global mode: Outbound HTTPS background worker polling the cloud queue.
     * Connects outbound to Vercel/Supabase backend; zero port-forwarding or local tunnels required.
     */
    GLOBAL_WORKER
}
