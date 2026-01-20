'use client';

import { useState, useEffect } from 'react';
import { Share2, Copy, Check, Wallet } from 'lucide-react';
import { createReferralUrl } from '@/lib/referral';

interface ReferralShareProps {
  walletAddress: string | null;
  isConnected: boolean;
}

export function ReferralShare({ walletAddress, isConnected }: ReferralShareProps) {
  const [referralUrl, setReferralUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (walletAddress && isConnected) {
      const url = createReferralUrl(walletAddress);
      setReferralUrl(url);
    }
  }, [walletAddress, isConnected]);

  const handleCopy = async () => {
    if (!referralUrl) return;

    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (!isConnected || !walletAddress) {
    return (
      <div className="bg-dungeon-green rounded-lg border border-dungeon-border p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Share2 className="w-5 h-5 text-dungeon-green-glow" />
          <h2 className="text-lg sm:text-xl font-bold text-dungeon-text">Share Your Referral Link</h2>
        </div>
        <div className="flex items-center gap-2 text-dungeon-text text-sm sm:text-base">
          <Wallet className="w-4 h-4" />
          <p>Connect your wallet to get your referral link</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dungeon-green rounded-lg border border-dungeon-border p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="w-5 h-5 text-dungeon-green-glow" />
        <h2 className="text-lg sm:text-xl font-bold text-dungeon-text">Share Your Referral Link</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-dungeon-button mb-2">
            Your Referral URL
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={referralUrl}
              readOnly
              className="flex-1 bg-dungeon-dark border border-dungeon-border rounded-lg px-3 sm:px-4 py-2 text-white font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-dungeon-green-glow"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-dungeon-yellow hover:bg-dungeon-yellow-dark text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-lg"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        <div className="bg-dungeon-dark/50 rounded-lg p-4 border border-dungeon-border">
          <p className="text-sm text-dungeon-text mb-2">
            <strong className="text-dungeon-button">How it works:</strong>
          </p>
          <ul className="text-sm text-dungeon-text space-y-1 list-disc list-inside">
            <li>Share this link with friends</li>
            <li>When they connect their wallet and play, you’ll earn points</li>
            <li>Check the leaderboard to see your ranking</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

