#!/usr/bin/env tsx
import { AdminService } from '../src/lib/admin/service';
import { db } from '../src/lib/db/client';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
========================================================================
              Global OTP Platform — Administrative CLI
========================================================================

Usage:
  npx tsx scripts/admin-cli.ts <command> [arguments...]

Projects:
  list-projects                             List all registered client projects
  list-project-keys <projectId>             List API keys for a project (safe metadata)
  create-project <name> <slug> [configJson] Create a new client project
  create-project-key <projectId> [name] [live|test]  Generate new project API key
  revoke-project-key <keyId>                Revoke an active project API key

Gateways:
  list-gateways                             List all gateway devices with online telemetry
  list-gateway-keys <gatewayId>             List API keys for a gateway (safe metadata)
  register-gateway <name> [deviceId] [model] Register a physical gateway handset
  create-gateway-key <gatewayId> [name]     Generate new gateway API key
  revoke-gateway-key <keyId>                Revoke an active gateway API key

Telemetry & Queue:
  queue-status                              Show SMS queue depth and job counts
  status-dashboard                          Display complete system overview
========================================================================
`);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'create-project': {
        const name = args[1];
        const slug = args[2];
        const configJson = args[3] ? JSON.parse(args[3]) : {};
        if (!name || !slug) {
          console.error('Error: name and slug are required');
          process.exit(1);
        }
        const project = await AdminService.createProject(name, slug, configJson);
        console.log('✅ Project created successfully:');
        console.log(JSON.stringify(project, null, 2));
        break;
      }

      case 'create-project-key': {
        const projectId = args[1];
        const name = args[2] || 'Primary Key';
        const env = (args[3] as 'live' | 'test') || 'live';
        if (!projectId) {
          console.error('Error: projectId is required');
          process.exit(1);
        }
        const keyData = await AdminService.createProjectKey(projectId, name, env);
        console.log('✅ Project API Key generated:');
        console.log('---------------------------------------------------------');
        console.log(`Key ID:     ${keyData.keyId}`);
        console.log(`Prefix:     ${keyData.keyPrefix}`);
        console.log(`PLAINTEXT:  ${keyData.rawKey}`);
        console.log('---------------------------------------------------------');
        console.log('⚠️  Copy this key now. It will NEVER be shown again.');
        break;
      }

      case 'revoke-project-key': {
        const keyId = args[1];
        if (!keyId) {
          console.error('Error: keyId is required');
          process.exit(1);
        }
        const success = await AdminService.revokeProjectKey(keyId);
        console.log(success ? '✅ Project key revoked' : '❌ Key not found');
        break;
      }

      case 'list-projects': {
        const projects = await AdminService.listProjects();
        console.log(`\n📋 Registered Projects (${projects.length}):`);
        console.table(
          projects.map((p) => ({
            ID: p.id,
            Name: p.name,
            Slug: p.slug,
            Enabled: p.enabled ? 'YES' : 'NO',
            Keys: p.key_count,
            'Active Prefixes': p.active_keys.join(', ') || 'None',
            Config: JSON.stringify(p.config),
          }))
        );
        break;
      }

      case 'list-project-keys': {
        const projectId = args[1];
        if (!projectId) {
          console.error('Error: projectId is required');
          process.exit(1);
        }
        const keys = await AdminService.getProjectKeys(projectId);
        console.log(`\n🔑 API Keys for Project ${projectId}:`);
        console.table(
          keys.map((k) => ({
            'Key ID': k.id,
            Prefix: `${k.key_prefix}••••••••`,
            Name: k.name,
            Env: k.environment,
            Status: k.status,
            Created: k.created_at,
            Revoked: k.revoked_at || '-',
          }))
        );
        break;
      }

      case 'register-gateway': {
        const name = args[1];
        const deviceId = args[2];
        const model = args[3];
        if (!name) {
          console.error('Error: gateway name is required');
          process.exit(1);
        }
        const gw = await AdminService.registerGateway(name, deviceId, model);
        console.log('✅ Gateway registered:');
        console.log(JSON.stringify(gw, null, 2));
        break;
      }

      case 'create-gateway-key': {
        const gatewayId = args[1];
        const name = args[2] || 'Device Key';
        if (!gatewayId) {
          console.error('Error: gatewayId is required');
          process.exit(1);
        }
        const keyData = await AdminService.createGatewayKey(gatewayId, name);
        console.log('✅ Gateway API Key generated:');
        console.log('---------------------------------------------------------');
        console.log(`Key ID:     ${keyData.keyId}`);
        console.log(`Prefix:     ${keyData.keyPrefix}`);
        console.log(`PLAINTEXT:  ${keyData.rawKey}`);
        console.log('---------------------------------------------------------');
        console.log('⚠️  Copy this key now. It will NEVER be shown again.');
        break;
      }

      case 'revoke-gateway-key': {
        const keyId = args[1];
        if (!keyId) {
          console.error('Error: keyId is required');
          process.exit(1);
        }
        const success = await AdminService.revokeGatewayKey(keyId);
        console.log(success ? '✅ Gateway key revoked' : '❌ Key not found');
        break;
      }

      case 'list-gateways': {
        const gateways = await AdminService.listGateways();
        console.log(`\n📱 Registered Gateways (${gateways.length}):`);
        console.table(
          gateways.map((g) => ({
            ID: g.id,
            Name: g.name,
            DeviceID: g.device_id || '-',
            Model: g.model || '-',
            Status: g.is_online ? '🟢 ONLINE' : '⚪ OFFLINE',
            SIM: g.sim_status,
            Battery: g.battery_pct != null ? `${g.battery_pct}%` : '-',
            Worker: g.worker_enabled ? 'ON' : 'OFF',
            'Last Seen': g.last_seen_at || 'Never',
          }))
        );
        break;
      }

      case 'list-gateway-keys': {
        const gatewayId = args[1];
        if (!gatewayId) {
          console.error('Error: gatewayId is required');
          process.exit(1);
        }
        const keys = await AdminService.getGatewayKeys(gatewayId);
        console.log(`\n🔑 API Keys for Gateway ${gatewayId}:`);
        console.table(
          keys.map((k) => ({
            'Key ID': k.id,
            Prefix: `${k.key_prefix}••••••••`,
            Name: k.name,
            Status: k.status,
            Created: k.created_at,
            Revoked: k.revoked_at || '-',
          }))
        );
        break;
      }

      case 'queue-status': {
        const metrics = await AdminService.getQueueMetrics();
        console.log('\n📊 SMS Job Queue Telemetry:');
        console.table([
          {
            QUEUED: metrics.queued,
            CLAIMED: metrics.claimed,
            SENT: metrics.sent,
            DELIVERED: metrics.delivered,
            FAILED: metrics.failed,
            'Oldest Queued': metrics.oldest_queued_at || 'None',
          },
        ]);
        break;
      }

      case 'status-dashboard': {
        const projects = await AdminService.listProjects();
        const gateways = await AdminService.listGateways();
        const queue = await AdminService.getQueueMetrics();

        console.log('\n===============================================================');
        console.log('             Global OTP Platform — Status Overview            ');
        console.log('===============================================================');
        console.log(`\n📦 Active Projects: ${projects.filter((p) => p.enabled).length} / ${projects.length}`);
        console.table(
          projects.map((p) => ({
            Name: p.name,
            Slug: p.slug,
            Enabled: p.enabled ? 'YES' : 'NO',
            Keys: p.key_count,
            Prefixes: p.active_keys.join(', ') || '-',
          }))
        );

        console.log(`\n📱 Gateways: ${gateways.filter((g) => g.is_online).length} Online / ${gateways.length} Total`);
        console.table(
          gateways.map((g) => ({
            Name: g.name,
            Status: g.is_online ? '🟢 ONLINE' : '⚪ OFFLINE',
            SIM: g.sim_status,
            Battery: g.battery_pct != null ? `${g.battery_pct}%` : '-',
            Worker: g.worker_enabled ? 'ON' : 'OFF',
            'Last Seen': g.last_seen_at || 'Never',
          }))
        );

        console.log('\n📊 SMS Queue:');
        console.table([
          {
            QUEUED: queue.queued,
            CLAIMED: queue.claimed,
            SENT: queue.sent,
            DELIVERED: queue.delivered,
            FAILED: queue.failed,
            'Oldest Queued': queue.oldest_queued_at || 'None',
          },
        ]);
        console.log('===============================================================\n');
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Command failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main();
}
