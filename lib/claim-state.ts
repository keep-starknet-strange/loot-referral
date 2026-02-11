import fs from 'fs';
import path from 'path';

const MAX_USES_PER_CODE = 25;

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

function getStatePath(): string | null {
  const envPath = process.env.CLAIM_STATE_PATH;
  if (envPath) return envPath;
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    return path.join(dataDir, 'claim-state.json');
  } catch {
    return null;
  }
}

function loadState(): ClaimState {
  const statePath = getStatePath();
  if (!statePath || !fs.existsSync(statePath)) return { ...defaultState };
  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const data = JSON.parse(raw) as ClaimState;
    return {
      byCode: typeof data.byCode === 'object' && data.byCode !== null ? data.byCode : {},
      claimedAddresses: Array.isArray(data.claimedAddresses) ? data.claimedAddresses : [],
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState(state: ClaimState): void {
  const statePath = getStatePath();
  if (!statePath) return;
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[claim-state] Failed to save state:', err);
  }
}

export function getClaimState(): ClaimState {
  return loadState();
}

export function recordClaim(code: string, address: string): void {
  const state = loadState();
  const normalized = normalizeAddress(address);
  state.claimedAddresses.push(normalized);
  state.byCode[code] = (state.byCode[code] ?? 0) + 1;
  saveState(state);
}

export function canClaim(code: string, address: string, validCodes: string[]): { ok: boolean; error?: string } {
  if (!validCodes.includes(code)) {
    return { ok: false, error: 'Invalid invite code' };
  }
  const state = loadState();
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
