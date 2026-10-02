import https from 'https';

const baseUrl = process.env.LIVE_VERIFY_URL || 'https://global-otp-service.vercel.app';
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before running live verification`);
  return value;
}
const projectKey = requiredEnv('TEST_PROJECT_KEY');
const gatewayKey = requiredEnv('TEST_GATEWAY_KEY');

function request(path: string, method: string, headers: Record<string, string> = {}, body?: unknown): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request(new URL(path, baseUrl), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': String(Buffer.byteLength(payload)) } : {}),
        ...headers,
      },
    }, (response) => {
      let raw = '';
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        try { resolve({ status: response.statusCode || 0, data: JSON.parse(raw) }); }
        catch { resolve({ status: response.statusCode || 0, data: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  const health = await request('/api/v1/health', 'GET');
  if (health.status !== 200 || health.data?.services?.database !== 'connected') {
    throw new Error(`Health check failed with HTTP ${health.status}`);
  }

  const phone = process.env.TEST_PHONE_NUMBER;
  if (!phone) {
    console.log('Health check passed. Set TEST_PHONE_NUMBER to run the SMS queue verification.');
    return;
  }

  const send = await request('/api/v1/otp/send', 'POST', { 'X-Project-Key': projectKey }, { phone });
  if (send.status !== 200 || !send.data?.request_id) throw new Error(`OTP send failed with HTTP ${send.status}`);

  const jobs = await request('/api/v1/gateway/jobs?limit=5', 'GET', { 'X-Gateway-Key': gatewayKey });
  if (jobs.status !== 200 || !Array.isArray(jobs.data?.data?.jobs)) {
    throw new Error(`Gateway claim failed with HTTP ${jobs.status}`);
  }
  console.log(`Live verification passed; claimed ${jobs.data.data.jobs.length} job(s).`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
