'use client';

import { useState } from 'react';
import { WalletConnection } from '@/components/WalletConnection';
import { ReferralShare } from '@/components/ReferralShare';
import { ReferralLeaderboard } from '@/components/ReferralLeaderboard';
import { CompetitionCountdown } from '@/components/CompetitionCountdown';
import { useReferral } from '@/hooks/useReferral';

export default function Home() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isWalletConnected, setIsWalletConnected] = useState(false);

  const handleAddressChange = (address: string | null) => {
    setWalletAddress(address);
    setIsWalletConnected(!!address);
  };

  return (
    <main className="min-h-screen bg-dungeon-dark text-white p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 text-dungeon-text">
            Loot Survivor Referral
          </h1>
          <p className="text-sm sm:text-base text-dungeon-button">
            Create referrals links and compete on the leaderboard
          </p>
        </div>

        {/* Wallet Connection */}
        <div className="mb-4 md:mb-6">
          <WalletConnection onAddressChange={handleAddressChange} />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
          {/* Referral Share */}
          <div>
            <div className="mb-4">
              <CompetitionCountdown />
            </div>
            <ReferralShare
              walletAddress={walletAddress}
              isConnected={isWalletConnected}
            />
          </div>

          {/* Leaderboard */}
          <div>
            <ReferralLeaderboard />
          </div>
        </div>
      </div>
    </main>
  );
}

