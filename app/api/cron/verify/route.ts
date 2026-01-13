import { NextRequest, NextResponse } from 'next/server';
import { POST as verifyPOST } from '../../verify/route';

/**
 * Cron job endpoint for Vercel
 * This endpoint is called by Vercel's cron service
 * It validates the Vercel cron secret and then triggers verification
 * 
 * Note: We directly import and call the verification logic instead of making
 * an HTTP request to avoid issues with Vercel's deployment protection.
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

    // Create a mock request with the VERIFY_API_KEY header
    const verifyApiKey = process.env.VERIFY_API_KEY;
    if (!verifyApiKey) {
      console.error('[CRON] VERIFY_API_KEY not configured');
      return NextResponse.json(
        { error: 'Server misconfigured' },
        { status: 500 }
      );
    }

    // Create a new request with the verify API key header
    const verifyRequest = new NextRequest(new URL('/api/verify', request.url), {
      method: 'POST',
      headers: {
        'x-verify-key': verifyApiKey,
      },
    });

    // Call the verification function directly
    const result = await verifyPOST(verifyRequest);
    const resultData = await result.json();

    if (!result.ok) {
      console.error(`[CRON] Verification failed: ${result.status}`, resultData);
      return NextResponse.json(
        { 
          error: 'Verification failed',
          status: result.status,
          details: resultData
        },
        { status: result.status }
      );
    }

    console.log('[CRON] Verification completed successfully:', resultData);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result: resultData,
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
