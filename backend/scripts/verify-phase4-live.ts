import https from 'https';

const BASE_URL = 'https://global-otp-service.vercel.app';
const CIVICFIX_PROJECT_KEY = 'otp_proj_live_f3ad845f601274b388d0641136d8822d283a4cc335aedb3ac580bc8901e7559d';
const DEV_PROJECT_KEY = 'otp_proj_test_797efe3b1f10c5d2a5281065059af077d2187941a14d92c206281797fc8525b0';
const GW_KEY = 'otp_gw_test_0e150c1578291c5fa4b6ff78d9ddf7d867e37a79fe2e4e870611d3fbdf027d1c';

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
}

function request<T = any>(path: string, options: RequestOptions): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const bodyData = options.body ? JSON.stringify(options.body) : null;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (bodyData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyData).toString();
    }

    const req = https.request(
      url,
      {
        method: options.method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const data = raw ? JSON.parse(raw) : null;
            resolve({ status: res.statusCode || 0, data });
          } catch {
            resolve({ status: res.statusCode || 0, data: raw as unknown as T });
          }
        });
      }
    );

    req.on('error', reject);
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${description}`);
    failed++;
  }
}

async function run() {
  console.log('===============================================================');
  console.log('       Global OTP Platform — Phase 4 Live Production Test      ');
  console.log('===============================================================\n');

  // 1. Health check
  console.log('▶ 1. Health & Database Connectivity');
  const health = await request('/api/v1/health', { method: 'GET' });
  assert(health.status === 200, 'Health endpoint returns HTTP 200');
  assert(health.data.status === 'healthy', 'System status is healthy');
  assert(health.data.services.database === 'connected', 'Database is connected');

  // 2. CivicFix Project Authentication & Send OTP
  console.log('\n▶ 2. CivicFix Production Project Authentication & Send');
  const testPhone = '+919876543299';
  const idempotencyKey = `e2e_idemp_${Date.now()}`;
  const sendRes = await request('/api/v1/otp/send', {
    method: 'POST',
    headers: {
      'X-Project-Key': CIVICFIX_PROJECT_KEY,
      'Idempotency-Key': idempotencyKey,
    },
    body: {
      phone: testPhone,
      metadata: { source: 'phase4_verify' },
    },
  });

  assert(sendRes.status === 200, 'CivicFix key creates OTP challenge (HTTP 200)');
  assert(!!sendRes.data.request_id, 'Returns challenge request_id');
  assert(sendRes.data.expires_in === 300, 'Configured expiry_seconds is 300');
  const civicfixReqId = sendRes.data.request_id;

  // 3. Idempotency Replay Test
  console.log('\n▶ 3. Idempotent Replay Safety');
  const replayRes = await request('/api/v1/otp/send', {
    method: 'POST',
    headers: {
      'X-Project-Key': CIVICFIX_PROJECT_KEY,
      'Idempotency-Key': idempotencyKey,
    },
    body: {
      phone: testPhone,
      metadata: { source: 'phase4_verify_replay' },
    },
  });
  assert(replayRes.status === 200, 'Replay with same idempotency key returns HTTP 200');
  assert(replayRes.data.request_id === civicfixReqId, 'Replay returns identical challenge request_id without duplicate queueing');

  // 4. Multi-Project Isolation Verification
  console.log('\n▶ 4. Strict Multi-Project Isolation');
  // Dev project cannot verify CivicFix challenge
  const crossVerify = await request('/api/v1/otp/verify', {
    method: 'POST',
    headers: {
      'X-Project-Key': DEV_PROJECT_KEY,
    },
    body: {
      phone: testPhone,
      request_id: civicfixReqId,
      otp: '123456',
    },
  });
  assert(crossVerify.status === 404, 'Dev project key CANNOT access or verify CivicFix challenge (HTTP 404)');

  // CivicFix key cannot authenticate gateway endpoints
  const gwAccessAttempt = await request('/api/v1/gateway/jobs', {
    method: 'GET',
    headers: {
      'X-Gateway-Key': CIVICFIX_PROJECT_KEY,
    },
  });
  assert(gwAccessAttempt.status === 401, 'CivicFix project key CANNOT authenticate gateway queue (HTTP 401)');

  // 5. Wrong OTP Verification
  console.log('\n▶ 5. Wrong OTP Verification & Attempt Tracking');
  const wrongVerify = await request('/api/v1/otp/verify', {
    method: 'POST',
    headers: {
      'X-Project-Key': CIVICFIX_PROJECT_KEY,
    },
    body: {
      phone: testPhone,
      request_id: civicfixReqId,
      otp: '000000',
    },
  });
  assert(wrongVerify.status === 400, 'Wrong OTP rejected with HTTP 400');
  assert(wrongVerify.data.verified === false, 'verified is false');
  assert(wrongVerify.data.error?.code === 'INVALID_OTP', 'Error code is INVALID_OTP');
  assert(wrongVerify.data.error?.attempts_remaining === 2, 'Attempts remaining is 2');

  // 6. Gateway Claiming CivicFix Job
  console.log('\n▶ 6. Gateway Job Claiming from SMS Queue');
  const claimRes = await request('/api/v1/gateway/jobs?limit=5', {
    method: 'GET',
    headers: {
      'X-Gateway-Key': GW_KEY,
    },
  });
  assert(claimRes.status === 200, 'Gateway successfully claims jobs (HTTP 200)');
  const claimedJobs = claimRes.data.data?.jobs || [];
  const civicfixJob = claimedJobs.find((j: any) => j.job_id);
  assert(claimedJobs.length > 0, `Gateway claimed ${claimedJobs.length} queued SMS job(s)`);

  if (civicfixJob) {
    // 1. Update status to SENDING
    const statusSending = await request(`/api/v1/gateway/jobs/${civicfixJob.job_id}/status`, {
      method: 'POST',
      headers: { 'X-Gateway-Key': GW_KEY },
      body: { status: 'SENDING' },
    });
    assert(statusSending.status === 200, 'Gateway updated job status to SENDING');

    // 2. Update status to SENT
    const statusSent = await request(`/api/v1/gateway/jobs/${civicfixJob.job_id}/status`, {
      method: 'POST',
      headers: { 'X-Gateway-Key': GW_KEY },
      body: { status: 'SENT' },
    });
    assert(statusSent.status === 200, 'Gateway updated job status to SENT');

    // 3. Update status to DELIVERED
    const statusDelivered = await request(`/api/v1/gateway/jobs/${civicfixJob.job_id}/status`, {
      method: 'POST',
      headers: { 'X-Gateway-Key': GW_KEY },
      body: { status: 'DELIVERED' },
    });
    assert(statusDelivered.status === 200, 'Gateway updated job status to DELIVERED');
  }

  console.log('\n===============================================================');
  console.log(`Live Verification Complete: ${passed} / ${passed + failed} Passed`);
  console.log('===============================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
