import crypto from 'crypto';
import { Project, ProjectApiKey, OtpChallenge, SmsJob, Gateway, GatewayApiKey } from '@/types';

export class MockDatabase {
  public projects: Project[] = [];
  public projectApiKeys: ProjectApiKey[] = [];
  public otpChallenges: OtpChallenge[] = [];
  public smsJobs: SmsJob[] = [];
  public gateways: Gateway[] = [];
  public gatewayApiKeys: GatewayApiKey[] = [];

  public clear(): void {
    this.projects = [];
    this.projectApiKeys = [];
    this.otpChallenges = [];
    this.smsJobs = [];
    this.gateways = [];
    this.gatewayApiKeys = [];
  }

  public insertProject(project: Partial<Project>): Project {
    const fullProject: Project = {
      id: project.id || crypto.randomUUID(),
      name: project.name || 'Test Project',
      slug: project.slug || 'test-project',
      enabled: project.enabled !== undefined ? project.enabled : true,
      config: project.config || {},
      created_at: project.created_at || new Date(),
      updated_at: project.updated_at || new Date(),
    };
    this.projects.push(fullProject);
    return fullProject;
  }

  public insertProjectKey(key: Partial<ProjectApiKey>): ProjectApiKey {
    const fullKey: ProjectApiKey = {
      id: key.id || crypto.randomUUID(),
      project_id: key.project_id!,
      key_prefix: key.key_prefix || 'otp_proj_test_',
      key_hash: key.key_hash!,
      name: key.name || 'Key',
      environment: key.environment || 'test',
      status: key.status || 'ACTIVE',
      created_at: key.created_at || new Date(),
      revoked_at: key.revoked_at || null,
    };
    this.projectApiKeys.push(fullKey);
    return fullKey;
  }

  public insertGateway(gateway: Partial<Gateway>): Gateway {
    const fullGw: Gateway = {
      id: gateway.id || crypto.randomUUID(),
      name: gateway.name || 'Test Gateway',
      device_id: gateway.device_id || null,
      model: gateway.model || 'Pixel 7a',
      android_sdk: gateway.android_sdk || 34,
      app_version: gateway.app_version || '1.0.0',
      sim_status: gateway.sim_status || 'READY',
      battery_pct: gateway.battery_pct || 90,
      worker_enabled: gateway.worker_enabled !== undefined ? gateway.worker_enabled : true,
      is_active: gateway.is_active !== undefined ? gateway.is_active : true,
      last_seen_at: gateway.last_seen_at || new Date(),
      created_at: gateway.created_at || new Date(),
    };
    this.gateways.push(fullGw);
    return fullGw;
  }

  public insertGatewayKey(key: Partial<GatewayApiKey>): GatewayApiKey {
    const fullKey: GatewayApiKey = {
      id: key.id || crypto.randomUUID(),
      gateway_id: key.gateway_id!,
      key_prefix: key.key_prefix || 'otp_gw_test_',
      key_hash: key.key_hash!,
      name: key.name || 'GW Key',
      status: key.status || 'ACTIVE',
      created_at: key.created_at || new Date(),
      revoked_at: key.revoked_at || null,
    };
    this.gatewayApiKeys.push(fullKey);
    return fullKey;
  }
}

export const mockDb = new MockDatabase();
