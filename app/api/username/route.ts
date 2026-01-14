import { NextRequest, NextResponse } from 'next/server';
import { lookupAddresses } from '@cartridge/controller';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

/**
 * Normalize a felt/address hex string by removing leading zeros
 * This matches the format returned by Cartridge API
 */
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

/**
 * GET /api/username?address=0x...
 * Lookup username for a single address
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limit to prevent abuse
    const ip = getClientIp(request);
    const rl = rateLimit({ key: `username:get:${ip}`, limit: 30, windowMs: 60_000 });
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

    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address')?.trim();

    if (!address) {
      return NextResponse.json(
        { error: 'Missing address parameter' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!address.startsWith('0x') || address.length < 10) {
      return NextResponse.json(
        { error: 'Invalid address format' },
        { status: 400 }
      );
    }

    try {
      // Lookup username using Cartridge Controller
      console.log('[USERNAME] Looking up address:', address);
      const addressMap = await lookupAddresses([address.toLowerCase()]);
      console.log('[USERNAME] Address map size:', addressMap.size);
      
      // Create a normalized map for better matching
      // The Cartridge API might return addresses without leading zeros
      const normalizedMap = new Map<string, string>();
      for (const [addr, username] of addressMap.entries()) {
        // Store both original and normalized (with leading 0x but without zero padding)
        const normalized = normalizeFeltHex(addr);
        if (normalized) {
          normalizedMap.set(normalized.toLowerCase(), username);
        }
        normalizedMap.set(addr.toLowerCase(), username);
      }
      
      // Try to find username with different address formats
      const addrLower = address.toLowerCase();
      const addrNorm = normalizeFeltHex(address);
      
      let username = normalizedMap.get(addrLower) || 
                     (addrNorm ? normalizedMap.get(addrNorm.toLowerCase()) : undefined);
      
      console.log('[USERNAME] Result - address:', address, 'normalized:', addrNorm, 'username:', username || 'null');

      return NextResponse.json({
        address,
        username: username || null,
      });
    } catch (lookupError) {
      console.error('[USERNAME] Lookup failed:', lookupError);
      return NextResponse.json({
        address,
        username: null,
      });
    }
  } catch (error) {
    console.error('[USERNAME] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
