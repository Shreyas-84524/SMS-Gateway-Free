import { db } from '../db/client';
import { Project } from '@/types';

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

export class RateLimiter {
  /**
   * Checks both per-phone cooldown and hourly send limits for a project.
   */
  public static async checkSendLimits(
    projectId: string,
    phone: string,
    projectConfig: Project['config']
  ): Promise<RateLimitCheckResult> {
    const cooldownSeconds = projectConfig.cooldown_seconds ?? 30;
    const hourlyLimit = projectConfig.hourly_limit ?? 5;

    // 1. Check phone cooldown (e.g., 30s since last challenge creation)
    const cooldownResult = await db.query<{ created_at: string }>(
      `SELECT created_at FROM otp_challenges
       WHERE project_id = $1 AND phone_number = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [projectId, phone]
    );

    if (cooldownResult.rows.length > 0) {
      const lastCreated = new Date(cooldownResult.rows[0].created_at).getTime();
      const elapsedSeconds = Math.floor((Date.now() - lastCreated) / 1000);

      if (elapsedSeconds < cooldownSeconds) {
        const retryAfter = cooldownSeconds - elapsedSeconds;
        return {
          allowed: false,
          reason: `Please wait ${retryAfter} seconds before requesting a new verification code.`,
          retryAfterSeconds: retryAfter,
        };
      }
    }

    // 2. Check hourly limit (e.g., max 5 challenges in the past 1 hour)
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const hourlyCountResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM otp_challenges
       WHERE project_id = $1 AND phone_number = $2 AND created_at >= $3`,
      [projectId, phone, oneHourAgo]
    );

    const count = parseInt(hourlyCountResult.rows[0]?.count || '0', 10);
    if (count >= hourlyLimit) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: Maximum ${hourlyLimit} OTP requests per hour for this phone number.`,
        retryAfterSeconds: 3600,
      };
    }

    return { allowed: true };
  }
}
