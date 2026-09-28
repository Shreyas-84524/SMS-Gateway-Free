# Global OTP Platform — Cloud Backend

## 1. Overview
The Global OTP Cloud Backend is a multi-tenant, serverless API designed for deployment on **Vercel**, backed by a **PostgreSQL** database (Supabase or Neon).

## 2. Technology Stack Selection & Justification

| Layer | Selected Technology | Rationale |
| :--- | :--- | :--- |
| **Runtime / Platform** | **Vercel Serverless (Node.js / Edge)** | Zero server maintenance, free hobby/student tier, automated CI/CD deployments from Git, global CDN edge routing, zero-config HTTPS. |
| **Language** | **TypeScript** | Strict static type checking, shared types between contracts and backend logic, rich modern ecosystem. |
| **API Framework** | **Next.js Route Handlers / Fastify** | Lightweight, high-performance request processing, zero cold-start overhead with Vercel Edge/Serverless functions. |
| **Database** | **PostgreSQL on Supabase** (Recommended) | - Free tier with 500MB storage (adequate for millions of OTP challenge records)<br>- Built-in connection pooling (Supavisor)<br>- Rich dashboard for monitoring records and inspecting queues<br>- Native JSONB, UUID, and `SKIP LOCKED` concurrency support |
| **ORM / Query Builder** | **Kysely / Drizzle ORM** | Type-safe, ultra-lightweight SQL query builders with minimal runtime overhead and zero binary engine dependencies (ideal for serverless cold starts). |

## 3. Directory Structure (To Be Implemented in Phase 2)

```text
backend/
├── src/
│   ├── app/                      # Next.js App Router API endpoints
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── otp/
│   │   │   │   │   ├── send/route.ts
│   │   │   │   │   └── verify/route.ts
│   │   │   │   ├── gateway/
│   │   │   │   │   ├── jobs/
│   │   │   │   │   │   ├── route.ts
│   │   │   │   │   │   └── [jobId]/status/route.ts
│   │   │   │   │   └── heartbeat/route.ts
│   │   │   │   └── health/route.ts
│   ├── lib/
│   │   ├── db/                   # Database client & connection pooling
│   │   ├── auth/                 # API key verification & SHA-256 hashing
│   │   ├── otp/                  # CSPRNG generation & salt hashing
│   │   └── queue/                # Job lease manager & sweeper
│   └── types/                    # Shared TypeScript interfaces
├── package.json
├── tsconfig.json
└── vercel.json
```

*Note: Phase 1 establishes the architectural foundation. Full backend source implementation will occur in Phase 2.*
