# Global OTP Service & Android SMS Gateway

![Global OTP Platform Banner](images/banner.png)

> **Active Branch:** `global-otp-service`  
> **Current Status:** **Phase 1: Architecture Conversion & Monorepo Foundation** (Architecture & Contracts Defined; Android app compiled & functional).

---

## 1. Overview & Evolution

This repository is evolving from a standalone, local Android HTTP SMS gateway into a multi-tenant, cloud-orchestrated **Global OTP Platform**.

### Future Target Architecture
In the target architecture, applications (e.g., CivicFix, Hostix) interact exclusively with a central **Global Cloud Backend** hosted on Vercel. The physical Android device functions as an **Outbound Gateway Worker**, polling for queued SMS jobs and dispatching them via its cellular SIM card.

```text
Any App / Project (CivicFix, Hostix)
        ↓ HTTPS POST /api/v1/otp/send (X-Project-Key)
Global Cloud Backend (Vercel + TypeScript)
        ↓
PostgreSQL DB (OTP Challenge Storage + Atomic SMS Job Queue)
        ↑
Android Gateway Worker (Outbound HTTPS Polling with X-Gateway-Key)
        ↓
Android SmsManager → Physical Carrier SIM
        ↓
Carrier SMS Network → User Handset
```

### Key Architectural Improvements
- **Zero Inbound Ingress on Phone:** Eliminates port forwarding, dynamic DNS, and ephemeral tunnels (Cloudflare Quick Tunnels / `trycloudflare.com`).
- **No Same-Wi-Fi Constraint:** The Android worker operates seamlessly over Wi-Fi or 4G/5G mobile data.
- **Always-On Cloud Backend:** Central Vercel serverless backend with Supabase PostgreSQL eliminates dependency on local development laptops.
- **Enterprise Security & Isolation:** Distinct credentials for client projects (`otp_proj_live_*`) vs gateway workers (`otp_gw_live_*`), CSPRNG tokens, and SHA-256 salted hashing.
- **Multi-Tenant Support:** One gateway infrastructure powers multiple independent applications with per-project quotas and isolated rate limits.
- **Android 15 Hardened Execution:** Compliant foreground service with graceful `Service.onTimeout` degradation under Android 15's 6-hour cumulative background limit, with event-driven push-wake planned for 24/7 unattended production.

---

## 2. Monorepo Structure & Status

| Directory | Purpose | Phase 1 Status |
| :--- | :--- | :--- |
| `app/` | Android Gateway Application & SMS Dispatcher | ✅ Audited & Functional (Compiles with Gradle) |
| `backend/` | Global Cloud Backend (Vercel Serverless / Next.js) | 📋 Architectural specification complete (Implementation in Phase 2) |
| `database/` | PostgreSQL DDL Schema & Migrations (`schema.sql`) | ✅ Schema & indexing strategy defined |
| `docs/` | Technical specifications & contracts | ✅ Complete specification suite |
| `scripts/` | Developer & Administrative utilities | 📋 Planned for Phases 2–4 |

---

## 3. Comprehensive Documentation Suite

Detailed architectural specifications are maintained in the [`docs/`](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/docs) directory:

- [**Target Architecture (`docs/architecture.md`)**](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/docs/architecture.md): Full end-to-end system design, component boundaries, and topology.
- [**Global API Contract (`docs/api-contract.md`)**](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/docs/api-contract.md): Complete specifications for `/api/v1/otp/*`, `/api/v1/gateway/*`, and admin endpoints.
- [**Data Model & Schema (`docs/data-model.md`)**](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/docs/data-model.md): Entity relationships, table schemas, and indexing strategy.
- [**Security & Authentication Model (`docs/security-model.md`)**](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/docs/security-model.md): Key entropy, SHA-256 salted OTP hashing, and credential isolation.
- [**Android Worker Strategy (`docs/android-worker.md`)**](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/docs/android-worker.md): Foreground Service polling loop, power management, and planned UI dashboard.
- [**Migration & Backward Compatibility Plan (`docs/migration-plan.md`)**](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/docs/migration-plan.md): Coexistence of `LOCAL_API` and `GLOBAL_WORKER` modes.
- [**Multi-Phase Roadmap (`docs/roadmap.md`)**](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/docs/roadmap.md): Multi-phase implementation timeline.

---

## 4. Multi-Phase Implementation Roadmap

```
[Phase 1: Architecture & Foundation]  <-- COMPLETED
        ↓
[Phase 2: Vercel Backend & PostgreSQL Database] (Next)
        ↓
[Phase 3: Android Gateway Worker Conversion]
        ↓
[Phase 4: Key Management & Admin/Gateway UI]
        ↓
[Phase 5: CivicFix Integration & Production Release]
```

*Note: Phase 1 establishes the architectural foundation and specifications. The Global Backend and Outbound Worker will be implemented in Phases 2 and 3.*

---

## 5. Current Working Android Gateway (Legacy Local / Development Mode)

During Phase 1, the existing Android HTTP server remains intact and fully functional for local development and direct debugging.

### Features
- **Android `SmsManager` Engine:** Single & multipart SMS transmission with delivery broadcast tracking.
- **Embedded Local HTTP Server:** NanoHTTPD listening on configurable port (default `8080`).
- **Room Database:** Local persistence for SMS transmission logs.
- **Foreground Service:** Sticky foreground service maintaining background execution.

### Local Endpoints (Legacy Server)
- `GET  /api/info` - Server health & info (unauthenticated)
- `POST /api/send` - Send single SMS (`{"phone_number": "...", "message": "..."}`)
- `POST /api/send-bulk` - Send bulk SMS batch
- `GET  /api/status?sms_id={id}` - Check SMS delivery status
- `GET  /api/history` - Retrieve local transmission history

### Building the Android App
```powershell
# Windows
.\gradlew.bat assembleDebug

# Linux / macOS
./gradlew assembleDebug
```

---

## 6. License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
