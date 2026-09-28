import { NextRequest, NextResponse } from 'next/server';
import { authenticateProject } from '@/lib/auth/middleware';
import { OtpService } from '@/lib/otp/service';
import { SendOtpRequest } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateProject(request);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const rawBody = (await request.json()) as Record<string, any>;
    const phone = rawBody?.phone || rawBody?.phone_number;

    if (!rawBody || !phone) {
      return NextResponse.json(
        { error: 'Field "phone" or "phone_number" is required' },
        { status: 400 }
      );
    }

    const idempotencyKey =
      request.headers.get('idempotency-key') ||
      request.headers.get('x-idempotency-key') ||
      rawBody.idempotency_key ||
      undefined;

    const payload: SendOtpRequest = {
      phone,
      template: rawBody.template,
      code_length: rawBody.code_length,
      expiry_seconds: rawBody.expiry_seconds,
      idempotency_key: idempotencyKey,
      metadata: rawBody.metadata,
    };

    const result = await OtpService.sendOtp(auth.context.project, payload);

    if (result.status === 200 && 'request_id' in result.body) {
      const respData = {
        success: true,
        data: {
          challenge_id: result.body.request_id,
          phone_number: phone,
          status: 'QUEUED',
          expires_in: result.body.expires_in,
          retry_after_seconds: result.body.resend_after,
        },
        request_id: result.body.request_id,
        challenge_id: result.body.request_id,
        expires_in: result.body.expires_in,
        resend_after: result.body.resend_after,
      };
      return NextResponse.json(respData, { status: 200 });
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('API Error /api/v1/otp/send:', error);
    return NextResponse.json(
      { error: 'Invalid JSON payload or internal error' },
      { status: 400 }
    );
  }
}
