import { createClient, SupabaseClient } from '@supabase/supabase-js';

const MAX_USES_PER_CODE = 25;
const TABLE = 'ticket_claims';

const NOT_CONFIGURED =
  'Invite claim state not configured. Set NEXT_PUBLIC_SUPABASE_URL_INVITE and SUPABASE_SERVICE_ROLE_KEY_INVITE.';

export type ClaimState = {
  byCode: Record<string, number>;
  claimedAddresses: string[];
};

const defaultState: ClaimState = {
  byCode: {},
  claimedAddresses: [],
};

function normalizeAddress(addr: string): string {
  const s = addr.trim().toLowerCase();
  if (!s.startsWith('0x')) return `0x${s}`;
  return s;
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_INVITE;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY_INVITE;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type TicketClaimRow = { address: string; code: string };

async function loadStateSupabase(): Promise<ClaimState> {
  const db = getSupabase();
  if (!db) return { ...defaultState };

  const { data: rows, error } = await db.from(TABLE).select('address, code');
  if (error) {
    console.error('[claim-state] Supabase load error:', error);
    return { ...defaultState };
  }

  const list = (rows ?? []) as TicketClaimRow[];
  const claimedAddresses = list.map((r) => r.address.toLowerCase());
  const byCode: Record<string, number> = {};
  for (const r of list) {
    const c = r.code.trim();
    byCode[c] = (byCode[c] ?? 0) + 1;
  }
  return { byCode, claimedAddresses };
}

export async function getClaimState(): Promise<ClaimState> {
  if (!getSupabase()) return { ...defaultState };
  return loadStateSupabase();
}

export async function recordClaim(code: string, address: string): Promise<void> {
  const db = getSupabase();
  if (!db) throw new Error(NOT_CONFIGURED);

  const normalized = normalizeAddress(address);
  const { error } = await db.from(TABLE).insert({
    address: normalized,
    code: code.trim(),
  });
  if (error) {
    console.error('[claim-state] Supabase insert error:', error);
    throw new Error('Failed to record claim');
  }
}

export async function canClaim(
  code: string,
  address: string,
  validCodes: string[]
): Promise<{ ok: boolean; error?: string }> {
  if (!validCodes.includes(code)) {
    return { ok: false, error: 'Invalid invite code' };
  }
  const db = getSupabase();
  if (!db) {
    return { ok: false, error: NOT_CONFIGURED };
  }
  const state = await loadStateSupabase();
  const normalized = normalizeAddress(address);
  if (state.claimedAddresses.includes(normalized)) {
    return { ok: false, error: 'This address has already claimed a ticket' };
  }
  const uses = state.byCode[code] ?? 0;
  if (uses >= MAX_USES_PER_CODE) {
    return { ok: false, error: 'This invite code has reached its maximum uses' };
  }
  return { ok: true };
}

export { MAX_USES_PER_CODE };
