# Global OTP Service — Client Integration Guide

This guide explains how external client projects (such as CivicFix, Hostix, or any web/mobile application) integrate with the multi-tenant **Global OTP Service**.

---

## 1. Overview & Architecture

The Global OTP Service decouples OTP challenge generation, rate limiting, and SMS delivery from individual frontend/backend apps.

```text
+-------------------+             +-----------------------+             +-----------------------+
|  Client Backend   |             |   Global OTP Backend  |             | Android SMS Gateway   |
| (e.g. Supabase /  |             |  (Vercel Serverless)  |             | (Physical SIM Device) |
|   Node.js / Go)   |             +-----------------------+             +-----------------------+
+---------+---------+                         |                                     |
          |                                   |                                     |
          | 1. POST /api/v1/otp/send          |                                     |
          |    (X-Project-Key, phone)         |                                     |
          +---------------------------------->|                                     |
          |                                   | 2. Store hashed OTP                 |
          |                                   |    Enforce Rate Limits              |
          |                                   |    Enqueue SMS Dispatch Job         |
          | 3. Response: { success,           |                                     |
          |    challenge_id, expires_at }     |                                     |
          |<----------------------------------+                                     |
          |                                   |                                     |
          |                                   | 4. GET /api/v1/gateway/jobs/claim   |
          |                                   |<------------------------------------+
          |                                   | 5. Job { job_id, phone, text }      |
          |                                   +------------------------------------>|
          |                                   |                                     |
          |                                   |                                     | 6. Physical SIM Dispatch
          |                                   | 7. POST /jobs/{id}/result (SENT)    |    via SmsManager
          |                                   |<------------------------------------+
          |                                   |                                     |
          | 8. POST /api/v1/otp/verify        |                                     |
          |    (X-Project-Key, challenge_id,  |                                     |
          |     otp_code)                     |                                     |
          +---------------------------------->|                                     |
          |                                   | 9. Timing-safe Hash Compare         |
          | 10. Response: { verified: true }  |    Consume Challenge (Single-Use)   |
          |<----------------------------------+                                     |
```

---

## 2. Authentication & Provisioning

All project requests must authenticate using the `X-Project-Key` HTTP header.

### Key Format
- Live Project API Keys follow the prefix: `otp_proj_live_<40-hex-chars>`
- The raw key is only shown **once** upon project registration.
- The backend stores only the SHA-256 hash (`sha256(raw_key)`).

### Project Registration (Admin Tooling)
Projects are created via the database seed/migration or the backend provisioning utility:

```sql
INSERT INTO projects (
    id,
    name,
    slug,
    api_key_hash,
    status,
    config
) VALUES (
    'proj_civicfix_prod',
    'CivicFix',
    'civicfix',
    encode(sha256('otp_proj_live_YOUR_RAW_KEY_HERE'::bytea), 'hex'),
    'ACTIVE',
    '{
      "otp_length": 6,
      "otp_expiry_seconds": 300,
      "max_verify_attempts": 3,
      "rate_limits": {
        "per_phone_window_seconds": 60,
        "per_phone_max_requests": 1,
        "per_phone_hourly_max": 5,
        "per_ip_hourly_max": 20
      },
      "sms_template": "Hello Customer, your CivicFix OTP is {OTP} and is valid for the next {EXPIRY_MINUTES} minutes. Thank you for contributing to a better Mumbai. - Team Civic Sense"
    }'::jsonb
);
```

---

## 3. Dynamic SMS Templates

Projects can customize the outgoing SMS text while retaining strict server-side template rendering.

### Supported Placeholders
- `{OTP}` — The generated 6-digit numeric OTP.
- `{EXPIRY_MINUTES}` — Expiry duration in minutes (e.g., `5`).
- `{PROJECT_NAME}` — Registered project display name.

### Safety Guarantees
- Raw OTPs are rendered server-side; clients cannot submit arbitrary text to prevent SMS phishing / spam abuse.
- Total rendered message length must be $\le 300$ characters.

---

## 4. API Endpoints

### Base URL
- **Production:** `https://global-otp-service.vercel.app`

---

### A. Send OTP (`POST /api/v1/otp/send`)

Generates a secure OTP, enqueues an SMS job, and returns challenge metadata.

#### Request Headers
```http
Content-Type: application/json
X-Project-Key: otp_proj_live_YOUR_PROJECT_KEY
Idempotency-Key: optional-uuid-v4-client-key
```

