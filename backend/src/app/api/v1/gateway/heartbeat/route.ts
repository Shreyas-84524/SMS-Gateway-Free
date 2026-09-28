import { NextRequest, NextResponse } from 'next/server';
import { authenticateGateway } from '@/lib/auth/middleware';
import { db } from '@/lib/db/client';
import { GatewayHeartbeatRequest } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateGateway(request);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as GatewayHeartbeatRequest;
    const gatewayId = auth.context.gateway.id;

    const updates: string[] = ['last_seen_at = NOW()'];
    const params: unknown[] = [gatewayId];
    let idx = 2;

    if (body.model !== undefined) {
      updates.push(`model = $${idx++}`);
      params.push(body.model);
    }
    if (body.android_sdk !== undefined) {
      updates.push(`android_sdk = $${idx++}`);
      params.push(body.android_sdk);
    }
    if (body.app_version !== undefined) {
      updates.push(`app_version = $${idx++}`);
      params.push(body.app_version);
    }
    if (body.sim_status !== undefined) {
      updates.push(`sim_status = $${idx++}`);
      params.push(body.sim_status);
    }
    if (body.battery_pct !== undefined) {
      updates.push(`battery_pct = $${idx++}`);
      params.push(body.battery_pct);
    }
    if (body.worker_enabled !== undefined) {
      updates.push(`worker_enabled = $${idx++}`);
      params.push(body.worker_enabled);
    }

    await db.query(
      `UPDATE gateways SET ${updates.join(', ')} WHERE id = $1`,
      params
    );

    return NextResponse.json({
      success: true,
      data: {
        last_seen_at: new Date().toISOString(),
        backend_timestamp: Math.floor(Date.now() / 1000),
      },
    });
  } catch (error) {
    console.error('API Error /api/v1/gateway/heartbeat:', error);
    return NextResponse.json(
      { error: 'Internal error processing heartbeat' },
      { status: 500 }
    );
  }
}
