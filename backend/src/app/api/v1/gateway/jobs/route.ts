import { NextRequest, NextResponse } from 'next/server';
import { authenticateGateway } from '@/lib/auth/middleware';
import { JobQueue } from '@/lib/queue/job-queue';
import { GatewayJobsResponse } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateGateway(request);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(10, Math.max(1, parseInt(searchParams.get('limit') || '1', 10)));
  const leaseSeconds = Math.min(180, Math.max(30, parseInt(searchParams.get('lease_seconds') || '60', 10)));

  try {
    const jobs = await JobQueue.claimJobs(auth.context.gateway.id, limit, leaseSeconds);

    const response: GatewayJobsResponse = {
      success: true,
      data: {
        jobs,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('API Error /api/v1/gateway/jobs:', error);
    return NextResponse.json(
      { error: 'Internal error claiming queued jobs' },
      { status: 500 }
    );
  }
}
