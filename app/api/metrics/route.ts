import { NextResponse } from 'next/server';

const DUNE_API_KEY = process.env.DUNE_API_KEY;

const LORDS_DISTRIBUTED_QUERY_ID = 6567841;
const BEASTS_COLLECTED_QUERY_ID = 6567847;

type DuneResultsResponse = {
  execution_id?: string;
  state?: string;
  is_execution_finished?: boolean;
  execution_ended_at?: string | null;
  result?: {
    rows?: Array<Record<string, unknown>>;
  };
};

function findKeyCaseInsensitive(row: Record<string, unknown>, wanted: string): string | null {
  const wantedLower = wanted.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === wantedLower) return key;
  }
  return null;
}

function extractLikelySingleMetric(
  row: Record<string, unknown>,
  preferredKeyHints: RegExp[]
): string | null {
  // 1) Prefer keys that look like totals for the given metric
  const keys = Object.keys(row);
  for (const hint of preferredKeyHints) {
    const match = keys.find(k => hint.test(k));
    if (match) {
      const v = row[match];
      if (v === null || v === undefined) continue;
      return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
    }
  }

  // 2) Common generic names
  for (const generic of ['total', 'sum', 'amount', 'value']) {
    const key = findKeyCaseInsensitive(row, generic);
    if (!key) continue;
    const v = row[key];
    if (v === null || v === undefined) continue;
    return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
  }

  // 3) Fallback: first scalar-ish value
  for (const key of keys) {
    const v = row[key];
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!trimmed) continue;
      return trimmed;
    }
  }

  return null;
}

async function fetchLatestQueryMetric(queryId: number, preferredKeyHints: RegExp[]) {
  if (!DUNE_API_KEY) {
    return { value: null as string | null, updatedAt: null as string | null };
  }

  const url = `https://api.dune.com/api/v1/query/${queryId}/results?limit=1`;
  const res = await fetch(url, {
    headers: {
      'X-DUNE-API-KEY': DUNE_API_KEY,
    },
    // Cache on the server to avoid hammering Dune on page loads
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    return { value: null as string | null, updatedAt: null as string | null };
  }

  const data = (await res.json()) as DuneResultsResponse;
  const row = data?.result?.rows?.[0];
  const value =
    row && typeof row === 'object' ? extractLikelySingleMetric(row, preferredKeyHints) : null;

  return {
    value,
    updatedAt: data?.execution_ended_at ?? null,
  };
}

export async function GET() {
  const [lords, beasts] = await Promise.all([
    fetchLatestQueryMetric(LORDS_DISTRIBUTED_QUERY_ID, [
      // Prefer the exact USD-denominated metric if present
      /total\s*survivor\s*earned\s*in\s*usd/i,
      /survivor\s*earned/i,
      /usd/i,
      /lords/i,
      /distributed/i,
      /total/i,
      /sum/i,
    ]),
    fetchLatestQueryMetric(BEASTS_COLLECTED_QUERY_ID, [
      /beasts/i,
      /collected/i,
      /total/i,
      /sum/i,
    ]),
  ]);

  return NextResponse.json(
    {
      lordsDistributed: lords,
      beastsCollected: beasts,
    },
    {
      headers: {
        // Let platforms cache too (safe: this endpoint is non-user-specific)
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    }
  );
}

