import { db } from '../db/client';
import { SmsJob, JobStatus, GatewayJobDto } from '@/types';

export class JobQueue {
  private static readonly LEASE_DURATION_SECONDS = 60;
  private static readonly MAX_CLAIM_ATTEMPTS = 3;

  /**
   * Reverts stale CLAIMED jobs whose lease expired back to QUEUED.
   */
  public static async recoverStaleLeases(): Promise<number> {
    const result = await db.query(
      `UPDATE sms_jobs
       SET status = 'QUEUED',
           assigned_gateway_id = NULL,
           lease_expires_at = NULL
       WHERE status = 'CLAIMED'
         AND lease_expires_at < NOW()
         AND attempts < $1`,
      [this.MAX_CLAIM_ATTEMPTS]
    );

    // Expire jobs that exceeded max attempts
    await db.query(
      `UPDATE sms_jobs
       SET status = 'EXPIRED',
           failure_reason = 'Exceeded maximum claim attempts without completion'
       WHERE status = 'CLAIMED'
         AND lease_expires_at < NOW()
         AND attempts >= $1`,
      [this.MAX_CLAIM_ATTEMPTS]
    );

    return result.rowCount ?? 0;
  }

  /**
   * Atomically claims one or more QUEUED jobs for an authenticated Android gateway.
   */
  public static async claimJobs(
    gatewayId: string,
    limit = 1,
    leaseSeconds = this.LEASE_DURATION_SECONDS
  ): Promise<GatewayJobDto[]> {
    // Run stale lease recovery before claiming
    await this.recoverStaleLeases();

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Atomic lock & claim with SKIP LOCKED
      const claimQuery = `
        WITH next_jobs AS (
          SELECT id
          FROM sms_jobs
          WHERE status = 'QUEUED'
          ORDER BY created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE sms_jobs
        SET status = 'CLAIMED',
            assigned_gateway_id = $2,
            attempts = attempts + 1,
            picked_up_at = NOW(),
            lease_expires_at = NOW() + ($3 || ' seconds')::INTERVAL
        FROM next_jobs
        WHERE sms_jobs.id = next_jobs.id
        RETURNING sms_jobs.id, sms_jobs.phone_number, sms_jobs.message,
                  sms_jobs.created_at, sms_jobs.lease_expires_at
      `;

      const result = await client.query<{
        id: string;
        phone_number: string;
        message: string;
        created_at: string;
        lease_expires_at: string;
      }>(claimQuery, [limit, gatewayId, leaseSeconds]);

      await client.query('COMMIT');

      return result.rows.map((row) => ({
        job_id: row.id,
        phone_number: row.phone_number,
        message: row.message,
        created_at: new Date(row.created_at).toISOString(),
        lease_expires_at: new Date(row.lease_expires_at).toISOString(),
      }));
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Job claim error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validates and applies a status update from a gateway worker.
   */
  public static async updateJobStatus(
    jobId: string,
    gatewayId: string,
    newStatus: 'SENDING' | 'SENT' | 'DELIVERED' | 'FAILED',
    failureReason?: string
  ): Promise<{ success: boolean; error?: string; status?: JobStatus }> {
    const jobResult = await db.query<SmsJob>(
      `SELECT * FROM sms_jobs WHERE id = $1`,
      [jobId]
    );

    if (jobResult.rows.length === 0) {
      return { success: false, error: 'Job not found' };
    }

    const job = jobResult.rows[0];

    // Verify gateway assignment
    if (job.assigned_gateway_id !== gatewayId) {
      return { success: false, error: 'Job is not assigned to this gateway' };
    }

    // Validate state transitions
    const currentStatus = job.status;
    const allowedTransitions: Record<JobStatus, JobStatus[]> = {
      QUEUED: ['CLAIMED'],
      CLAIMED: ['SENDING', 'SENT', 'FAILED', 'QUEUED'],
      SENDING: ['SENT', 'FAILED'],
      SENT: ['DELIVERED', 'FAILED'],
      DELIVERED: [],
      FAILED: [],
      EXPIRED: [],
    };

    if (!allowedTransitions[currentStatus]?.includes(newStatus as JobStatus)) {
      return {
        success: false,
        error: `Invalid status transition from ${currentStatus} to ${newStatus}`,
      };
    }

    const updateFields: string[] = ['status = $2'];
    const updateParams: unknown[] = [jobId, newStatus];
    let paramIndex = 3;

    if (newStatus === 'SENT') {
      updateFields.push(`sent_at = NOW()`);
    } else if (newStatus === 'DELIVERED') {
      updateFields.push(`delivered_at = NOW()`);
    } else if (newStatus === 'FAILED') {
      updateFields.push(`failed_at = NOW()`);
      if (failureReason) {
        updateFields.push(`failure_reason = $${paramIndex++}`);
        updateParams.push(failureReason);
      }
    }

    await db.query(
      `UPDATE sms_jobs SET ${updateFields.join(', ')} WHERE id = $1`,
      updateParams
    );

    return { success: true, status: newStatus as JobStatus };
  }

  /**
   * Enqueues a new SMS job associated with an OTP challenge.
   */
  public static async enqueueJob(
    projectId: string,
    challengeId: string | null,
    phone: string,
    message: string
  ): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO sms_jobs (project_id, challenge_id, phone_number, message, status)
       VALUES ($1, $2, $3, $4, 'QUEUED')
       RETURNING id`,
      [projectId, challengeId, phone, message]
    );

    return result.rows[0].id;
  }

  /**
   * Gets current queue metrics for health monitoring.
   */
  public static async getQueueMetrics(): Promise<{
    depth: number;
    oldestLagSeconds: number | null;
  }> {
    const result = await db.query<{ count: string; oldest_created: string | null }>(
      `SELECT COUNT(*) as count, MIN(created_at) as oldest_created
       FROM sms_jobs
       WHERE status = 'QUEUED'`
    );

    const depth = parseInt(result.rows[0]?.count || '0', 10);
    const oldestCreated = result.rows[0]?.oldest_created;
    let oldestLagSeconds: number | null = null;

    if (oldestCreated) {
      oldestLagSeconds = Math.max(0, Math.floor((Date.now() - new Date(oldestCreated).getTime()) / 1000));
    }

    return { depth, oldestLagSeconds };
  }
}
