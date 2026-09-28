import crypto from 'crypto';

export interface GeneratedOtp {
  otp: string;
  salt: string;
  otpHash: string;
}

/**
 * Generates a cryptographically secure numeric OTP token.
 * Defaults to 6 digits (range 100000 - 999999).
 */
export function generateNumericOtp(length = 6): string {
  if (length < 4 || length > 10) {
    throw new Error('OTP length must be between 4 and 10 digits');
  }

  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length);
  const codeInt = crypto.randomInt(min, max);
  return codeInt.toString().padStart(length, '0');
}

/**
 * Generates a random cryptographic salt.
 */
export function generateSalt(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hashes an OTP token combined with a cryptographic salt using SHA-256.
 */
export function hashOtp(otp: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${otp}`, 'utf8').digest('hex');
}

/**
 * Generates the full OTP payload (plaintext token, salt, and salted hash).
 */
export function createOtpPayload(length = 6): GeneratedOtp {
  const otp = generateNumericOtp(length);
  const salt = generateSalt(16);
  const otpHash = hashOtp(otp, salt);

  return {
    otp,
    salt,
    otpHash,
  };
}

/**
 * Verifies candidate OTP against stored hash and salt using constant-time comparison.
 */
export function verifyOtpHash(candidateOtp: string, storedHash: string, salt: string): boolean {
  const computedHash = hashOtp(candidateOtp.trim(), salt);
  const bufA = Buffer.from(computedHash, 'hex');
  const bufB = Buffer.from(storedHash, 'hex');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Normalizes phone numbers to standard E.164 format.
 */
export function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');
  if (!cleaned.startsWith('+')) {
    // If 10 digits without country code, default to India (+91) if configured or require +
    if (/^\d{10}$/.test(cleaned)) {
      cleaned = `+91${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }

  if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    throw new Error(`Invalid E.164 phone number format: ${phone}`);
  }

  return cleaned;
}
