#!/usr/bin/env tsx
import { AdminService } from '../src/lib/admin/service';
import { db } from '../src/lib/db/client';

async function seed() {
  console.log('Seeding Development Test Project and Gateway...');
  try {
    // 1. Create Development Test Project
    const project = await AdminService.createProject(
      'Global OTP Development Test',
      'global-otp-dev-test',
      {
        cooldown_seconds: 30,
        hourly_limit: 10,
        expiry_seconds: 300,
        max_attempts: 3,
      }
    );
    console.log(`✅ Test Project created: ${project.name} (ID: ${project.id})`);

    // 2. Generate Project Test Key
    const projKey = await AdminService.createProjectKey(
      project.id,
      'Development Test Key',
      'test'
    );
    console.log(`✅ Test Project Key generated:`);
    console.log(`   Key ID:  ${projKey.keyId}`);
    console.log(`   Prefix:  ${projKey.keyPrefix}`);
    console.log(`   Key:     ${projKey.rawKey}`);

    // 3. Register Development Test Gateway
    const gateway = await AdminService.registerGateway(
      'Development Android Gateway',
      'gw_android_dev_test',
      'Android Emulator / Test Phone'
    );
    console.log(`✅ Test Gateway registered: ${gateway.name} (ID: ${gateway.id})`);

    // 4. Generate Gateway Test Key
    const gwKey = await AdminService.createGatewayKey(
      gateway.id,
      'Development Gateway Key'
    );
    console.log(`✅ Test Gateway Key generated:`);
    console.log(`   Key ID:  ${gwKey.keyId}`);
    console.log(`   Prefix:  ${gwKey.keyPrefix}`);
    console.log(`   Key:     ${gwKey.rawKey}`);

    console.log('\nSeeding completed successfully.');
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  seed();
}
