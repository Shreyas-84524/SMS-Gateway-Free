import https from 'https';

const BASE_URL = 'https://global-otp-service.vercel.app';
const CIVICFIX_PROJECT_KEY = 'otp_proj_live_f3ad845f601274b388d0641136d8822d283a4cc335aedb3ac580bc8901e7559d';
const GW_KEY = 'otp_gw_test_0e150c1578291c5fa4b6ff78d9ddf7d867e37a79fe2e4e870611d3fbdf027d1c';

function post(path: string, headers: Record<string, string>, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const bodyStr = JSON.stringify(body);
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function test() {
  const phone = '+919876543210';
  console.log('1. Sending OTP request...');
  const sendRes = await post('/api/v1/otp/send', { 'X-Project-Key': CIVICFIX_PROJECT_KEY }, { phone });
  console.log('Send Response:', JSON.stringify(sendRes, null, 2));

  console.log('\n2. Claiming job with Gateway Key to inspect message...');
  const claimRes = await post('/api/v1/gateway/jobs', { 'X-Gateway-Key': GW_KEY }, { limit: 1, lease_seconds: 60 });
  console.log('Claim Response:', JSON.stringify(claimRes, null, 2));
}

test();
