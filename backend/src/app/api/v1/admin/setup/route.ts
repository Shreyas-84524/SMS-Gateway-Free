import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import {
  hashPassword,
  normalizeAdminPhone,
  setupTokenMatches,
  validatePassword,
} from '@/lib/admin/auth';
import { apiError } from '@/lib/admin/http';
import { ensureAdminSchema } from '@/lib/admin/schema';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await ensureAdminSchema();
    const result = await db.query<{ count: string }>('SELECT COUNT(*) AS count FROM admin_users');
    return NextResponse.json({
      success: true,
      configured: Number(result.rows[0]?.count ?? 0) === 2,
    });
  } catch (error) {
    return apiError(error, 'Could not read setup status');
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAdminSchema();
    const body = (await request.json()) as {
      setup_token?: string;
      users?: Array<{ phone?: string; password?: string; display_name?: string }>;
    };

    if (!setupTokenMatches(body.setup_token ?? '')) {
      return NextResponse.json({ success: false, error: 'Invalid setup token' }, { status: 401 });
    }
    if (!Array.isArray(body.users) || body.users.length !== 2) {
      return NextResponse.json({ success: false, error: 'Exactly two administrators are required' }, { status: 400 });
    }

    const users = await Promise.all(body.users.map(async (candidate, index) => {
      const phone = normalizeAdminPhone(candidate.phone ?? '');
      const password = candidate.password ?? '';
      const displayName = candidate.display_name?.trim();
      if (!phone) throw new Error(`Administrator ${index + 1} has an invalid phone number`);
      const passwordError = validatePassword(password);
      if (passwordError) throw new Error(`Administrator ${index + 1}: ${passwordError}`);
      if (!displayName || displayName.length > 100) throw new Error(`Administrator ${index + 1} needs a valid name`);
      return { slot: index + 1, phone, passwordHash: await hashPassword(password), displayName };
    }));

    if (users[0].phone === users[1].phone) {
      return NextResponse.json({ success: false, error: 'The two phone numbers must be different' }, { status: 400 });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ count: string }>('SELECT COUNT(*) AS count FROM admin_users');
      if (Number(existing.rows[0]?.count ?? 0) !== 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ success: false, error: 'Administrator setup is already complete' }, { status: 409 });
      }
      for (const user of users) {
        await client.query(
          `INSERT INTO admin_users (slot, phone_number, password_hash, display_name)
           VALUES ($1, $2, $3, $4)`,
          [user.slot, user.phone, user.passwordHash, user.displayName]
        );
      }
      await client.query('COMMIT');
      return NextResponse.json({ success: true, configured: true }, { status: 201 });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Administrator') || error.message.includes('Password'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return apiError(error, 'Administrator setup failed');
  }
}
