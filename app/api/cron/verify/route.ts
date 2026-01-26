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

    // Process all batches - loop until all are processed
    const batchLimit = Number(process.env.VERIFY_BATCH_LIMIT || 10);
    let batchOffset = 0;
    let batchNumber = 0;
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalNewlyVerified = 0;
    const startTime = Date.now();
    
    // Safety timeout: Vercel functions have timeout limits (60s Pro, 10s Hobby)
    // Set to 4 minutes to be safe, leaving buffer for response
    const MAX_RUNTIME_MS = Number(process.env.CRON_MAX_RUNTIME_MS || 240_000); // 4 minutes default
    
    console.log(`[CRON] Processing all batches (limit=${batchLimit}, max runtime=${MAX_RUNTIME_MS}ms)`);

    while (true) {
      // Check timeout
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`[CRON] Timeout reached, stopping at batch ${batchNumber + 1} (offset ${batchOffset})`);
        return NextResponse.json({
          success: true,
          timestamp: new Date().toISOString(),
          batches: batchNumber,
          totalProcessed,
          totalUpdated,
          totalNewlyVerified,
          stoppedDueToTimeout: true,
          lastOffset: batchOffset,
          message: `Processed ${batchNumber} batches before timeout. More batches may remain.`,
        });
      }

      batchNumber++;
      console.log(`[CRON] Processing batch #${batchNumber}: offset=${batchOffset}, limit=${batchLimit}`);

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
        console.error(`[CRON] Verification failed at batch ${batchNumber}: ${result.status}`, resultData);
        return NextResponse.json(
          { 
            error: 'Verification failed',
            status: result.status,
            details: resultData,
            batchesProcessed: batchNumber - 1,
            lastOffset: batchOffset,
          },
          { status: result.status }
        );
      }

      totalProcessed += resultData.total || 0;
      totalUpdated += resultData.updated || 0;
      totalNewlyVerified += resultData.newlyVerified || 0;

      console.log(`[CRON] Batch #${batchNumber} completed: ${resultData.total || 0} referrals processed, hasMore: ${resultData.hasMore}`);

      // Check if we're done
      if (!resultData.hasMore || (resultData.total || 0) < batchLimit) {
        console.log(`[CRON] All batches processed! Total: ${batchNumber} batches, ${totalProcessed} referrals`);
        break;
      }

      // Move to next batch
      batchOffset += batchLimit;
      
      // Small delay between batches to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      batches: batchNumber,
      totalProcessed,
      totalUpdated,
      totalNewlyVerified,
      stoppedDueToTimeout: false,
      message: `Successfully processed ${batchNumber} batches. ${totalProcessed} referrals processed, ${totalUpdated} updated, ${totalNewlyVerified} newly verified.`,
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
