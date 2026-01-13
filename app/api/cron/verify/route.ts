import { NextRequest, NextResponse } from 'next/server';

/**
 * Cron job endpoint for Vercel
 * This endpoint is called by Vercel's cron service
 * It validates the Vercel cron secret and then triggers verification
 */
export async function GET(request: NextRequest) {
  try {
    // Verify the request is coming from Vercel Cron
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('[CRON] CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'Server misconfigured' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('[CRON] Invalid authorization header');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[CRON] Triggering verification from cron job...');

    // Call the verification API internally
    const verifyApiKey = process.env.VERIFY_API_KEY;
    if (!verifyApiKey) {
      console.error('[CRON] VERIFY_API_KEY not configured');
      return NextResponse.json(
        { error: 'Server misconfigured' },
        { status: 500 }
      );
    }

    // Get the base URL for the API call
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : request.nextUrl.origin;

    const verifyUrl = `${baseUrl}/api/verify`;
    console.log(`[CRON] Calling ${verifyUrl}`);

    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-verify-key': verifyApiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CRON] Verification failed: ${response.status}`, errorText);
      return NextResponse.json(
        { 
          error: 'Verification failed',
          status: response.status,
          details: errorText
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('[CRON] Verification completed successfully:', result);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (error: any) {
    console.error('[CRON] Error in cron job:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error.message 
      },
      { status: 500 }
    );
  }
}
