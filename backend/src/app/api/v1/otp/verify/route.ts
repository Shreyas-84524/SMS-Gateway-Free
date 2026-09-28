import { NextRequest, NextResponse } from 'next/server';
import { authenticateProject } from '@/lib/auth/middleware';
import { OtpService } from '@/lib/otp/service';
import { VerifyOtpRequest } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateProject(request);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const rawBody = (await request.json()) as Record<string, any>;
    const phone = rawBody?.phone || rawBody?.phone_number;
    const requestId = rawBody?.request_id || rawBody?.challenge_id;
    const otp = rawBody?.otp || rawBody?.code;

    if (!rawBody || !phone || !requestId || !otp) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Fields ("phone" or "phone_number"), ("request_id" or "challenge_id"), and ("otp" or "code") are required',
          },
        },
        { status: 400 }
      );
    }

    const payload: VerifyOtpRequest = {
      phone,
      request_id: requestId,
      otp: String(otp).trim(),
    };

    const result = await OtpService.verifyOtp(auth.context.project, payload);

    if (result.status === 200) {
      return NextResponse.json(
        {
          success: true,
          verified: true,
          data: {
            verified: true,
            challenge_id: requestId,
            verified_at: new Date().toISOString(),
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('API Error /api/v1/otp/verify:', error);
    return NextResponse.json(
      {
        success: false,
        verified: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid JSON payload or internal error',
        },
      },
      { status: 400 }
    );
  }
}
