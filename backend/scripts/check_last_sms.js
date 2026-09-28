const fs = require('fs');
const env = fs.readFileSync('.vercel/.env.production.local', 'utf8');
let dbUrl = '';
for (const line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.slice(13).trim().replace(/^["']|["']$/g, '');
    break;
  }
}

if (!dbUrl) {
  console.log('No DB URL found');
  process.exit(1);
}

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const res = await pool.query('SELECT id, phone_number, message, status, failure_reason, created_at FROM sms_queue ORDER BY created_at DESC LIMIT 5');
    console.log('RECENT_SMS_JOBS:');
    for (const r of res.rows) {
      console.log(`- ID: ${r.id}, Phone: ${r.phone_number}, Status: ${r.status}, Time: ${r.created_at}`);
      console.log(`  Message: ${r.message}`);
      if (r.failure_reason) console.log(`  Failure: ${r.failure_reason}`);
    }
  } catch (err) {
    console.error('Query error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
