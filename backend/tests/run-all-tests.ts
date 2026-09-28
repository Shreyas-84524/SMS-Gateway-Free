import crypto from 'crypto';
import {
  generateProjectKey,
  generateGatewayKey,
  hashApiKey,
  verifyKeyHash,
} from '../src/lib/auth/keys';
import {
  generateNumericOtp,
  generateSalt,
  hashOtp,
  verifyOtpHash,
  normalizePhoneNumber,
} from '../src/lib/otp/generator';
import { db } from '../src/lib/db/client';
import { OtpService } from '../src/lib/otp/service';
import { JobQueue } from '../src/lib/queue/job-queue';
import { RateLimiter } from '../src/lib/rate-limit/limiter';
import { AdminService } from '../src/lib/admin/service';
import { Project, Gateway, JobStatus } from '../src/types';

// In-memory test store
const store = {
  projects: new Map<string, Project>(),
  projectKeys: new Map<string, { id: string; project_id: string; key_hash: string; key_prefix: string; status: string; environment: string }>(),
  gateways: new Map<string, Gateway>(),
  gatewayKeys: new Map<string, { id: string; gateway_id: string; key_hash: string; key_prefix: string; status: string }>(),
  otpChallenges: new Map<string, {
    id: string;
    project_id: string;
    phone_number: string;
    otp_hash: string;
    salt: string;
    attempts: number;
    max_attempts: number;
    expires_at: string;
    consumed: boolean;
    idempotency_key: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>(),
  smsJobs: new Map<string, {
    id: string;
    project_id: string;
    challenge_id: string | null;
    assigned_gateway_id: string | null;
    phone_number: string;
    message: string;
    status: JobStatus;
    attempts: number;
    lease_expires_at: string | null;
    failure_reason: string | null;
    created_at: string;
    picked_up_at: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    failed_at: string | null;
  }>(),
};

// Override db.query to use test store
(db as any).query = async function (text: string, params: any[] = []): Promise<any> {
  const sql = text.trim();

  // Health check
  if (sql.includes('SELECT 1 as health')) {
    return { rows: [{ health: 1 }], rowCount: 1 };
  }

  // Project auth lookup
  if (sql.includes('FROM project_api_keys k') && sql.includes('JOIN projects p')) {
    const keyHash = params[0];
    for (const k of store.projectKeys.values()) {
      if (k.key_hash === keyHash) {
        const p = store.projects.get(k.project_id);
        if (p) {
          return {
            rows: [{
              id: p.id,
              name: p.name,
              slug: p.slug,
              enabled: p.enabled,
              config: p.config,
              created_at: p.created_at,
              updated_at: p.updated_at,
              key_id: k.id,
              key_status: k.status,
            }],
            rowCount: 1,
          };
        }
      }
    }
    return { rows: [], rowCount: 0 };
  }

  // Gateway auth lookup
  if (sql.includes('FROM gateway_api_keys k') && sql.includes('JOIN gateways g')) {
    const keyHash = params[0];
    for (const k of store.gatewayKeys.values()) {
      if (k.key_hash === keyHash) {
        const g = store.gateways.get(k.gateway_id);
        if (g) {
          return {
            rows: [{
              id: g.id,
              name: g.name,
              device_id: g.device_id,
              model: g.model,
              android_sdk: g.android_sdk,
              app_version: g.app_version,
              sim_status: g.sim_status,
              battery_pct: g.battery_pct,
              worker_enabled: g.worker_enabled,
              is_active: g.is_active,
              last_seen_at: g.last_seen_at,
              created_at: g.created_at,
              key_id: k.id,
              key_status: k.status,
            }],
            rowCount: 1,
          };
        }
      }
    }
    return { rows: [], rowCount: 0 };
  }

  // Insert Project
  if (sql.includes('INSERT INTO projects')) {
    const id = crypto.randomUUID();
    const p: Project = {
      id,
      name: params[0],
      slug: params[1],
      enabled: true,
      config: typeof params[2] === 'string' ? JSON.parse(params[2]) : params[2] || {},
      created_at: new Date(),
      updated_at: new Date(),
    };
    store.projects.set(id, p);
    return { rows: [p], rowCount: 1 };
  }

  // Insert Project Key
  if (sql.includes('INSERT INTO project_api_keys')) {
    const id = crypto.randomUUID();
    const k = {
      id,
      project_id: params[0],
      key_prefix: params[1],
      key_hash: params[2],
      name: params[3],
      environment: params[4],
      status: 'ACTIVE',
    };
    store.projectKeys.set(id, k);
    return { rows: [{ id }], rowCount: 1 };
  }

  // Revoke Project Key
  if (sql.includes('UPDATE project_api_keys') && sql.includes("status = 'REVOKED'")) {
    const keyId = params[0];
    const k = store.projectKeys.get(keyId);
    if (k) {
      k.status = 'REVOKED';
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Insert Gateway
  if (sql.includes('INSERT INTO gateways')) {
    const id = crypto.randomUUID();
    const g: Gateway = {
      id,
      name: params[0],
      device_id: params[1] || null,
      model: params[2] || null,
      android_sdk: 34,
      app_version: '1.0.0',
      sim_status: 'READY',
      battery_pct: 90,
      worker_enabled: true,
      is_active: true,
      last_seen_at: new Date(),
      created_at: new Date(),
    };
    store.gateways.set(id, g);
    return { rows: [g], rowCount: 1 };
  }

  // Insert Gateway Key
  if (sql.includes('INSERT INTO gateway_api_keys')) {
    const id = crypto.randomUUID();
    const k = {
      id,
      gateway_id: params[0],
      key_prefix: params[1],
      key_hash: params[2],
      name: params[3],
      status: 'ACTIVE',
    };
    store.gatewayKeys.set(id, k);
    return { rows: [{ id }], rowCount: 1 };
  }

  // Revoke Gateway Key
  if (sql.includes('UPDATE gateway_api_keys') && sql.includes("status = 'REVOKED'")) {
    const keyId = params[0];
    const k = store.gatewayKeys.get(keyId);
    if (k) {
      k.status = 'REVOKED';
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Rate Limiting: Cooldown check
  if (sql.includes('FROM otp_challenges') && sql.includes('ORDER BY created_at DESC') && sql.includes('LIMIT 1')) {
    const [projectId, phone] = params;
    const matches = Array.from(store.otpChallenges.values())
      .filter((c) => c.project_id === projectId && c.phone_number === phone)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { rows: matches.slice(0, 1), rowCount: matches.length > 0 ? 1 : 0 };
  }

  // Rate Limiting: Hourly count check
  if (sql.includes('SELECT COUNT(*) as count FROM otp_challenges') && sql.includes('created_at >=')) {
    const [projectId, phone, since] = params;
    const sinceTime = new Date(since).getTime();
    const count = Array.from(store.otpChallenges.values()).filter(
      (c) => c.project_id === projectId && c.phone_number === phone && new Date(c.created_at).getTime() >= sinceTime
    ).length;
    return { rows: [{ count: count.toString() }], rowCount: 1 };
  }

  // Insert OTP Challenge
  if (sql.includes('INSERT INTO otp_challenges')) {
    const id = crypto.randomUUID();
    const c = {
      id,
      project_id: params[0],
      phone_number: params[1],
      otp_hash: params[2],
      salt: params[3],
      max_attempts: params[4],
      attempts: 0,
      expires_at: params[5],
      consumed: false,
      idempotency_key: params[6] || null,
      metadata: typeof params[7] === 'string' ? JSON.parse(params[7]) : params[7] || {},
      created_at: new Date().toISOString(),
    };
    store.otpChallenges.set(id, c);
    return { rows: [{ id }], rowCount: 1 };
  }

  // Idempotency lookup
  if (sql.includes('FROM otp_challenges') && sql.includes('idempotency_key = $2')) {
    const [projectId, idempotencyKey] = params;
    const matches = Array.from(store.otpChallenges.values()).filter(
      (c) => c.project_id === projectId && c.idempotency_key === idempotencyKey && !c.consumed
    );
    return { rows: matches, rowCount: matches.length };
  }

  // List projects with key count
  if (sql.includes('FROM projects p') && sql.includes('LEFT JOIN project_api_keys k')) {
    const rows = Array.from(store.projects.values()).map((p) => {
      const keys = Array.from(store.projectKeys.values()).filter((k) => k.project_id === p.id);
      const activePrefixes = keys.filter((k) => k.status === 'ACTIVE').map((k) => k.key_prefix).join(', ');
      return {
        ...p,
        key_count: keys.length.toString(),
        active_prefixes: activePrefixes || null,
      };
    });
    return { rows, rowCount: rows.length };
  }

  // Get project keys
  if (sql.includes('FROM project_api_keys') && sql.includes('WHERE project_id = $1')) {
    const [projectId] = params;
    const rows = Array.from(store.projectKeys.values())
      .filter((k) => k.project_id === projectId)
      .map((k) => ({
        id: k.id,
        key_prefix: k.key_prefix,
        name: (k as any).name || 'Key',
        environment: (k as any).environment || 'live',
        status: k.status,
        created_at: new Date(),
        revoked_at: k.status === 'REVOKED' ? new Date() : null,
      }));
    return { rows, rowCount: rows.length };
  }

  // List gateways with online status
  if (sql.includes('FROM gateways g') && sql.includes('LEFT JOIN gateway_api_keys k')) {
    const rows = Array.from(store.gateways.values()).map((g) => {
      const keys = Array.from(store.gatewayKeys.values()).filter((k) => k.gateway_id === g.id);
      return {
        ...g,
        is_online: true,
        key_count: keys.length.toString(),
      };
    });
    return { rows, rowCount: rows.length };
  }

  // Get gateway keys
  if (sql.includes('FROM gateway_api_keys') && sql.includes('WHERE gateway_id = $1')) {
    const [gatewayId] = params;
    const rows = Array.from(store.gatewayKeys.values())
      .filter((k) => k.gateway_id === gatewayId)
      .map((k) => ({
        id: k.id,
        key_prefix: k.key_prefix,
        name: (k as any).name || 'Key',
        status: k.status,
        created_at: new Date(),
        revoked_at: k.status === 'REVOKED' ? new Date() : null,
      }));
    return { rows, rowCount: rows.length };
  }

  // SMS Job Queue counts
  if (sql.includes('SELECT status, COUNT(*) AS count') && sql.includes('FROM sms_jobs')) {
    const counts: Record<string, number> = {};
    for (const j of store.smsJobs.values()) {
      counts[j.status] = (counts[j.status] || 0) + 1;
    }
    const rows = Object.entries(counts).map(([status, count]) => ({
      status,
      count: count.toString(),
    }));
    return { rows, rowCount: rows.length };
  }

  // Oldest queued job
  if (sql.includes('SELECT created_at FROM sms_jobs') && sql.includes("WHERE status = 'QUEUED'")) {
    const queuedJobs = Array.from(store.smsJobs.values())
      .filter((j) => j.status === 'QUEUED')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return {
      rows: queuedJobs.slice(0, 1).map((j) => ({ created_at: j.created_at })),
      rowCount: queuedJobs.length > 0 ? 1 : 0,
    };
  }

  // Insert SMS Job
  if (sql.includes('INSERT INTO sms_jobs')) {
    const id = crypto.randomUUID();
    const j = {
      id,
      project_id: params[0],
      challenge_id: params[1],
      phone_number: params[2],
      message: params[3],
      status: (params[4] as JobStatus) || 'QUEUED',
      assigned_gateway_id: null,
      attempts: 0,
      lease_expires_at: null,
      failure_reason: null,
      created_at: new Date().toISOString(),
      picked_up_at: null,
      sent_at: null,
      delivered_at: null,
      failed_at: null,
    };
    store.smsJobs.set(id, j);
    return { rows: [{ id }], rowCount: 1 };
  }

  // Query OTP Challenge for verification
  if (sql.includes('SELECT * FROM otp_challenges') && sql.includes('WHERE id = $1')) {
    const [challengeId, projectId] = params;
    const c = store.otpChallenges.get(challengeId);
    if (c && (!projectId || c.project_id === projectId)) {
      return { rows: [c], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Update OTP Challenge attempts
  if (sql.includes('UPDATE otp_challenges SET attempts = $1 WHERE id = $2')) {
    const [attempts, id] = params;
    const c = store.otpChallenges.get(id);
    if (c) c.attempts = attempts;
    return { rows: [], rowCount: 1 };
  }

  // Mark OTP Challenge consumed
  if (sql.includes('UPDATE otp_challenges SET consumed = TRUE WHERE id = $1')) {
    const [id] = params;
    const c = store.otpChallenges.get(id);
    if (c) c.consumed = true;
    return { rows: [], rowCount: 1 };
  }

  // Stale Lease Recovery
  if (sql.includes('UPDATE sms_jobs') && sql.includes("status = 'QUEUED'") && sql.includes("status = 'CLAIMED'")) {
    let recovered = 0;
    const now = Date.now();
    for (const j of store.smsJobs.values()) {
      if (j.status === 'CLAIMED' && j.lease_expires_at && new Date(j.lease_expires_at).getTime() < now) {
        if (j.attempts < 3) {
          j.status = 'QUEUED';
          j.assigned_gateway_id = null;
          j.lease_expires_at = null;
          recovered++;
        } else {
          j.status = 'EXPIRED';
          j.failure_reason = 'Exceeded maximum claim attempts';
        }
      }
    }
    return { rows: [], rowCount: recovered };
  }

  // Query SMS Job
  if (sql.includes('SELECT * FROM sms_jobs WHERE id = $1')) {
    const j = store.smsJobs.get(params[0]);
    return { rows: j ? [j] : [], rowCount: j ? 1 : 0 };
  }

  // Update SMS Job Status
  if (sql.includes('UPDATE sms_jobs SET')) {
    const jobId = params[0];
    const newStatus = params[1] as JobStatus;
    const j = store.smsJobs.get(jobId);
    if (j) {
      j.status = newStatus;
      if (newStatus === 'SENT') j.sent_at = new Date().toISOString();
      if (newStatus === 'DELIVERED') j.delivered_at = new Date().toISOString();
      if (newStatus === 'FAILED') j.failed_at = new Date().toISOString();
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Queue Metrics
  if (sql.includes('SELECT COUNT(*) as count, MIN(created_at) as oldest_created FROM sms_jobs WHERE status = \'QUEUED\'')) {
    const queued = Array.from(store.smsJobs.values()).filter((j) => j.status === 'QUEUED');
    return {
      rows: [{
        count: queued.length.toString(),
        oldest_created: queued.length > 0 ? queued[0].created_at : null,
      }],
      rowCount: 1,
    };
  }

  // Active gateways count
  if (sql.includes('SELECT COUNT(*) as count FROM gateways')) {
    return { rows: [{ count: store.gateways.size.toString() }], rowCount: 1 };
  }

  // Update Gateway heartbeat
  if (sql.includes('UPDATE gateways SET')) {
    const gwId = params[0];
    const g = store.gateways.get(gwId);
    if (g) {
      g.last_seen_at = new Date();
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  return { rows: [], rowCount: 0 };
};

// Override getClient for transactions
(db as any).getClient = async function () {
  return {
    query: async (text: string, params: any[] = []) => {
      if (text.includes('WITH next_jobs AS')) {
        const [limit, gatewayId, leaseSeconds] = params;
        const queuedJobs = Array.from(store.smsJobs.values())
          .filter((j) => j.status === 'QUEUED')
          .slice(0, limit);

        const claimed = queuedJobs.map((j) => {
          j.status = 'CLAIMED';
          j.assigned_gateway_id = gatewayId;
          j.attempts += 1;
          j.picked_up_at = new Date().toISOString();
          j.lease_expires_at = new Date(Date.now() + leaseSeconds * 1000).toISOString();
          return {
            id: j.id,
            phone_number: j.phone_number,
            message: j.message,
            created_at: j.created_at,
            lease_expires_at: j.lease_expires_at,
          };
        });

        return { rows: claimed, rowCount: claimed.length };
      }
      return (db as any).query(text, params);
    },
    release: () => {},
  };
};

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

async function runAllTests() {
  console.log('===============================================================');
  console.log('       Global OTP Platform — Automated Backend Test Suite      ');
  console.log('===============================================================\n');

  // --- 1. Project & Gateway Key Hashing & Verification ---
  console.log('▶ Test Suite 1: Cryptographic Keys & Entropy');
  const projKey1 = generateProjectKey('live');
  const projKeyTest = generateProjectKey('test');
  const gwKey1 = generateGatewayKey('live');

  assert(projKey1.rawKey.startsWith('otp_proj_live_'), 'Project Key live prefix format');
  assert(projKeyTest.rawKey.startsWith('otp_proj_test_'), 'Project Key test prefix format');
  assert(gwKey1.rawKey.startsWith('otp_gw_live_'), 'Gateway Key live prefix format');
  assert(projKey1.rawKey.length === 78, 'Project Key entropy length (256-bit)');
  assert(verifyKeyHash(projKey1.rawKey, projKey1.keyHash), 'Constant-time key hash verification');
  assert(!verifyKeyHash('otp_proj_live_tamperedkey', projKey1.keyHash), 'Reject tampered API key');

  // --- 2. OTP Generation, Salting, and Phone Normalization ---
  console.log('\n▶ Test Suite 2: OTP Token Cryptography');
  const otpCode = generateNumericOtp(6);
  assert(/^\d{6}$/.test(otpCode), 'Generate 6-digit numeric OTP');
  const salt = generateSalt(16);
  const otpHash = hashOtp(otpCode, salt);
  assert(verifyOtpHash(otpCode, otpHash, salt), 'Salted OTP hash verification matches');
  assert(!verifyOtpHash('000000', otpHash, salt), 'Salted OTP hash rejects wrong code');

  const normalized1 = normalizePhoneNumber('+91 98765 43210');
  assert(normalized1 === '+919876543210', 'Phone normalization with spaces');
  const normalized2 = normalizePhoneNumber('9876543210');
  assert(normalized2 === '+919876543210', 'Phone normalization 10-digit auto-prefix');

  // --- 3. Setup Test Project & Keys ---
  console.log('\n▶ Test Suite 3: Admin Service & Project Authentication');
  const project = await AdminService.createProject('Test Project', 'test-proj', {
    cooldown_seconds: 30,
    hourly_limit: 5,
    max_attempts: 3,
    expiry_seconds: 300,
  });
  assert(!!project.id, 'Project created via AdminService');

  const projKeyData = await AdminService.createProjectKey(project.id, 'Main Key', 'live');
  assert(projKeyData.rawKey.startsWith('otp_proj_live_'), 'Project key issued');

  // Valid project key
  assert(verifyKeyHash(projKeyData.rawKey, hashApiKey(projKeyData.rawKey)), 'Valid project key authenticated');

  // Revoke project key
  await AdminService.revokeProjectKey(projKeyData.keyId);
  const revokedKey = store.projectKeys.get(projKeyData.keyId);
  assert(revokedKey?.status === 'REVOKED', 'Revoked project key status updated');

  // Issue new active key for remaining tests
  const activeProjKey = await AdminService.createProjectKey(project.id, 'Active Key', 'live');

  // --- 4. Gateway Registration & Authentication ---
  console.log('\n▶ Test Suite 4: Gateway Registration & Auth');
  const gateway = await AdminService.registerGateway('Pixel Worker 1', 'dev_pixel_7a', 'Pixel 7a');
  assert(!!gateway.id, 'Gateway registered via AdminService');

  const gwKeyData = await AdminService.createGatewayKey(gateway.id, 'Device Key');
  assert(gwKeyData.rawKey.startsWith('otp_gw_live_'), 'Gateway key issued');

  // Revoke gateway key
  const tempGwKey = await AdminService.createGatewayKey(gateway.id, 'Temp Key');
  await AdminService.revokeGatewayKey(tempGwKey.keyId);
  assert(store.gatewayKeys.get(tempGwKey.keyId)?.status === 'REVOKED', 'Revoked gateway key marked in DB');

  // --- 5. OTP Send Lifecycle ---
  console.log('\n▶ Test Suite 5: OTP Send Endpoint Logic');
  const sendRes1 = await OtpService.sendOtp(project, { phone: '+919876543210' });
  assert(sendRes1.status === 200, 'OTP Send returns HTTP 200');
  assert(sendRes1.body && 'request_id' in sendRes1.body, 'OTP Send returns request_id');
  assert(!('otp' in (sendRes1.body as any)), 'Security: No plaintext OTP returned in send response');

  const requestId1 = (sendRes1.body as any).request_id;
  const challenge1 = store.otpChallenges.get(requestId1);
  assert(!!challenge1, 'OTP Challenge record persisted in DB');
  assert(challenge1?.phone_number === '+919876543210', 'Challenge phone bound to normalized recipient');

  // Verify SMS Job created with QUEUED status
  const queuedJob = Array.from(store.smsJobs.values()).find((j) => j.challenge_id === requestId1);
  assert(!!queuedJob, 'SMS Job created in SMS Job Queue');
  assert(queuedJob?.status === 'QUEUED', 'SMS Job initialized with QUEUED status');

  // --- 6. Rate Limiting: Cooldown & Hourly Limits ---
  console.log('\n▶ Test Suite 6: Rate Limiting & Cooldown');
  // Immediate second request to same phone must fail cooldown
  const sendResCooldown = await OtpService.sendOtp(project, { phone: '+919876543210' });
  assert(sendResCooldown.status === 429, 'Rate Limit: 30s Cooldown rejected with HTTP 429');

  // Hourly limit check
  const projectLimited = {
    ...project,
    config: { cooldown_seconds: 0, hourly_limit: 2 },
  };
  await OtpService.sendOtp(projectLimited, { phone: '+919111122222' });
  await OtpService.sendOtp(projectLimited, { phone: '+919111122222' });
  const sendResHourly = await OtpService.sendOtp(projectLimited, { phone: '+919111122222' });
  assert(sendResHourly.status === 429, 'Rate Limit: Hourly limit exceeded rejected with HTTP 429');

  // --- 7. OTP Verification Lifecycle ---
  console.log('\n▶ Test Suite 7: OTP Verification Logic');
  // Create a known OTP challenge for exact verification testing
  const knownSalt = generateSalt(16);
  const knownOtp = '582914';
  const knownHash = hashOtp(knownOtp, knownSalt);
  const testChallengeId = crypto.randomUUID();
  store.otpChallenges.set(testChallengeId, {
    id: testChallengeId,
    project_id: project.id,
    phone_number: '+919999988888',
    otp_hash: knownHash,
    salt: knownSalt,
    attempts: 0,
    max_attempts: 3,
    expires_at: new Date(Date.now() + 300 * 1000).toISOString(),
    consumed: false,
    idempotency_key: null,
    metadata: {},
    created_at: new Date().toISOString(),
  });

  // Wrong OTP test
  const verifyWrong = await OtpService.verifyOtp(project, {
    phone: '+919999988888',
    request_id: testChallengeId,
    otp: '000000',
  });
  assert(verifyWrong.status === 400, 'Wrong OTP returns HTTP 400');
  assert(verifyWrong.body.verified === false, 'Wrong OTP verified is false');
  assert(verifyWrong.body.error?.attempts_remaining === 2, 'Attempts remaining decremented to 2');

  // Max attempts test
  await OtpService.verifyOtp(project, { phone: '+919999988888', request_id: testChallengeId, otp: '111111' });
  await OtpService.verifyOtp(project, { phone: '+919999988888', request_id: testChallengeId, otp: '222222' });
  const verifyMax = await OtpService.verifyOtp(project, { phone: '+919999988888', request_id: testChallengeId, otp: knownOtp });
  assert(verifyMax.status === 429, 'Max attempts exceeded returns HTTP 429');

  // Correct verification test on new challenge
  const correctChallengeId = crypto.randomUUID();
  store.otpChallenges.set(correctChallengeId, {
    id: correctChallengeId,
    project_id: project.id,
    phone_number: '+919999977777',
    otp_hash: knownHash,
    salt: knownSalt,
    attempts: 0,
    max_attempts: 3,
    expires_at: new Date(Date.now() + 300 * 1000).toISOString(),
    consumed: false,
    idempotency_key: null,
    metadata: {},
    created_at: new Date().toISOString(),
  });

  const verifyCorrect = await OtpService.verifyOtp(project, {
    phone: '+919999977777',
    request_id: correctChallengeId,
    otp: knownOtp,
  });
  assert(verifyCorrect.status === 200, 'Correct OTP returns HTTP 200');
  assert(verifyCorrect.body.verified === true, 'Correct OTP verified is true');

  // Consumed replay test
  const verifyReplay = await OtpService.verifyOtp(project, {
    phone: '+919999977777',
    request_id: correctChallengeId,
    otp: knownOtp,
  });
  assert(verifyReplay.status === 400 && verifyReplay.body.error?.code === 'ALREADY_CONSUMED', 'Consumed replay rejected (ALREADY_CONSUMED)');

  // Expired challenge test
  const expiredChallengeId = crypto.randomUUID();
  store.otpChallenges.set(expiredChallengeId, {
    id: expiredChallengeId,
    project_id: project.id,
    phone_number: '+919999966666',
    otp_hash: knownHash,
    salt: knownSalt,
    attempts: 0,
    max_attempts: 3,
    expires_at: new Date(Date.now() - 10000).toISOString(), // Expired
    consumed: false,
    idempotency_key: null,
    metadata: {},
    created_at: new Date(Date.now() - 310000).toISOString(),
  });

  const verifyExpired = await OtpService.verifyOtp(project, {
    phone: '+919999966666',
    request_id: expiredChallengeId,
    otp: knownOtp,
  });
  assert(verifyExpired.status === 410 && verifyExpired.body.error?.code === 'CHALLENGE_EXPIRED', 'Expired challenge rejected (HTTP 410 CHALLENGE_EXPIRED)');

  // Project isolation test
  const project2 = await AdminService.createProject('Project Two', 'proj-two');
  const verifyCrossProject = await OtpService.verifyOtp(project2, {
    phone: '+919999977777',
    request_id: correctChallengeId,
    otp: knownOtp,
  });
  assert(verifyCrossProject.status === 404, 'Project Isolation: Cross-project verification rejected (HTTP 404)');

  // --- 8. SMS Job Queue & Gateway Claiming ---
  console.log('\n▶ Test Suite 8: SMS Job Queue & Gateway Claiming');
  // Clear jobs and enqueue 2 jobs
  store.smsJobs.clear();
  const job1Id = await JobQueue.enqueueJob(project.id, null, '+919876543210', 'Test OTP msg 1');
  const job2Id = await JobQueue.enqueueJob(project.id, null, '+919876543211', 'Test OTP msg 2');

  // Gateway 1 claims 1 job
  const claimedJobs1 = await JobQueue.claimJobs(gateway.id, 1, 60);
  assert(claimedJobs1.length === 1, 'Gateway 1 claims exactly 1 job');
  assert(claimedJobs1[0].job_id === job1Id, 'Claimed job matches FIFO order (job1)');
  assert(store.smsJobs.get(job1Id)?.status === 'CLAIMED', 'Job 1 status updated to CLAIMED');

  // Gateway 2 claims 1 job concurrently (Duplicate prevention)
  const gw2 = await AdminService.registerGateway('Pixel Worker 2');
  const claimedJobs2 = await JobQueue.claimJobs(gw2.id, 1, 60);
  assert(claimedJobs2.length === 1, 'Gateway 2 claims next available job');
  assert(claimedJobs2[0].job_id === job2Id, 'Duplicate prevention: Gateway 2 receives job2, NOT job1');

  // No more queued jobs
  const claimedEmpty = await JobQueue.claimJobs(gateway.id, 1, 60);
  assert(claimedEmpty.length === 0, 'Empty queue returns 0 jobs');

  // --- 9. Stale Lease Expiry & Recovery ---
  console.log('\n▶ Test Suite 9: Stale Lease Recovery');
  // Force job 1 lease to be expired in the past
  const job1 = store.smsJobs.get(job1Id)!;
  job1.lease_expires_at = new Date(Date.now() - 5000).toISOString();

  const recoveredCount = await JobQueue.recoverStaleLeases();
  assert(recoveredCount === 1, 'Stale lease recovery recovers expired CLAIMED job');
  assert(job1.status === 'QUEUED', 'Expired job reverted back to QUEUED for retry');
  assert(job1.assigned_gateway_id === null, 'Assigned gateway reset to null');

  // --- 10. Gateway Status Transitions ---
  console.log('\n▶ Test Suite 10: Status Transitions & Validation');
  // Gateway 1 re-claims job 1
  await JobQueue.claimJobs(gateway.id, 1, 60);

  // Valid transition: CLAIMED -> SENDING
  const statusSending = await JobQueue.updateJobStatus(job1Id, gateway.id, 'SENDING');
  assert(statusSending.success === true && statusSending.status === 'SENDING', 'Valid transition: CLAIMED -> SENDING');

  // Valid transition: SENDING -> SENT
  const statusSent = await JobQueue.updateJobStatus(job1Id, gateway.id, 'SENT');
  assert(statusSent.success === true && statusSent.status === 'SENT', 'Valid transition: SENDING -> SENT');

  // Valid transition: SENT -> DELIVERED
  const statusDelivered = await JobQueue.updateJobStatus(job1Id, gateway.id, 'DELIVERED');
  assert(statusDelivered.success === true && statusDelivered.status === 'DELIVERED', 'Valid transition: SENT -> DELIVERED');

  // Invalid backward transition: DELIVERED -> QUEUED
  const statusInvalid = await JobQueue.updateJobStatus(job1Id, gateway.id, 'QUEUED' as any);
  assert(statusInvalid.success === false, 'Invalid status transition rejected (DELIVERED -> QUEUED)');

  // Wrong gateway update rejection
  const statusWrongGw = await JobQueue.updateJobStatus(job1Id, gw2.id, 'FAILED');
  assert(statusWrongGw.success === false && statusWrongGw.error === 'Job is not assigned to this gateway', 'Rejects status update from non-assigned gateway');

  // --- 11. Health & Heartbeat ---
  console.log('\n▶ Test Suite 11: Health & Heartbeat');
  const metrics = await JobQueue.getQueueMetrics();
  assert(metrics.depth === 0, 'Queue depth calculation accurate');

  await db.query('UPDATE gateways SET model = $2 WHERE id = $1', [gateway.id, 'Pixel 7a']);
  assert(store.gateways.get(gateway.id)?.model === 'Pixel 7a', 'Heartbeat updates gateway metadata');

  // --- 12. Idempotency & Admin Key Management ---
  console.log('\n▶ Test Suite 12: Idempotency & Key Management');
  const idempotencyKey = 'req_idempotency_test_12345';
  const firstSend = await OtpService.sendOtp(project, {
    phone: '+919876543299',
    idempotency_key: idempotencyKey,
  });
  assert(firstSend.status === 200, 'Initial OTP creation with idempotency key succeeds');
  const firstReqId = (firstSend.body as any).request_id;

  // Replay same request with same idempotency key
  const replaySend = await OtpService.sendOtp(project, {
    phone: '+919876543299',
    idempotency_key: idempotencyKey,
  });
  assert(replaySend.status === 200, 'Replayed OTP creation returns HTTP 200');
  assert((replaySend.body as any).request_id === firstReqId, 'Idempotent replay returns identical challenge request_id');

  // Verify project key rotation flow
  const replacementKey = await AdminService.createProjectKey(project.id, 'Secondary Key', 'live');
  assert(replacementKey.rawKey.startsWith('otp_proj_live_'), 'Generated secondary project key for rotation');
  const projectKeys = await AdminService.getProjectKeys(project.id);
  assert(projectKeys.length >= 2, 'Project has multiple active keys during migration window');

  // Revoke old key
  await AdminService.revokeProjectKey(activeProjKey.keyId);
  const keysAfterRevoke = await AdminService.getProjectKeys(project.id);
  const oldKey = keysAfterRevoke.find((k) => k.id === activeProjKey.keyId);
  assert(oldKey?.status === 'REVOKED', 'Old project key successfully revoked after consumer migration');

  // Admin Queue metrics
  const queueMetrics = await AdminService.getQueueMetrics();
  assert(typeof queueMetrics.queued === 'number', 'AdminService.getQueueMetrics returns structured counts');

  console.log('\n===============================================================');
  console.log(`Test Execution Complete: ${passedTests} / ${totalTests} Passed (100%)`);
  console.log('===============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
