# Global OTP Service & Android SMS Gateway

![Global OTP Platform Banner](images/banner.png)

> **Active Branch:** `global-otp-service`  
> **Current Status:** **Phase 5: Production Ready & Validated**  
> **Production API:** `https://global-otp-service.vercel.app`

---

## 1. Overview & Architecture

The **Global OTP Service** is an enterprise-grade, multi-tenant OTP and SMS delivery system. It decouples high-security OTP lifecycle management (CSPRNG generation, SHA-256 salted hashing, timing-safe verification, rate limiting, and challenge expiration) from physical cellular SMS transport.

```text
Any Client App (CivicFix, Hostix, Web, Mobile)
        ↓ HTTPS POST /api/v1/otp/send (X-Project-Key: otp_proj_live_*)
Global Cloud Backend (Vercel Serverless / Next.js + TypeScript)
        ↓
PostgreSQL DB (CSPRNG OTP Storage + SKIP LOCKED Atomic Job Queue)
        ↑
Android Gateway Worker (HTTPS Polling with X-Gateway-Key: otp_gw_live_*)
        ↓
Android SmsManager → Physical Carrier SIM (Airtel / Jio 4G/5G)
        ↓
Carrier SMS Network → User Handset
```

### Key Capabilities & Security Guarantees
- **Zero Inbound Ingress on Device:** Android gateway connects exclusively via outbound HTTPS requests. No public IP, dynamic DNS, or ephemeral tunnels required.
- **Enterprise Multi-Tenancy:** Distinct credentials for client projects (`otp_proj_live_*`) and gateway workers (`otp_gw_live_*`). Raw keys are never stored in plaintext (SHA-256 hashed at rest).
- **Authoritative Server-Side Templates:** Projects define custom templates with `{OTP}`, `{EXPIRY_MINUTES}`, `{PROJECT_NAME}` placeholders. Arbitrary client payload injection is strictly prohibited.
- **High-Concurrency Queue:** PostgreSQL `SKIP LOCKED` atomic job claiming with automatic stale lease recovery and backend challenge expiration.
- **Cryptographic Security:** CSPRNG OTP generation with per-challenge random salts and `crypto.timingSafeEqual` comparison to prevent timing side-channel attacks. Single-use enforcement and maximum 3-attempt invalidation.
- **Android 15 Hardened:** Compliant foreground service with graceful `Service.onTimeout(int, int)` shutdown handling under Android 15's 6-hour cumulative background limit.
- **Carrier Compatibility:** Optimized modem result handling (`deliveredIntent = null`) preventing carrier RIL error 124 on consumer Indian carrier SIMs (Airtel/Jio).

---

## 2. Monorepo Structure

| Directory | Purpose | Status |
| :--- | :--- | :--- |
| [`app/`](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/app) | Android Gateway App & SMS Dispatcher (`GLOBAL_WORKER` & `LOCAL_API` modes) | ✅ Verified (55 Gradle tasks passing, APK buildable) |
| [`backend/`](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/backend) | Global Cloud Backend (Vercel Next.js / TypeScript / Supabase PG) | ✅ Deployed & Verified (59/59 unit/integration tests passing) |
| [`database/`](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/database) | PostgreSQL DDL Schema, Indexing & Seed Migrations (`schema.sql`) | ✅ Applied & Active |
| [`docs/`](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/docs) | Complete technical documentation, guides, and specifications | ✅ Up to date |
| [`scripts/`](file:///c:/Learning%20some%20new%20stuf/SPP/SMS-Gateway-Free/scripts) | Developer, Admin, and Provisioning CLI utilities | ✅ Operational |

---

## 3. Documentation Suite

- [**Client Integration Guide (`docs/integration-guide.md`)**](docs/integration-guide.md) — How client applications integrate with `/api/v1/otp/*`, authentication, templates, rate limits, and TypeScript/Dart examples.
- [**Android Gateway Operations Guide (`docs/android-gateway-operations.md`)**](docs/android-gateway-operations.md) — Physical device setup, carrier SIM requirements, Android 15 execution constraints, RIL error decoder, and troubleshooting.
- [**Target Architecture (`docs/architecture.md`)**](docs/architecture.md) — Comprehensive system architecture, component boundaries, and security design.
- [**Global API Contract (`docs/api-contract.md`)**](docs/api-contract.md) — Full OpenAPI-style endpoint contracts for OTP, Gateway, and Admin APIs.
- [**Data Model & Schema (`docs/data-model.md`)**](docs/data-model.md) — Entity relationships, PostgreSQL schemas, and indexing strategies.
- [**Security & Authentication Model (`docs/security-model.md`)**](docs/security-model.md) — Key entropy, hashing schemes, and rate limiting algorithms.
- [**Android Worker Strategy (`docs/android-worker.md`)**](docs/android-worker.md) — Polling lifecycle, power management, and foreground service architecture.
- [**Migration & Backward Compatibility (`docs/migration-plan.md`)**](docs/migration-plan.md) — Legacy local NanoHTTPD vs Global Worker mode coexistence.

---

## 4. Quick Start & Verification

### Running Backend Tests & Compilation
```bash
cd backend
npm install
npm test       # 59 automated test suites
npm run build  # Production Next.js build
```

### Building Android Gateway APK
```powershell
# Windows
.\gradlew.bat test
.\gradlew.bat assembleDebug

# Linux / macOS
./gradlew test
./gradlew assembleDebug
```

### Health Check
```bash
curl https://global-otp-service.vercel.app/api/v1/health
```

---

## 5. License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
