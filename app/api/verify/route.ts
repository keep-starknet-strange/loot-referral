import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

// Server-only environment variables (not exposed to client)
const LOOT_SURVIVOR_CONTRACT = process.env.NEXT_PUBLIC_LOOT_SURVIVOR_CONTRACT || '0x06f7c4350d6d5ee926b3ac4fa0c9c351055456e75c92227468d84232fc493a9c';
const ALCHEMY_RPC_URL = process.env.STARKNET_RPC;
const VERIFY_API_KEY = process.env.VERIFY_API_KEY;

if (!ALCHEMY_RPC_URL) {
  throw new Error(
    'Missing STARKNET_RPC environment variable. ' +
    'This server-only variable is required for on-chain verification. ' +
    'Add it to your .env.local file (without NEXT_PUBLIC_ prefix).'
  );
}

// TypeScript assertion: ALCHEMY_RPC_URL is guaranteed to be defined after the check above
const RPC_URL: string = ALCHEMY_RPC_URL;

// Helper to gate sensitive logs in production
const isDevelopment = process.env.NODE_ENV === 'development';
const logSensitive = (...args: any[]) => {
  if (isDevelopment) {
    console.log(...args);
  }
};
const logError = (...args: any[]) => {
  // Always log errors, but sanitize sensitive data in production
  if (isDevelopment) {
    console.error(...args);
  } else {
    // In production, log errors without sensitive data
    const sanitized = args.map(arg => {
      if (typeof arg === 'string' && arg.includes('0x')) {
        // Truncate addresses/hashes in production logs
        return arg.replace(/0x[a-fA-F0-9]{60,}/g, (match) => `${match.slice(0, 10)}...`);
      }
      if (typeof arg === 'object' && arg !== null) {
        // Remove sensitive fields from objects in production
        const { referee_address, address, hash, transaction_hash, ...rest } = arg as any;
        return rest;
      }
      return arg;
    });
    console.error(...sanitized);
  }
};

/**
 * Get the selector for "start_game" function
 */
function getStartGameSelector(): string {
  // The selector for "start_game" method in the Loot Survivor contract
  return '0x2214fe6a6e2545aebfe589b84884a2c528416482abec76605b7fdb1c31ce5b2';
}

/**
 * Helpers for verification
 */
type ReferralRow = {
  id: string;
  referee_address: string;
  referrer_address?: string;
  created_at: string;
  has_played?: boolean;
  last_checked_block?: number;
  games_played?: number;
};

type StarknetEvent = {
  from_address?: string;
  block_number?: number | string;
  transaction_hash?: string;
  keys?: string[];
  data?: string[];
};

type StarknetTransaction = {
  type?: string;
  sender?: string;
  contract_address?: string;
  entry_point_selector?: string;
  calldata?: any[];
  calls?: any[];
};

function parseBlockNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith('0x')) {
    const n = parseInt(v, 16);
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d+$/.test(v)) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (/^[0-9a-f]+$/.test(v)) {
    const n = parseInt(`0x${v}`, 16);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeFeltHex(value: any): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  const hex = v.startsWith('0x') ? v.slice(2) : v;
  if (!hex || !/^[0-9a-f]+$/.test(hex)) return null;
  try {
    const bn = BigInt(`0x${hex}`);
    return `0x${bn.toString(16)}`;
  } catch {
    return null;
  }
}

