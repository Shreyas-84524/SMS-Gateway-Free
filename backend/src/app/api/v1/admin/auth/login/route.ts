import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import {
  AdminUser,
  hashPassword,
  loginIdentityHash,
  normalizeAdminPhone,
  setAdminSession,
  verifyPassword,
} from '@/lib/admin/auth';
import { apiError } from '@/lib/admin/http';
import { ensureAdminSchema } from '@/lib/admin/schema';

export const runtime = 'nodejs';

interface UserWithPassword extends AdminUser {
  password_hash: string;
}

export async function POST(request: NextRequest) {
  try {
    await ensureAdminSchema();
    const body = (await request.json()) as { phone?: string; password?: string };
    const phone = normalizeAdminPhone(body.phone ?? '');
    const password = body.password ?? '';
    if (!phone || !password) {
      return NextResponse.json({ success: false, error: 'Invalid phone number or password' }, { status: 401 });
    }

    const identityHash = loginIdentityHash(phone, request);
    const attempts = await db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM admin_login_attempts
       WHERE identity_hash = $1 AND succeeded = FALSE
         AND attempted_at > NOW() - INTERVAL '15 minutes'`,
      [identityHash]
    );
    if (Number(attempts.rows[0]?.count ?? 0) >= 5) {
      return NextResponse.json({ success: false, error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
    }

    const result = await db.query<UserWithPassword>(
      `SELECT id, slot, phone_number, display_name, enabled, password_hash
       FROM admin_users WHERE phone_number = $1`,
      [phone]
    );
    const user = result.rows[0];
    const passwordMatches = user
      ? await verifyPassword(password, user.password_hash)
      : Boolean(await hashPasswordForTiming(password));
    const valid = Boolean(user?.enabled) && passwordMatches;

    await db.query(
      `INSERT INTO admin_login_attempts (identity_hash, succeeded) VALUES ($1, $2)`,
      [identityHash, valid]
    );
    void db.query(`DELETE FROM admin_login_attempts WHERE attempted_at < NOW() - INTERVAL '24 hours'`).catch(() => undefined);

    if (!valid) {
      return NextResponse.json({ success: false, error: 'Invalid phone number or password' }, { status: 401 });
    }

    await db.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, phone_number: user.phone_number, display_name: user.display_name },
    });
    setAdminSession(response, user);
    return response;
  } catch (error) {
    return apiError(error, 'Login failed');
  }
}

async function hashPasswordForTiming(password: string): Promise<false> {
  await hashPassword(password);
  return false;
}
