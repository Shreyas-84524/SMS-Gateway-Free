import { db } from '../db/client';
import { generateProjectKey, generateGatewayKey } from '../auth/keys';
import { Project, Gateway, KeyEnvironment } from '@/types';

export class AdminService {
  /**
   * Creates a new client project.
   */
  public static async createProject(
    name: string,
    slug: string,
    config: Record<string, unknown> = {}
  ): Promise<Project> {
    const result = await db.query<Project>(
      `INSERT INTO projects (name, slug, config)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, slug, JSON.stringify(config)]
    );

    return result.rows[0];
  }

  /**
   * Generates a new Project API Key.
   * Returns plaintext key ONCE.
   */
  public static async createProjectKey(
    projectId: string,
    name = 'Primary Key',
    environment: KeyEnvironment = 'live'
  ): Promise<{ keyId: string; rawKey: string; keyPrefix: string }> {
    const { rawKey, keyPrefix, keyHash } = generateProjectKey(environment);

    const result = await db.query<{ id: string }>(
      `INSERT INTO project_api_keys (project_id, key_prefix, key_hash, name, environment, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING id`,
      [projectId, keyPrefix, keyHash, name, environment]
    );

    return {
      keyId: result.rows[0].id,
      rawKey,
      keyPrefix,
    };
  }

  /**
   * Revokes a Project API Key.
   */
  public static async revokeProjectKey(keyId: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE project_api_keys
       SET status = 'REVOKED', revoked_at = NOW()
       WHERE id = $1`,
      [keyId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Registers a new physical Android Gateway device.
   */
  public static async registerGateway(
    name: string,
    deviceId?: string,
    model?: string
  ): Promise<Gateway> {
    const result = await db.query<Gateway>(
      `INSERT INTO gateways (name, device_id, model)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, deviceId || null, model || null]
    );

    return result.rows[0];
  }

  /**
   * Generates a new Gateway API Key.
   * Returns plaintext key ONCE.
   */
  public static async createGatewayKey(
    gatewayId: string,
    name = 'Device Key'
  ): Promise<{ keyId: string; rawKey: string; keyPrefix: string }> {
    const { rawKey, keyPrefix, keyHash } = generateGatewayKey('live');

    const result = await db.query<{ id: string }>(
      `INSERT INTO gateway_api_keys (gateway_id, key_prefix, key_hash, name, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING id`,
      [gatewayId, keyPrefix, keyHash, name]
    );

    return {
      keyId: result.rows[0].id,
      rawKey,
      keyPrefix,
    };
  }

  /**
   * Revokes a Gateway API Key.
   */
  public static async revokeGatewayKey(keyId: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE gateway_api_keys
       SET status = 'REVOKED', revoked_at = NOW()
       WHERE id = $1`,
      [keyId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Lists all projects with key counts.
   */
  public static async listProjects(): Promise<Array<Project & { key_count: number; active_keys: string[] }>> {
    const result = await db.query<Project & { key_count: string; active_prefixes: string | null }>(
      `SELECT p.*,
              COUNT(k.id) AS key_count,
              STRING_AGG(CASE WHEN k.status = 'ACTIVE' THEN k.key_prefix ELSE NULL END, ', ') AS active_prefixes
       FROM projects p
       LEFT JOIN project_api_keys k ON k.project_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );

    return result.rows.map((row) => ({
      ...row,
      key_count: parseInt(row.key_count as unknown as string, 10) || 0,
      active_keys: (row as any).active_prefixes ? (row as any).active_prefixes.split(', ') : [],
    }));
  }

  /**
   * Retrieves all API keys for a project (safe metadata only).
   */
  public static async getProjectKeys(
    projectId: string
  ): Promise<Array<{ id: string; key_prefix: string; name: string; environment: string; status: string; created_at: Date; revoked_at: Date | null }>> {
    const result = await db.query<{ id: string; key_prefix: string; name: string; environment: string; status: string; created_at: Date; revoked_at: Date | null }>(
      `SELECT id, key_prefix, name, environment, status, created_at, revoked_at
       FROM project_api_keys
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId]
    );

    return result.rows;
  }

  /**
   * Lists all registered gateways with computed online status (last seen within 2 mins).
   */
  public static async listGateways(): Promise<Array<Gateway & { is_online: boolean; key_count: number }>> {
    const result = await db.query<Gateway & { is_online: boolean; key_count: string }>(
      `SELECT g.*,
              (g.last_seen_at IS NOT NULL AND g.last_seen_at > NOW() - INTERVAL '2 minutes') AS is_online,
              COUNT(k.id) AS key_count
       FROM gateways g
       LEFT JOIN gateway_api_keys k ON k.gateway_id = g.id
       GROUP BY g.id
       ORDER BY g.created_at DESC`
    );

    return result.rows.map((row) => ({
      ...row,
      key_count: parseInt(row.key_count as unknown as string, 10) || 0,
    }));
  }

  /**
   * Retrieves all API keys for a gateway (safe metadata only).
   */
  public static async getGatewayKeys(
    gatewayId: string
  ): Promise<Array<{ id: string; key_prefix: string; name: string; status: string; created_at: Date; revoked_at: Date | null }>> {
    const result = await db.query<{ id: string; key_prefix: string; name: string; status: string; created_at: Date; revoked_at: Date | null }>(
      `SELECT id, key_prefix, name, status, created_at, revoked_at
       FROM gateway_api_keys
       WHERE gateway_id = $1
       ORDER BY created_at DESC`,
      [gatewayId]
    );

    return result.rows;
  }

  /**
   * Gets queue metrics (queued, claimed, sent, delivered, failed counts and oldest queued job).
   */
  public static async getQueueMetrics(): Promise<{
    queued: number;
    claimed: number;
    sent: number;
    delivered: number;
    failed: number;
    oldest_queued_at: Date | null;
  }> {
    const countsRes = await db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count
       FROM sms_jobs
       GROUP BY status`
    );

    const counts: Record<string, number> = {};
    for (const row of countsRes.rows) {
      counts[row.status] = parseInt(row.count, 10) || 0;
    }

    const oldestRes = await db.query<{ created_at: Date }>(
      `SELECT created_at FROM sms_jobs
       WHERE status = 'QUEUED'
       ORDER BY created_at ASC
       LIMIT 1`
    );

    return {
      queued: counts['QUEUED'] || 0,
      claimed: counts['CLAIMED'] || 0,
      sent: counts['SENT'] || 0,
      delivered: counts['DELIVERED'] || 0,
      failed: counts['FAILED'] || 0,
      oldest_queued_at: oldestRes.rows.length > 0 ? oldestRes.rows[0].created_at : null,
    };
  }
}

