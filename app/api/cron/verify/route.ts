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

    // Process in batches - call multiple times if needed
    const batchLimit = Number(process.env.VERIFY_BATCH_LIMIT || 100);
    let batchOffset = 0;
    let totalProcessed = 0;
    let allResults: any[] = [];
    const startTime = Date.now();
    const MAX_RUNTIME_MS = 240_000; // 4 minutes safety margin before 5min timeout

    // Process batches until we get less than batchLimit results (indicating we're done)
    while (true) {
      // Safety check: don't exceed runtime limit
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`[CRON] Reached max runtime limit (${MAX_RUNTIME_MS}ms), stopping`);
        break;
      }

      console.log(`[CRON] Processing batch: offset=${batchOffset}, limit=${batchLimit}`);

      // Create a new request with the verify API key header and batch parameters
      const verifyRequest = new NextRequest(
        new URL(`/api/verify?batch_limit=${batchLimit}&batch_offset=${batchOffset}`, request.url),
        {
          method: 'POST',
          headers: {
            'x-verify-key': verifyApiKey,
          },
        }
      );

      // Call the verification function directly
      const result = await verifyPOST(verifyRequest);
      const resultData = await result.json();

      if (!result.ok) {
        console.error(`[CRON] Verification failed at batch ${batchOffset}: ${result.status}`, resultData);
        // Don't break on error - return what we've processed so far
        break;
      }

      allResults.push(resultData);
      totalProcessed += resultData.total || 0;

      console.log(`[CRON] Batch ${batchOffset} completed: ${resultData.total || 0} referrals processed`);

      // If we got fewer results than the batch limit, we're done
      if (!resultData.hasMore || (resultData.total || 0) < batchLimit) {
        console.log(`[CRON] No more batches needed (hasMore=${resultData.hasMore}, total=${resultData.total})`);
        break;
      }

      batchOffset += batchLimit;
      
      // Safety: Don't loop forever (max 10 batches = 1000 referrals per cron run)
      if (batchOffset >= batchLimit * 10) {
        console.log(`[CRON] Reached max batches limit (${batchLimit * 10}), stopping`);
        break;
      }
    }

    console.log(`[CRON] Verification completed: ${allResults.length} batches, ${totalProcessed} total referrals processed`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      batches: allResults.length,
      totalProcessed,
      results: allResults,
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