async function rpcRequest<T = any>(method: string, params: any[]): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  if (!response.ok) {
    throw new Error(`[VERIFY] RPC ${method} failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(`[VERIFY] RPC ${method} error: ${JSON.stringify(payload.error)}`);
  }
  return payload?.result as T;
}

async function getLatestBlockNumber(): Promise<number> {
  // Fetch once per verification run
  const result: any = await rpcRequest('starknet_blockHashAndNumber', []);
  const blockNumber = parseBlockNumber(result?.block_number ?? result);
  if (blockNumber === null) {
    throw new Error(`[VERIFY] Unexpected blockHashAndNumber result: ${JSON.stringify(result)}`);
  }
  return blockNumber;
}

/**
 * Batch fetch multiple transactions using JSON-RPC batch requests.
 * Keeps the same function name/signature, but chunks internally to avoid huge payloads.
 */
async function batchGetTransactions(txHashes: string[]): Promise<Map<string, StarknetTransaction>> {
  const txMap = new Map<string, StarknetTransaction>();
  if (txHashes.length === 0) return txMap;

  const MAX_BATCH = 100; // conservative to avoid provider payload limits
  for (let i = 0; i < txHashes.length; i += MAX_BATCH) {
    const chunk = txHashes.slice(i, i + MAX_BATCH);
    const batchPayload = chunk.map((hash, index) => ({
      jsonrpc: '2.0',
      id: index + 1,
      method: 'starknet_getTransactionByHash',
      params: [hash],
    }));

    logSensitive(`[VERIFY] Batch fetching ${chunk.length} transactions...`);

    try {
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchPayload),
      });

      if (!response.ok) {
        logError(`[VERIFY] Batch request failed: ${response.status} ${response.statusText}`);
        continue;
      }

      const results = await response.json();
      const responses = Array.isArray(results) ? results : [results];

      responses.forEach((result: any, idx: number) => {
        const hash = chunk[idx];
        if (!hash) return;
        if (result?.error) {
          logError(`[VERIFY] Error in batch response for tx ${hash}:`, result.error);
          return;
        }
        if (result?.result) {
          txMap.set(hash, result.result as StarknetTransaction);
        }
      });
    } catch (error) {
      logError(`[VERIFY] Error in batch transaction fetch:`, error);
      continue;
    }
  }

  logSensitive(`[VERIFY] Successfully fetched ${txMap.size} of ${txHashes.length} transactions`);
  return txMap;
}

function txCalldataHasSelector(tx: StarknetTransaction | undefined, selector: string): boolean {
  if (!tx || !tx.calldata || !Array.isArray(tx.calldata)) return false;
  const normalizedSelector = selector.toLowerCase();
  return tx.calldata.some((data: any) => {
    if (typeof data === 'string') {
      const v = data.toLowerCase();
      return (v.startsWith('0x') ? v : `0x${v}`) === normalizedSelector;
    }
    const v = String(data).toLowerCase();
    return (v.startsWith('0x') ? v : `0x${v}`) === normalizedSelector;
  });
}

async function fetchEventsForAddress(
  address: string,
  fromBlock: number,
  toBlock: number
): Promise<StarknetEvent[]> {
  const events: StarknetEvent[] = [];

  let continuationToken: string | undefined;
  let page = 0;
  const MAX_PAGES = 10_000;

  while (page < MAX_PAGES) {
    page++;
    const filter: any = {
      from_block: { block_number: fromBlock },
      to_block: { block_number: toBlock },
      // In Starknet getEvents, "address" is the emitting contract/account ("from_address" in returned events)
      address,
      keys: [],
      chunk_size: 1000,
    };
    if (continuationToken) filter.continuation_token = continuationToken;

    const result: any = await rpcRequest('starknet_getEvents', [filter]);
    const batch: StarknetEvent[] = Array.isArray(result?.events) ? result.events : [];
    events.push(...batch);

    continuationToken = result?.continuation_token;
    if (!continuationToken) break;
  }

  if (page >= MAX_PAGES) {
    logError(`[VERIFY] Hit MAX_PAGES=${MAX_PAGES} paginating getEvents for address ${address}`);
  }

  return events;
}

function createConcurrencyLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= concurrency) return;
    const job = queue.shift();
    if (!job) return;
    active++;
    job();
  };

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        } finally {
          active--;
          next();
        }
      });
      next();
    });
  };
}

/**
 * Process referrals and update their game counts using accumulative SQL increments
 * Uses RPC function to atomically increment games_played and update last_checked_block
 *
 * User-activity + calldata verification strategy:
 * - newGameCountByReferee: map referee_address -> delta count computed from tx calldata matches
 * - latestBlockNumber is fetched ONCE at the start of the run and used for all rows' new_block pointer
 */
async function processReferrals(
  referrals: ReferralRow[],
  isUnverified: boolean,
  newGameCountByReferee: Map<string, number>,
  latestBlockNumber: number,
  concurrency: number = 10
): Promise<{ updated: number; newlyVerified: number }> {
  const status = isUnverified ? 'unverified' : 'verified';
  const limit = createConcurrencyLimiter(concurrency);

  const results = await Promise.all(
    referrals.map((referral, idx) =>
      limit(async () => {
        const lastCheckedBlockRaw = referral.last_checked_block || 0;
        const currentGamesPlayed = referral.games_played || 0;
        const effectiveLastCheckedBlock = lastCheckedBlockRaw;

        logSensitive(
          `[VERIFY] [${idx + 1}/${referrals.length}] Checking ${status} referral ID: ${referral.id}, Address: ${referral.referee_address}, Last checked block: ${lastCheckedBlockRaw}, Effective last: ${effectiveLastCheckedBlock}, Current games: ${currentGamesPlayed}`
        );

        const normalizedReferee = normalizeFeltHex(referral.referee_address);
        const newGameCount = normalizedReferee ? (newGameCountByReferee.get(normalizedReferee) || 0) : 0;
        const newLastCheckedBlock = latestBlockNumber;

        // Always update last_checked_block, even if 0 new games found (to move pointer forward)
        // Use SQL increment to atomically add new games to existing count
        try {
          const { error: rpcError } = await supabaseAdmin.rpc('increment_game_count', {
            row_id: referral.id,
            new_games: newGameCount,
            new_block: newLastCheckedBlock,
          });

          if (rpcError) {
            logError(`[VERIFY] Error calling increment_game_count for referral ${referral.id}:`, rpcError);
            return { updated: 0, newlyVerified: 0 };
          }

          // Calculate new cumulative total (for logging)
          const newCumulativeTotal = currentGamesPlayed + newGameCount;

          // Note: has_played is automatically set by the SQL function if cumulative games_played > 0
          // Check if this referral was just verified (unverified -> has games now)
          const wasJustVerified = isUnverified && newCumulativeTotal > 0 && !referral.has_played;

          if (newGameCount > 0) {
            if (wasJustVerified) {
              logSensitive(
                `[VERIFY] ✓ Referral ${referral.id} verified - found ${newGameCount} new game(s), total: ${newCumulativeTotal}`
              );
              return { updated: 1, newlyVerified: 1 };
            }

            logSensitive(
              `[VERIFY] ✓ Referral ${referral.id} updated - found ${newGameCount} new game(s), total: ${newCumulativeTotal}`
            );
            return { updated: 1, newlyVerified: 0 };
          }

          logSensitive(
            `[VERIFY] ✗ Referral ${referral.id} - no new games since block ${effectiveLastCheckedBlock + 1} (pointer moved to ${newLastCheckedBlock})`
          );
          logSensitive(
            `[VERIFY] ✓ Updated referral ${referral.id}: +${newGameCount} games (total: ${newCumulativeTotal}), last checked block: ${newLastCheckedBlock}`
          );
          return { updated: 0, newlyVerified: 0 };
        } catch (error) {
          logError(`[VERIFY] Error processing referral ${referral.id}:`, error);
          return { updated: 0, newlyVerified: 0 };
        }
      })
    )
  );

  return results.reduce(
    (acc, r) => ({ updated: acc.updated + r.updated, newlyVerified: acc.newlyVerified + r.newlyVerified }),
    { updated: 0, newlyVerified: 0 }
  );
}

/**
 * POST /api/verify
 * Verify on-chain activity for referrals and update game counts
 * This can be called manually or via a cron job
 * Always updates game counts for all referrals, even if already verified
 */
export async function POST(request: NextRequest) {
  // Dev-only logs; keep production quiet
  logSensitive(`[VERIFY] ===== Starting verification process =====`);
  try {
    // Protect this endpoint: require a secret key (cron/admin-only).
    // Accept either:
    // - x-verify-key: <key>
    // - authorization: Bearer <key>
    const providedKey =
      request.headers.get('x-verify-key') ||
      (request.headers.get('authorization')?.startsWith('Bearer ')
        ? request.headers.get('authorization')?.slice('Bearer '.length)
        : null);

    if (!VERIFY_API_KEY) {
      if (!isDevelopment) {
        return NextResponse.json(
          { error: 'Server misconfigured: VERIFY_API_KEY is not set' },
          { status: 500, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      // Dev fallback: allow without key to ease local iteration.
    } else if (providedKey !== VERIFY_API_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Rate limit (by IP) to reduce DDoS risk even for authorized callers.
    const ip = getClientIp(request);
    const rl = rateLimit({ key: `verify:post:${ip}`, limit: 2, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    // Ensure only one verification run happens per runtime at a time.
    const g = globalThis as any;
    if (g.__verifyInFlight) {
      return NextResponse.json(
        { error: 'Verification already running' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    g.__verifyInFlight = true;

    // Event-First Strategy Step 0: Fetch latest block height ONCE
    logSensitive(`[VERIFY] Step 0: Fetching latest block number from Alchemy...`);
    const latestBlockNumber = await getLatestBlockNumber();
    logSensitive(
      `[VERIFY] Latest block number: ${latestBlockNumber} (decimal), 0x${latestBlockNumber.toString(16)} (hex)`
    );

    // Step 1: Process unverified referrals
    logSensitive(`[VERIFY] Step 1: Fetching unverified referrals from Supabase...`);
    const { data: unverifiedReferrals, error: unverifiedError } = await supabaseAdmin
      .from('referrals')
      .select('id, referee_address, created_at, has_played, last_checked_block, games_played')
      .eq('has_played', false);

    if (unverifiedError) {
      logError(`[VERIFY] Error fetching unverified referrals:`, unverifiedError);
      throw unverifiedError;
    }

    let unverifiedUpdated = 0;
    let newlyVerified = 0;

    // Step 2: Process all verified referrals to update game counts
    logSensitive(`[VERIFY] Step 2: Fetching verified referrals to update game counts...`);
    const { data: verifiedReferrals, error: verifiedError } = await supabaseAdmin
      .from('referrals')
      .select('id, referee_address, created_at, has_played, last_checked_block, games_played')
      .eq('has_played', true);

    if (verifiedError) {
      logError(`[VERIFY] Error fetching verified referrals:`, verifiedError);
      throw verifiedError;
    }

    const allReferrals: ReferralRow[] = [
      ...(unverifiedReferrals || []),
      ...(verifiedReferrals || []),
    ];

    // Step 3: Broad event search across referees using min last_checked_block
    let fromBlock = 0;
    if (allReferrals.length > 0) {
      const minLastCheckedBlock = allReferrals.reduce(
        (min, r) => Math.min(min, r.last_checked_block || 0),
        Number.POSITIVE_INFINITY
      );
      fromBlock = Number.isFinite(minLastCheckedBlock) ? Math.max(0, minLastCheckedBlock) : 0;
    }

    let verifiedUpdated = 0;
    let totalEvents = 0;
    let totalUniqueTxs = 0;

    if (allReferrals.length > 0) {
      const normalizedReferees: string[] = [];
      const lastCheckedByReferee = new Map<string, number>();
      for (const r of allReferrals) {
        const n = normalizeFeltHex(r.referee_address);
        if (!n) continue;
        normalizedReferees.push(n);
        lastCheckedByReferee.set(n, r.last_checked_block || 0);
      }

      // Deduplicate addresses
      const uniqueReferees = Array.from(new Set(normalizedReferees));

      logSensitive(
        `[VERIFY] Step 3: Broad event search for ${uniqueReferees.length} referees from block ${fromBlock} to ${latestBlockNumber}...`
      );

      // Chunk addresses into groups of 50 (as requested) and fetch per-address with concurrency
      const ADDRESS_CHUNK = 50;
      const EVENT_CONCURRENCY = 10;
      const limitEvents = createConcurrencyLimiter(EVENT_CONCURRENCY);

      const activityPairs: Array<{ referee: string; blockNumber: number; txHash: string }> = [];
      let missingTxHash = 0;
      let missingBlockNumber = 0;

      for (let i = 0; i < uniqueReferees.length; i += ADDRESS_CHUNK) {
        const chunk = uniqueReferees.slice(i, i + ADDRESS_CHUNK);
        logSensitive(`[VERIFY] Step 3: Scanning referee chunk ${i / ADDRESS_CHUNK + 1}/${Math.ceil(uniqueReferees.length / ADDRESS_CHUNK)} (${chunk.length} addresses)`);

        const chunkResults = await Promise.all(
          chunk.map(referee =>
            limitEvents(async () => {
              try {
                const events = await fetchEventsForAddress(referee, fromBlock, latestBlockNumber);
                return { referee, events };
              } catch (e) {
                logError(`[VERIFY] Error fetching events for referee ${referee}:`, e);
                return { referee, events: [] as StarknetEvent[] };
              }
            })
          )
        );

        for (const { referee, events } of chunkResults) {
          totalEvents += events.length;
          const lastChecked = lastCheckedByReferee.get(referee) || 0;

          for (const ev of events) {
            const bn = parseBlockNumber((ev as any)?.block_number);
            if (bn === null) {
              missingBlockNumber++;
              continue;
            }
            if (bn <= lastChecked) continue; // per-user delta gating

            const txHash = typeof ev.transaction_hash === 'string' ? ev.transaction_hash : null;
            if (!txHash) {
              missingTxHash++;
              continue;
            }
            const pair = { referee, blockNumber: bn, txHash };
            activityPairs.push(pair);
          }
        }
      }

      // Step 4: Batch fetch transactions for only the hashes we saw in activity
      const txHashes = Array.from(new Set(activityPairs.map(p => p.txHash)));
      totalUniqueTxs = txHashes.length;
      logSensitive(
        `[VERIFY] Step 4: Fetching ${totalUniqueTxs} unique transactions for calldata verification...`,
        { totalEvents, activityPairs: activityPairs.length, missingTxHash, missingBlockNumber }
      );

      const txMap = await batchGetTransactions(txHashes);
      const selector = getStartGameSelector();

      // Step 5: Calldata verification -> per-user newGameCount
      const newGameCountByReferee = new Map<string, number>();
      let matchedPairs = 0;

      for (const pair of activityPairs) {
        const tx = txMap.get(pair.txHash);
        if (!txCalldataHasSelector(tx, selector)) continue;
        matchedPairs++;
        newGameCountByReferee.set(pair.referee, (newGameCountByReferee.get(pair.referee) || 0) + 1);
      }

      logSensitive(
        `[VERIFY] Step 5: Selector matches found for ${newGameCountByReferee.size} referees`,
        { matchedPairs }
      );

      // Step 6: Update DB in parallel (with concurrency limit) and move pointer for everyone
      if (unverifiedReferrals && unverifiedReferrals.length > 0) {
        logSensitive(`[VERIFY] Found ${unverifiedReferrals.length} unverified referrals to check`);
        const result = await processReferrals(unverifiedReferrals, true, newGameCountByReferee, latestBlockNumber, 10);
        unverifiedUpdated = result.updated;
        newlyVerified = result.newlyVerified;
      } else {
        logSensitive(`[VERIFY] No unverified referrals found`);
      }

      if (verifiedReferrals && verifiedReferrals.length > 0) {
        logSensitive(`[VERIFY] Found ${verifiedReferrals.length} verified referrals to update`);
        const result = await processReferrals(verifiedReferrals, false, newGameCountByReferee, latestBlockNumber, 10);
        verifiedUpdated = result.updated;
      } else {
        logSensitive(`[VERIFY] No verified referrals found`);
      }
    } else {
      logSensitive(`[VERIFY] No referrals found`);
    }

    const totalUpdated = unverifiedUpdated + verifiedUpdated;
    const totalProcessed = (unverifiedReferrals?.length || 0) + (verifiedReferrals?.length || 0);

    const result = {
      message: `Processed ${totalProcessed} referrals. Updated ${totalUpdated} game counts. ${newlyVerified} newly verified.`,
      newlyVerified,
      updated: totalUpdated,
      unverifiedProcessed: unverifiedReferrals?.length || 0,
      verifiedProcessed: verifiedReferrals?.length || 0,
      total: totalProcessed,
      latestBlock: latestBlockNumber,
      eventsScanned: totalEvents,
      txsFetched: totalUniqueTxs,
    };
    
    logSensitive(`[VERIFY] ===== Verification complete =====`);
    logSensitive(`[VERIFY] Result:`, result);
    
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    logError(`[VERIFY] ===== ERROR in verification process =====`);
    logError(`[VERIFY] Error:`, error);
    if (isDevelopment) {
      console.error(`[VERIFY] Stack:`, error.stack);
    }
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  } finally {
    const g = globalThis as any;
    g.__verifyInFlight = false;
  }
}

/**
 * GET /api/verify
 * Get verification status
 */
export async function GET() {
  try {
    // Light abuse protection for stats endpoint (still public).
    // NextRequest isn't available in this signature; keep it cheap without IP-based limiting.
    const { data: stats, error } = await supabaseAdmin
      .from('referrals')
      .select('has_played');

    if (error) throw error;

    const total = stats?.length || 0;
    const verified = stats?.filter(s => s.has_played).length || 0;

    return NextResponse.json({
      total,
      verified,
      unverified: total - verified,
    });
  } catch (error: any) {
    logError('Error getting verification stats:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

