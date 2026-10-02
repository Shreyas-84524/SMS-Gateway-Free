import { db } from '../db/client';

let schemaReady = false;

export async function ensureAdminSchema(): Promise<void> {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      slot SMALLINT NOT NULL UNIQUE CHECK (slot IN (1, 2)),
      phone_number VARCHAR(20) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ NULL
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      id BIGSERIAL PRIMARY KEY,
      identity_hash VARCHAR(64) NOT NULL,
      succeeded BOOLEAN NOT NULL DEFAULT FALSE,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_recent
      ON admin_login_attempts (identity_hash, attempted_at DESC)
  `);
  schemaReady = true;
}
