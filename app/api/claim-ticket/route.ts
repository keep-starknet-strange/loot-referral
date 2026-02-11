import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { Account, RpcProvider, cairo } from 'starknet';
import { getClaimState, canClaim, recordClaim } from '@/lib/claim-state';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

const TICKET_CONTRACT = '0x0452810188C4Cb3AEbD63711a3b445755BC0D6C4f27B923fDd99B1A118858136';

/** Starknet address: 0x + hex string (64 chars typical) */
function isValidStarknetAddress(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const s = value.trim().toLowerCase();
  if (!s.startsWith('0x')) return false;
  const hex = s.slice(2);
  return /^[0-9a-f]+$/.test(hex) && hex.length >= 32 && hex.length <= 66;
}

function normalizeAddress(addr: string): string {
  const s = addr.trim().toLowerCase();
  return s.startsWith('0x') ? s : `0x${s}`;
}

/** Load invite codes from server-only env (never exposed to client). Do not commit real codes. */
function loadValidCodes(): string[] {
  const fromEnv = process.env.INVITE_CODES;
  if (fromEnv && typeof fromEnv === 'string') {
    return fromEnv
      .split(/[,|\n]/)
      .map((c) => c.trim())
      .filter(Boolean);
  }
  try {
    const p = path.join(process.cwd(), 'lib', 'invite-codes.json');
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf-8');
    const data = JSON.parse(raw) as { codes?: string[] };
    return Array.isArray(data.codes) ? data.codes : [];
  } catch {
    return [];
  }
}

/** In-memory set of addresses currently being processed (avoid double-claim race) */
const processingAddresses = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';
    const userAddress = typeof body.address === 'string' ? body.address.trim() : '';

    if (!inviteCode || !userAddress) {
      return NextResponse.json(
        { error: 'Missing invite code or Starknet address' },
        { status: 400 }
      );
    }

    if (!isValidStarknetAddress(userAddress)) {
      return NextResponse.json(
        { error: 'Invalid Starknet address format' },
        { status: 400 }
      );
    }

    const normalizedAddr = normalizeAddress(userAddress);

    const rl = rateLimit({ key: `claim:${getClientIp(request)}`, limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    if (processingAddresses.has(normalizedAddr)) {
      return NextResponse.json(
        { error: 'A claim is already in progress for this address. Please wait and try again.' },
        { status: 409 }
      );
    }

    const validCodes = loadValidCodes();
    if (validCodes.length === 0) {
      return NextResponse.json(
        { error: 'Server misconfiguration: no invite codes configured' },
        { status: 500 }
      );
    }

    const check = canClaim(inviteCode, userAddress, validCodes);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const rpcUrl = process.env.STARKNET_RPC;
    const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
    const adminAddress = process.env.ADMIN_ADDRESS;

    if (!rpcUrl || !adminPrivateKey || !adminAddress) {
      return NextResponse.json(
        { error: 'Server misconfiguration: missing STARKNET_RPC, ADMIN_PRIVATE_KEY, or ADMIN_ADDRESS' },
        { status: 500 }
      );
    }

    processingAddresses.add(normalizedAddr);
    try {
      const provider = new RpcProvider({ nodeUrl: rpcUrl });
      const account = new Account(
        { provider, address: adminAddress, signer: adminPrivateKey }
      );

      // 1 ticket in token units (18 decimals: 1e18 = one full DTICKET)
      const ONE_TICKET = BigInt(10 ** 18);
      const amountU256 = cairo.uint256(ONE_TICKET);
      const calldata = [
        normalizedAddr,
        amountU256.low.toString(),
        amountU256.high.toString(),
      ];

      const result = await account.execute({
        contractAddress: TICKET_CONTRACT,
        entrypoint: 'transfer',
        calldata,
      });

      const txHash = result.transaction_hash;
      if (!txHash) {
        throw new Error('No transaction hash returned');
      }

      recordClaim(inviteCode, userAddress);

      return NextResponse.json({
        success: true,
        transactionHash: txHash,
        message: '1 Dungeon Ticket has been sent to your address.',
      });
    } finally {
      processingAddresses.delete(normalizedAddr);
    }
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err ?? 'Failed to claim ticket');
    const isContractNotFound =
      /CONTRACT_NOT_FOUND|CONTRACT NOT FOUND|class hash not found|contract not found/i.test(raw) ||
      (err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 20);
    const isInsufficientBalance =
      /ERC20: INSUFFICIENT BALANCE|INSUFFICIENT_BALANCE|insufficient balance/i.test(raw);

    let message = raw;
    if (isContractNotFound) {
      message =
        'Admin account not found on this network. Check that ADMIN_ADDRESS is deployed on the same network as STARKNET_RPC (e.g. Starknet Mainnet).';
    } else if (isInsufficientBalance) {
      message =
        'Admin wallet has insufficient Dungeon Ticket balance. The admin account must hold enough tickets to transfer 1 per claim. Fund the admin address with tickets and try again.';
    }

    console.error('[claim-ticket]', err);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
