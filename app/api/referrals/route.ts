import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/rateLimit';
import { lookupAddresses } from '@cartridge/controller';

const STARKNET_RPC_URL = process.env.STARKNET_RPC;

// CORS: whitelist client origins that are allowed to call this API from browsers.
const ALLOWED_ORIGINS = new Set<string>([
  'https://death-mountain-coral.vercel.app',
  'https://loot-referral.io',
  'https://lootadventurer.xyz',
  'http://localhost:3000',
]);

function buildCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin');
  const isAllowed = origin ? ALLOWED_ORIGINS.has(origin) : false;

  // If the origin isn't explicitly allowed, omit ACAO so browsers block it.
  if (!isAllowed || !origin) {
    return { Vary: 'Origin' };
  }

  // Echo back the allowed origin (required when using a whitelist).
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    // For preflight, browsers send the requested headers in this field; echoing it is simplest.
    'Access-Control-Allow-Headers':
      request.headers.get('access-control-request-headers') ?? 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function withCorsHeaders(request: NextRequest, headersInit?: HeadersInit): Headers {
  const headers = new Headers(headersInit);
  const cors = buildCorsHeaders(request);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return headers;
}

if (!STARKNET_RPC_URL) {
  throw new Error(
    'Missing STARKNET_RPC environment variable. ' +
    'This server-only variable is required for referral creation. ' +
    'Add it to your .env.local file (without NEXT_PUBLIC_ prefix).'
  );
}

// TypeScript assertion: STARKNET_RPC_URL is guaranteed to be defined after the check above
const STARKNET_RPC: string = STARKNET_RPC_URL;

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

