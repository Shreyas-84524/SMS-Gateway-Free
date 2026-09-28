import { NextRequest } from 'next/server';
import { hashApiKey } from './keys';
import { db } from '../db/client';
import { Project, Gateway } from '@/types';

export interface AuthenticatedProjectContext {
  project: Project;
  keyId: string;
}

export interface AuthenticatedGatewayContext {
  gateway: Gateway;
  keyId: string;
}

/**
 * Extracts raw API key from request headers.
 */
function extractHeaderKey(request: NextRequest, primaryHeader: string): string | null {
  const customHeader = request.headers.get(primaryHeader);
  if (customHeader) {
    return customHeader.trim();
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

/**
 * Authenticates an incoming client project request.
 */
export async function authenticateProject(
  request: NextRequest
): Promise<{ success: true; context: AuthenticatedProjectContext } | { success: false; status: number; error: string }> {
  const rawKey = extractHeaderKey(request, 'x-project-key');
  if (!rawKey) {
    return { success: false, status: 401, error: 'Missing X-Project-Key or Bearer authorization header' };
  }

  if (!rawKey.startsWith('otp_proj_')) {
    return { success: false, status: 401, error: 'Invalid project key format' };
  }

  const keyHash = hashApiKey(rawKey);

  try {
    const result = await db.query<Project & { key_id: string; key_status: string; project_enabled: boolean }>(
      `SELECT p.id, p.name, p.slug, p.enabled, p.config, p.created_at, p.updated_at,
              k.id as key_id, k.status as key_status
       FROM project_api_keys k
       JOIN projects p ON p.id = k.project_id
       WHERE k.key_hash = $1`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return { success: false, status: 401, error: 'Invalid API key' };
    }

    const row = result.rows[0];

    if (row.key_status !== 'ACTIVE') {
      return { success: false, status: 401, error: 'API key has been revoked' };
    }

    if (!row.enabled) {
      return { success: false, status: 403, error: 'Project has been disabled' };
    }

    return {
      success: true,
      context: {
        project: {
          id: row.id,
          name: row.name,
          slug: row.slug,
          enabled: row.enabled,
          config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config || {},
          created_at: new Date(row.created_at),
          updated_at: new Date(row.updated_at),
        },
        keyId: row.key_id,
      },
    };
  } catch (error) {
    console.error('Project authentication error:', error);
    return { success: false, status: 500, error: 'Internal server authentication error' };
  }
}

/**
 * Authenticates an incoming Android Gateway worker request.
 */
export async function authenticateGateway(
  request: NextRequest
): Promise<{ success: true; context: AuthenticatedGatewayContext } | { success: false; status: number; error: string }> {
  const rawKey = extractHeaderKey(request, 'x-gateway-key');
  if (!rawKey) {
    return { success: false, status: 401, error: 'Missing X-Gateway-Key or Bearer authorization header' };
  }

  if (!rawKey.startsWith('otp_gw_')) {
    return { success: false, status: 401, error: 'Invalid gateway key format' };
  }

  const keyHash = hashApiKey(rawKey);

  try {
    const result = await db.query<Gateway & { key_id: string; key_status: string }>(
      `SELECT g.id, g.name, g.device_id, g.model, g.android_sdk, g.app_version,
              g.sim_status, g.battery_pct, g.worker_enabled, g.is_active, g.last_seen_at, g.created_at,
              k.id as key_id, k.status as key_status
       FROM gateway_api_keys k
       JOIN gateways g ON g.id = k.gateway_id
       WHERE k.key_hash = $1`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return { success: false, status: 401, error: 'Invalid gateway key' };
    }

    const row = result.rows[0];

    if (row.key_status !== 'ACTIVE') {
      return { success: false, status: 401, error: 'Gateway key has been revoked' };
    }

    if (!row.is_active) {
      return { success: false, status: 403, error: 'Gateway has been deactivated' };
    }

    return {
      success: true,
      context: {
        gateway: {
          id: row.id,
          name: row.name,
          device_id: row.device_id,
          model: row.model,
          android_sdk: row.android_sdk,
          app_version: row.app_version,
          sim_status: row.sim_status,
          battery_pct: row.battery_pct,
          worker_enabled: row.worker_enabled,
          is_active: row.is_active,
          last_seen_at: row.last_seen_at ? new Date(row.last_seen_at) : null,
          created_at: new Date(row.created_at),
        },
        keyId: row.key_id,
      },
    };
  } catch (error) {
    console.error('Gateway authentication error:', error);
    return { success: false, status: 500, error: 'Internal server authentication error' };
  }
}

/**
 * Validates administrative requests.
 */
export function authenticateAdmin(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) return false;

  const key = extractHeaderKey(request, 'x-admin-key');
  return key === adminSecret;
}
