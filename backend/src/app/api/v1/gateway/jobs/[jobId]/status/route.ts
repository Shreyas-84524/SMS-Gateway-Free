import { NextRequest, NextResponse } from 'next/server';
import { authenticateGateway } from '@/lib/auth/middleware';
import { JobQueue } from '@/lib/queue/job-queue';
import { UpdateJobStatusRequest } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
): Promise<NextResponse> {
  const auth = await authenticateGateway(request);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { jobId } = params;
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
  }

  try {
    const body = (await request.json()) as UpdateJobStatusRequest;

    if (!body || !body.status) {
      return NextResponse.json({ error: 'Field "status" is required' }, { status: 400 });
    }

    const failureReason = body.error_message || body.error_code;
    const result = await JobQueue.updateJobStatus(
      jobId,
      auth.context.gateway.id,
      body.status,
      failureReason
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        job_id: jobId,
        updated_status: result.status,
        acknowledged_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('API Error /api/v1/gateway/jobs/[jobId]/status:', error);
    return NextResponse.json(
      { error: 'Internal error updating job status' },
      { status: 500 }
    );
  }
}