async function rpcRequest<T = any>(method: string, params: any[]): Promise<T> {
  const response = await fetch(STARKNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  if (!response.ok) {
    throw new Error(`[REFERRAL] RPC ${method} failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(`[REFERRAL] RPC ${method} error: ${JSON.stringify(payload.error)}`);
  }
  return payload?.result as T;
}

async function getLatestBlockNumber(): Promise<number> {
  const result: any = await rpcRequest('starknet_blockHashAndNumber', []);
  const blockNumber = parseBlockNumber(result?.block_number ?? result);
  if (blockNumber === null) {
    throw new Error(`[REFERRAL] Unexpected blockHashAndNumber result: ${JSON.stringify(result)}`);
  }
  return blockNumber;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: withCorsHeaders(request),
  });
}

/**
 * POST /api/referrals
 * Create a new referral mapping
 */
export async function POST(request: NextRequest) {
  try {
    // Basic abuse protection: limit referral creation per IP.
    const ip = getClientIp(request);
    const rl = rateLimit({ key: `referrals:post:${ip}`, limit: 20, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: withCorsHeaders(request, {
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          }),
        }
      );
    }

    const body = await request.json();
    const refereeAddressRaw = typeof body?.referee_address === 'string' ? body.referee_address.trim() : '';
    const referrerAddressRaw = typeof body?.referrer_address === 'string' ? body.referrer_address.trim() : '';

    // Validate input
    if (!refereeAddressRaw || !referrerAddressRaw) {
      return NextResponse.json(
        { error: 'Missing required fields: referee_address and referrer_address' },
        { status: 400, headers: withCorsHeaders(request) }
      );
    }

    // Validate Starknet address format (starts with 0x and up to 64 hex chars)
    // Allow shorter lengths because Starknet addresses may omit leading zeros
    const addressRegex = /^0x[a-fA-F0-9]{1,64}$/;
    if (!addressRegex.test(refereeAddressRaw) || !addressRegex.test(referrerAddressRaw)) {
      return NextResponse.json(
        { error: 'Invalid Starknet address format' },
        { status: 400, headers: withCorsHeaders(request) }
      );
    }

    const referee_address = refereeAddressRaw.toLowerCase();
    const referrer_address = referrerAddressRaw.toLowerCase();

    // Prevent self-referral
    if (referee_address === referrer_address) {
      return NextResponse.json(
        { error: 'Cannot refer yourself' },
        { status: 400, headers: withCorsHeaders(request) }
      );
    }

    // Get current block number to ensure we only count games played AFTER referral creation
    const currentBlock = await getLatestBlockNumber();
    console.log(`[REFERRAL] Creating referral at block ${currentBlock}`);

    // Lookup usernames for both referee and referrer
    let referee_username: string | undefined;
    let referrer_username: string | undefined;
    
    try {
      const addressMap = await lookupAddresses([referee_address, referrer_address]);
      referee_username = addressMap.get(referee_address) || undefined;
      referrer_username = addressMap.get(referrer_address) || undefined;
      console.log(`[REFERRAL] Username lookup: referee="${referee_username}", referrer="${referrer_username}"`);
    } catch (usernameError) {
      // Log but don't fail - usernames are optional
      console.warn('[REFERRAL] Failed to lookup usernames:', usernameError);
    }

    // Insert referral mapping
    const { data, error } = await supabaseAdmin
      .from('referrals')
      .insert({
        referee_address: referee_address.toLowerCase(),
        referrer_address: referrer_address.toLowerCase(),
        referee_username,
        referrer_username,
        has_played: false,
        last_checked_block: currentBlock,  // Set to current block, not 0!
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation (referee already exists)
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Referral already exists for this address' },
          { status: 409, headers: withCorsHeaders(request) }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, data }, { status: 201, headers: withCorsHeaders(request) });
  } catch (error: any) {
    console.error('Error creating referral:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: withCorsHeaders(request) }
    );
  }
}

/**
 * GET /api/referrals
 * Get leaderboard data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leaderboard = searchParams.get('leaderboard') === 'true';

    if (leaderboard) {
      // Public endpoint, but keep it cheap:
      // - cached at CDN (s-maxage)
      // - only aggregated output (no raw rows)

      // Get leaderboard data with games_played and usernames
      // Filter for referrals that have actually played (has_played = true) and have games_played > 0
      const { data, error } = await supabaseAdmin
        .from('referrals')
        .select('referrer_address, referrer_username, games_played')
        .eq('has_played', true)
        .gt('games_played', 0)
        .not('referrer_address', 'is', null);

      if (error) throw error;

      // Aggregate by referrer_address (normalize to lowercase for consistent grouping)
      // Calculate points using formula: P = Σ(G_i)^1.3
      // where G_i is the number of games played by each referee
      const leaderboardMap = new Map<string, { players: number; points: number; referrer_address: string; referrer_username?: string }>();
      
      data?.forEach((ref) => {
        const gamesPlayed = ref.games_played || 0;
        // Normalize referrer_address to lowercase for consistent grouping
        const normalizedReferrer = ref.referrer_address.toLowerCase().trim();
        const existing = leaderboardMap.get(normalizedReferrer);
        
        // Calculate points for this referee: (games_played)^1.3
        const points = Math.pow(gamesPlayed, 1.3);
        
        if (existing) {
          leaderboardMap.set(normalizedReferrer, {
            players: existing.players + 1,
            points: existing.points + points,
            referrer_address: existing.referrer_address, // Keep original case from first entry
            referrer_username: existing.referrer_username || ref.referrer_username, // Use first non-null username
          });
        } else {
          leaderboardMap.set(normalizedReferrer, {
            players: 1,
            points: points,
            referrer_address: ref.referrer_address, // Keep original case
            referrer_username: ref.referrer_username,
          });
        }
      });

      // Convert to array and sort by points (descending)
      const leaderboardData = Array.from(leaderboardMap.values())
        .map(({ players, points, referrer_address, referrer_username }) => ({
          referrer_address,
          referrer_username,
          total_points: players, // Keep this for backward compatibility (players onboarded)
          points: Math.round(points * 100) / 100, // Round to 2 decimal places
        }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 100)
        .map((item, index) => ({
          rank: index + 1,
          ...item,
        }));

      return NextResponse.json(
        { data: leaderboardData },
        {
          headers: withCorsHeaders(request, {
            // Let CDN cache; clients can "refresh" safely without hammering Supabase.
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
          }),
        }
      );
    }

    // Do not expose raw referral rows publicly.
    return NextResponse.json(
      { error: 'Not found' },
      {
        status: 404,
        headers: withCorsHeaders(request, {
          'Cache-Control': 'no-store',
        }),
      }
    );
  } catch (error: any) {
    console.error('Error fetching referrals:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: withCorsHeaders(request) }
    );
  }
}

