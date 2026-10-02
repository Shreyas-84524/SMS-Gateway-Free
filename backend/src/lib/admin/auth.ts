import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../db/client';

const SESSION_COOKIE = 'otp_admin_session';
const SESSION_DURATION_SECONDS = 12 * 60 * 60;

function derivePassword(password: string, salt: Buffer, length: number, n = 16384, r = 8, p = 1): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, length, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export interface AdminUser {
  id: string;
  slot: number;
  phone_number: string;
  display_name: string;
  enabled: boolean;
}

interface SessionPayload {
  sub: string;
  phone: string;
  iat: number;
  exp: number;
}

export function normalizeAdminPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, '');
  const normalized = compact.startsWith('+') ? compact : `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 12) return 'Password must contain at least 12 characters';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include uppercase, lowercase, and a number';
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await derivePassword(password, salt, 64);
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltValue, hashValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;

  try {
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = await derivePassword(
      password,
      Buffer.from(saltValue, 'base64url'),
      expected.length,
      Number(n),
      Number(r),
      Number(p)
    );
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SECRET_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET or ADMIN_SECRET_KEY must contain at least 32 characters');
  }
  return secret;
}

function sign(value: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

function createSessionToken(user: AdminUser): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: user.id,
    phone: user.phone_number,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

function parseSessionToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setAdminSession(response: NextResponse, user: AdminUser): void {
  response.cookies.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export function clearAdminSession(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

export async function getAdminFromRequest(request: NextRequest): Promise<AdminUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = parseSessionToken(token);
  if (!payload) return null;

  const result = await db.query<AdminUser>(
    `SELECT id, slot, phone_number, display_name, enabled
     FROM admin_users
     WHERE id = $1 AND enabled = TRUE`,
    [payload.sub]
  );
  return result.rows[0] ?? null;
}

export async function requireAdmin(request: NextRequest): Promise<AdminUser | NextResponse> {
  const user = await getAdminFromRequest(request);
  return user ?? NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
}

export function isAdminUser(value: AdminUser | NextResponse): value is AdminUser {
  return !(value instanceof NextResponse);
}

export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === request.nextUrl.origin;
}

export function setupTokenMatches(candidate: string): boolean {
  const expected = process.env.ADMIN_SETUP_TOKEN || process.env.ADMIN_SECRET_KEY;
  if (!expected || expected.length < 24) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function loginIdentityHash(phone: string, request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return crypto.createHash('sha256').update(`${phone}|${forwarded}`).digest('hex');
}
