import crypto from 'crypto';
import { KeyEnvironment } from '@/types';

export interface GeneratedKey {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
}

/**
 * Computes a SHA-256 hex digest for an API key.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

/**
 * Extracts the first 16 characters of the key for display/logging.
 */
export function getKeyPrefix(rawKey: string): string {
  return rawKey.slice(0, 16);
}

/**
 * Generates a cryptographically secure Project API Key.
 * Format: otp_proj_live_<64-hex> or otp_proj_test_<64-hex> (256-bit entropy)
 */
export function generateProjectKey(env: KeyEnvironment = 'live'): GeneratedKey {
  const entropy = crypto.randomBytes(32).toString('hex'); // 256 bits of entropy
  const rawKey = `otp_proj_${env}_${entropy}`;
  const keyPrefix = getKeyPrefix(rawKey);
  const keyHash = hashApiKey(rawKey);

  return {
    rawKey,
    keyPrefix,
    keyHash,
  };
}

/**
 * Generates a cryptographically secure Gateway API Key.
 * Format: otp_gw_live_<64-hex> or otp_gw_test_<64-hex> (256-bit entropy)
 */
export function generateGatewayKey(env: KeyEnvironment = 'live'): GeneratedKey {
  const entropy = crypto.randomBytes(32).toString('hex'); // 256 bits of entropy
  const rawKey = `otp_gw_${env}_${entropy}`;
  const keyPrefix = getKeyPrefix(rawKey);
  const keyHash = hashApiKey(rawKey);

  return {
    rawKey,
    keyPrefix,
    keyHash,
  };
}

/**
 * Constant-time hash verification against timing attacks.
 */
export function verifyKeyHash(rawKey: string, storedHash: string): boolean {
  const computedHash = hashApiKey(rawKey);
  const bufA = Buffer.from(computedHash, 'hex');
  const bufB = Buffer.from(storedHash, 'hex');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
