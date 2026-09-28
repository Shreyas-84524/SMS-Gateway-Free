import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { JobQueue } from '@/lib/queue/job-queue';
import { HealthCheckResponse } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const dbHealth = await db.healthCheck();
  const isDbHealthy = dbHealth.healthy;

  let queueDepth = 0;
  let queueLagSeconds: number | null = null;
  let activeGateways = 0;

  if (isDbHealthy) {
    try {
      const queueMetrics = await JobQueue.getQueueMetrics();
      queueDepth = queueMetrics.depth;
      queueLagSeconds = queueMetrics.oldestLagSeconds;

      // Count gateways seen within the last 5 minutes
      const gwRes = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM gateways
         WHERE is_active = TRUE AND last_seen_at >= NOW() - INTERVAL '5 minutes'`
      );
      activeGateways = parseInt(gwRes.rows[0]?.count || '0', 10);
    } catch (e) {
      console.error('Error querying health metrics:', e);
    }
  }

  const response = {
    status: isDbHealthy ? 'healthy' : 'unhealthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      database: isDbHealthy ? 'connected' : 'disconnected',
      queue_lag_seconds: queueLagSeconds,
      queue_depth: queueDepth,
      active_gateways: activeGateways,
      ...(isDbHealthy ? {} : { db_error: dbHealth.error }),
    },
  };

  return NextResponse.json(response, {
    status: isDbHealthy ? 200 : 503,
  });
}
