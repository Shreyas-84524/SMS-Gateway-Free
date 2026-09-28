import https from 'https';

const BASE_URL = process.env.LIVE_VERIFY_URL || 'https://global-otp-service.vercel.app';
const PROJ_KEY = process.env.TEST_PROJECT_KEY || 'otp_proj_test_797efe3b1f10c5d2a5281065059af077d2187941a14d92c206281797fc8525b0';
const GW_KEY = process.env.TEST_GATEWAY_KEY || 'otp_gw_test_0e150c1578291c5fa4b6ff78d9ddf7d867e37a79fe2e4e870611d3fbdf027d1c';

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
}

function request<T = unknown>(path: string, options: RequestOptions): Promise<{ status: number; data: T }> {
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

async function runLiveVerification() {
  console.log('====================================================');
  console.log(`🚀 STARTING LIVE PRODUCTION VERIFICATION ON VERCEL`);
  console.log(`Target: ${BASE_URL}`);
  console.log('====================================================\n');

  // Test 1: Health Check
  console.log('▶ Test 1: GET /api/v1/health');
  const health = await request<any>('/api/v1/health', { method: 'GET' });
  assert(health.status === 200, `Health status code is 200 (received ${health.status})`);
  assert(health.data?.status === 'healthy', `Health status is 'healthy'`);
  assert(health.data?.services?.database === 'connected', `Database is 'connected'`);

  // Test 2: Project Authentication Failure (No Key)
  console.log('\n▶ Test 2: POST /api/v1/otp/send without API key');
  const noKey = await request<any>('/api/v1/otp/send', {
    method: 'POST',
    body: { phone_number: '+919999988888' },
  });
  assert(noKey.status === 401, `Rejected with 401 (received ${noKey.status})`);

  // Test 3: Project Authentication Failure (Invalid Key)
  console.log('\n▶ Test 3: POST /api/v1/otp/send with invalid API key');
  const invalidKey = await request<any>('/api/v1/otp/send', {
    method: 'POST',
    headers: { 'X-Project-Key': 'otp_proj_test_invalid0000000000000000000000000000000000000000000000000000' },
    body: { phone_number: '+919999988888' },
  });
  assert(invalidKey.status === 401, `Rejected with 401 (received ${invalidKey.status})`);

  // Test 4: Send OTP (Valid Project Key)
  const testPhone = `+9198765${Math.floor(10000 + Math.random() * 90000)}`;
  console.log(`\n▶ Test 4: POST /api/v1/otp/send for ${testPhone}`);
  const sendRes = await request<any>('/api/v1/otp/send', {
    method: 'POST',
    headers: { 'X-Project-Key': PROJ_KEY },
    body: { phone_number: testPhone },
  });
  assert(sendRes.status === 200, `Send OTP status code is 200 (received ${sendRes.status})`);
  const challengeId = sendRes.data?.data?.challenge_id || sendRes.data?.challenge_id || sendRes.data?.request_id;
  assert(!!challengeId, `challenge_id returned: ${challengeId}`);
  assert(sendRes.data?.otp === undefined && sendRes.data?.data?.otp === undefined, `CRITICAL SECURITY: Raw OTP is NOT leaked in API response`);

  // Test 5: Cooldown Enforcement (Immediate Retry for same phone)
  console.log('\n▶ Test 5: Cooldown enforcement (Immediate retry)');
  const cooldownRes = await request<any>('/api/v1/otp/send', {
    method: 'POST',
    headers: { 'X-Project-Key': PROJ_KEY },
    body: { phone_number: testPhone },
  });
  assert(cooldownRes.status === 429, `Immediate retry rejected with 429 (received ${cooldownRes.status})`);

  // Test 6: Gateway Authentication Failure (No Key)
  console.log('\n▶ Test 6: GET /api/v1/gateway/jobs without gateway key');
  const gwNoKey = await request<any>('/api/v1/gateway/jobs', { method: 'GET' });
  assert(gwNoKey.status === 401, `Rejected with 401 (received ${gwNoKey.status})`);

  // Test 7: Gateway Job Claim
  console.log('\n▶ Test 7: GET /api/v1/gateway/jobs (Gateway Job Claim)');
  const claimRes = await request<any>('/api/v1/gateway/jobs', {
    method: 'GET',
    headers: { 'X-Gateway-Key': GW_KEY },
  });
  assert(claimRes.status === 200, `Gateway jobs poll status code is 200 (received ${claimRes.status})`);
  const jobs = claimRes.data?.data?.jobs || claimRes.data?.jobs || [];
  assert(Array.isArray(jobs), `Jobs array returned`);
  assert(jobs.length > 0, `At least 1 job claimed (claimed ${jobs.length})`);

  const claimedJob = jobs.find((j: any) => j.phone_number === testPhone);
  assert(!!claimedJob, `Target job for ${testPhone} claimed`);
  const jobId = claimedJob?.job_id || claimedJob?.id;
  const message = claimedJob?.message || '';
  console.log(`  ℹ Claimed Job ID: ${jobId}`);
  console.log(`  ℹ Claimed SMS Message: "${message}"`);

  // Extract OTP from SMS text for verification test
  const otpMatch = message.match(/\b\d{6}\b/);
  const generatedOtp = otpMatch ? otpMatch[0] : null;
  assert(!!generatedOtp, `Extracted 6-digit OTP from SMS message: ${generatedOtp}`);

  // Test 8: Gateway Job Status Progression (CLAIMED -> SENDING -> SENT -> DELIVERED)
  if (jobId) {
    console.log('\n▶ Test 8: POST /api/v1/gateway/jobs/[jobId]/status (Status transitions)');
    const statusSending = await request<any>(`/api/v1/gateway/jobs/${jobId}/status`, {
      method: 'POST',
      headers: { 'X-Gateway-Key': GW_KEY },
      body: { status: 'SENDING' },
    });
    assert(statusSending.status === 200, `Transition to SENDING succeeded`);

    const statusSent = await request<any>(`/api/v1/gateway/jobs/${jobId}/status`, {
      method: 'POST',
      headers: { 'X-Gateway-Key': GW_KEY },
      body: { status: 'SENT' },
    });
    assert(statusSent.status === 200, `Transition to SENT succeeded`);

    const statusDelivered = await request<any>(`/api/v1/gateway/jobs/${jobId}/status`, {
      method: 'POST',
      headers: { 'X-Gateway-Key': GW_KEY },
      body: { status: 'DELIVERED' },
    });
    assert(statusDelivered.status === 200, `Transition to DELIVERED succeeded`);
  }

  // Test 9: Gateway Heartbeat
  console.log('\n▶ Test 9: POST /api/v1/gateway/heartbeat');
  const heartbeatRes = await request<any>('/api/v1/gateway/heartbeat', {
    method: 'POST',
    headers: { 'X-Gateway-Key': GW_KEY },
    body: {
      battery_pct: 95,
      sim_status: 'READY',
      app_version: '2.0.0-phase2-test',
      android_sdk: 34,
      model: 'Pixel 8 Pro (Cloud Test)',
    },
  });
  assert(heartbeatRes.status === 200, `Gateway heartbeat status code is 200`);
  assert(heartbeatRes.data?.success === true, `Heartbeat success is true`);
  assert(!!heartbeatRes.data?.data?.last_seen_at, `Gateway last_seen_at updated: ${heartbeatRes.data?.data?.last_seen_at}`);

  // Test 10: Verify OTP with Incorrect Code
  if (challengeId) {
    console.log('\n▶ Test 10: POST /api/v1/otp/verify with INCORRECT OTP');
    const wrongVerify = await request<any>('/api/v1/otp/verify', {
      method: 'POST',
      headers: { 'X-Project-Key': PROJ_KEY },
      body: {
        challenge_id: challengeId,
        phone_number: testPhone,
        code: '000000',
      },
    });
    assert(wrongVerify.status === 400, `Wrong OTP rejected with 400 (received ${wrongVerify.status})`);
    assert(wrongVerify.data?.error?.code === 'INVALID_OTP' || wrongVerify.data?.error?.attempts_remaining !== undefined,
      `Failure message returned with remaining attempts (${wrongVerify.data?.error?.attempts_remaining})`);

    // Test 11: Verify OTP with CORRECT Code
    if (generatedOtp) {
      console.log('\n▶ Test 11: POST /api/v1/otp/verify with CORRECT OTP');
      const correctVerify = await request<any>('/api/v1/otp/verify', {
        method: 'POST',
        headers: { 'X-Project-Key': PROJ_KEY },
        body: {
          challenge_id: challengeId,
          phone_number: testPhone,
          code: generatedOtp,
        },
      });
      assert(correctVerify.status === 200, `Correct OTP verified with 200 (received ${correctVerify.status})`);
      assert(correctVerify.data?.verified === true || correctVerify.data?.data?.verified === true, `Response verified === true`);

      // Test 12: Replay Attack Defense (Already Consumed)
      console.log('\n▶ Test 12: Replay Attack Defense (Consuming already consumed OTP)');
      const replayVerify = await request<any>('/api/v1/otp/verify', {
        method: 'POST',
        headers: { 'X-Project-Key': PROJ_KEY },
        body: {
          challenge_id: challengeId,
          phone_number: testPhone,
          code: generatedOtp,
        },
      });
      assert(replayVerify.status === 400, `Replay rejected with 400 (received ${replayVerify.status})`);
      assert(replayVerify.data?.error?.code === 'ALREADY_CONSUMED' || replayVerify.data?.error?.message?.includes('already been used'),
        `Replay rejected with consumed error: "${replayVerify.data?.error?.message || replayVerify.data?.error}"`);
    }
  }

  console.log('\n====================================================');
  console.log(`🏁 LIVE PRODUCTION VERIFICATION COMPLETE`);
  console.log(`Passed: ${passed} | Failed: ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveVerification().catch((err) => {
  console.error('Unhandled error during live verification:', err);
  process.exit(1);
});