#### Request Body
```json
{
  "phone_number": "+919876543210",
  "client_reference_id": "civicfix-auth-req-12345"
}
```

#### Field Specifications
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `phone_number` | string | Yes | E.164 formatted recipient phone number (e.g. `+919876543210`). |
| `client_reference_id` | string | No | Optional idempotency or client audit tracking ID (max 128 chars). |

#### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "challenge_id": "c7a8e520-2ff4-4b53-913f-e1488c9dfa51",
    "expires_at": "2026-09-28T14:05:00.000Z",
    "retry_after_seconds": 60
  }
}
```

#### Error Responses
- `400 Bad Request` — Invalid phone number format or invalid payload.
- `401 Unauthorized` — Invalid or revoked `X-Project-Key`.
- `429 Too Many Requests` — Rate limit exceeded:
  ```json
  {
    "success": false,
    "error": {
      "code": "RATE_LIMIT_EXCEEDED",
      "message": "Too many OTP requests for this phone number. Please wait before retrying.",
      "retry_after_seconds": 45
    }
  }
  ```

---

### B. Verify OTP (`POST /api/v1/otp/verify`)

Validates an OTP submitted by the user.

#### Request Headers
```http
Content-Type: application/json
X-Project-Key: otp_proj_live_YOUR_PROJECT_KEY
```

#### Request Body
```json
{
  "challenge_id": "c7a8e520-2ff4-4b53-913f-e1488c9dfa51",
  "otp": "133269"
}
```

#### Field Specifications
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `challenge_id` | string (UUID) | Yes | Challenge ID returned from `/api/v1/otp/send`. |
| `otp` | string | Yes | 6-digit numeric OTP code entered by the user. |

#### Response (`200 OK` — Verified)
```json
{
  "success": true,
  "data": {
    "verified": true,
    "phone_number": "+919876543210",
    "verified_at": "2026-09-28T14:02:15.000Z"
  }
}
```

#### Response (`400 Bad Request` — Invalid / Expired)
```json
{
  "success": false,
  "error": {
    "code": "OTP_INVALID",
    "message": "Invalid verification code. 2 attempts remaining."
  }
}
```

---

### C. Health Check (`GET /api/v1/health`)

Unauthenticated diagnostic endpoint to verify service and database health.

#### Response (`200 OK`)
```json
{
  "status": "healthy",
  "timestamp": "2026-09-28T14:00:00.000Z",
  "database": "connected",
  "active_gateways": 1,
  "version": "1.0.0"
}
```

---

## 5. Security Best Practices for Integrators

1. **Keep Project Keys on the Server-Side:**  
   Never embed `X-Project-Key` in Flutter, React Native, or Web frontend bundles. Route all OTP requests through your trusted backend (e.g. Supabase Edge Functions, Node.js API, Firebase Cloud Functions).

2. **Handle Rate Limiting Gracefully:**  
   Inspect HTTP 429 response `retry_after_seconds` and disable resend buttons on the UI until the cooldown period expires.

3. **Single-Use Challenge Guarantee:**  
   Once verified, a `challenge_id` is immediately invalidated (`consumed_at` timestamp recorded). Replay attempts will return `OTP_EXPIRED_OR_CONSUMED`.

4. **Max Verification Attempts:**  
   Each challenge allows a maximum of 3 failed verification attempts before permanent invalidation.

---

## 6. Code Examples

### TypeScript / Supabase Edge Functions (e.g. CivicFix)

```typescript
// supabase/functions/_shared/global-otp-client.ts
export class GlobalOtpClient {
  private readonly baseUrl: string;
  private readonly projectKey: string;

  constructor(baseUrl: string, projectKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.projectKey = projectKey;
  }

  async sendOtp(phoneNumber: string, clientReferenceId?: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/otp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': this.projectKey,
      },
      body: JSON.stringify({
        phone_number: phoneNumber,
        client_reference_id: clientReferenceId,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to send OTP');
    }
    return data.data; // { challenge_id, expires_at, retry_after_seconds }
  }

  async verifyOtp(challengeId: string, otp: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/otp/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': this.projectKey,
      },
      body: JSON.stringify({
        challenge_id: challengeId,
        otp: otp,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Verification failed');
    }
    return data.data; // { verified: true, phone_number, verified_at }
  }
}
```
