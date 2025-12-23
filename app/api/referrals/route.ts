import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

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
          headers: {
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
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
        { status: 400 }
      );
    }

    // Validate Starknet address format (starts with 0x and up to 64 hex chars)
    // Allow shorter lengths because Starknet addresses may omit leading zeros
    const addressRegex = /^0x[a-fA-F0-9]{1,64}$/;
    if (!addressRegex.test(refereeAddressRaw) || !addressRegex.test(referrerAddressRaw)) {
      return NextResponse.json(
        { error: 'Invalid Starknet address format' },
        { status: 400 }
      );
    }

    const referee_address = refereeAddressRaw.toLowerCase();
    const referrer_address = referrerAddressRaw.toLowerCase();

    // Prevent self-referral
    if (referee_address === referrer_address) {
      return NextResponse.json(
        { error: 'Cannot refer yourself' },
        { status: 400 }
      );
    }

    // Insert referral mapping
    const { data, error } = await supabaseAdmin
      .from('referrals')
      .insert({
        referee_address: referee_address.toLowerCase(),
        referrer_address: referrer_address.toLowerCase(),
        has_played: false,
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation (referee already exists)
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Referral already exists for this address' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating referral:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
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

      // Get leaderboard data with games_played
      // Filter for referrals that have actually played (has_played = true) and have games_played > 0
      const { data, error } = await supabaseAdmin
        .from('referrals')
        .select('referrer_address, games_played')
        .eq('has_played', true)
        .gt('games_played', 0)
        .not('referrer_address', 'is', null);

      if (error) throw error;

      // Aggregate by referrer_address (normalize to lowercase for consistent grouping)
      // Calculate points using formula: P = Σ(G_i)^1.3
      // where G_i is the number of games played by each referee
      const leaderboardMap = new Map<string, { players: number; points: number; referrer_address: string }>();
      
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
          });
        } else {
          leaderboardMap.set(normalizedReferrer, {
            players: 1,
            points: points,
            referrer_address: ref.referrer_address, // Keep original case
          });
        }
      });

      // Convert to array and sort by points (descending)
      const leaderboardData = Array.from(leaderboardMap.values())
        .map(({ players, points, referrer_address }) => ({
          referrer_address,
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
          headers: {
            // Let CDN cache; clients can "refresh" safely without hammering Supabase.
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
          },
        }
      );
    }

    // Do not expose raw referral rows publicly.
    return NextResponse.json(
      { error: 'Not found' },
      {
        status: 404,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: any) {
    console.error('Error fetching referrals:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

