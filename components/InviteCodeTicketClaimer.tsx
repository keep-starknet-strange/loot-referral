'use client';

import { useState } from 'react';
import { useAccount } from '@starknet-react/core';
import { Ticket, Loader2, CheckCircle, ExternalLink, Swords } from 'lucide-react';

const VOYAGER_TX_URL = 'https://voyager.online/tx';
const LOOT_SURVIVOR_URL = 'https://lootsurvivor.io/survivor';

export function InviteCodeTicketClaimer() {
  const { address: connectedAddress } = useAccount();
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: true; transactionHash: string } | { error: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectedAddress) return;
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/claim-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: inviteCode.trim(),
          address: connectedAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error || 'Claim failed' });
        return;
      }
      setResult({
        success: true,
        transactionHash: data.transactionHash,
      });
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : 'Network error. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const success = result && 'success' in result && result.success;
  const error = result && 'error' in result ? result.error : null;

  return (
    <div className="bg-dungeon-green rounded-lg border border-dungeon-border p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Ticket className="w-5 h-5 text-dungeon-button" />
        <h2 className="text-lg font-bold text-dungeon-text">Dungeon Ticket Invite</h2>
      </div>
      <p className="text-sm text-dungeon-text/90 mb-4">
        Connect your wallet, and enter your invite code.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            id="invite-code"
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Invite code"
            className="w-full px-3 py-2.5 rounded-lg border border-dungeon-border bg-dungeon-dark text-dungeon-text placeholder-dungeon-text/50 focus:outline-none focus:ring-2 focus:ring-dungeon-button/50 focus:border-dungeon-button"
            required
            disabled={loading}
            autoComplete="off"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !connectedAddress}
          className="w-full px-4 py-3 bg-dungeon-button hover:bg-dungeon-yellow-dark disabled:opacity-70 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Ticket className="w-5 h-5" />
              Claim Ticket
            </>
          )}
        </button>
      </form>

      {success && result && 'transactionHash' in result && (
        <div className="mt-4 p-3 rounded-lg border border-dungeon-green-light bg-dungeon-dark/50 space-y-3">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-dungeon-green-glow flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-dungeon-text">Ticket sent successfully</p>
              <p className="text-xs text-dungeon-text/80 mt-1">1 Dungeon Ticket has been sent to your address.</p>
              <a
                href={`${VOYAGER_TX_URL}/${result.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-sm text-dungeon-button hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                View on Voyager
              </a>
            </div>
          </div>
          <a
            href={LOOT_SURVIVOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full px-4 py-3 bg-dungeon-button hover:bg-dungeon-yellow-dark text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg"
          >
            <Swords className="w-5 h-5" />
            Enter the Dungeon
          </a>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-lg border border-red-500/50 bg-red-500/10">
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
}
