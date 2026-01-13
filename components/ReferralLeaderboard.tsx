'use client';

import { useEffect, useState } from 'react';
import { Trophy, Users } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  referrer_address: string;
  referrer_username?: string; // Username from database (looked up server-side)
  total_points: number; // Players onboarded
  points: number; // Calculated points using formula
}

export function ReferralLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard();

    // Listen for refresh events (triggered after verification completes)
    const handleRefresh = () => {
      fetchLeaderboard();
    };

    window.addEventListener('leaderboard-refresh', handleRefresh);

    return () => {
      window.removeEventListener('leaderboard-refresh', handleRefresh);
    };
  }, []);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/referrals?leaderboard=true');
      
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard');
      }

      const { data } = await response.json();
      
      // Usernames are now included in the API response (looked up server-side)
      // No need to fetch them separately on the client
      setLeaderboard(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const truncateAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (loading) {
    return (
      <div className="bg-dungeon-green rounded-lg border border-dungeon-border p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-dungeon-yellow" />
          <h2 className="text-lg sm:text-xl font-bold text-dungeon-text">Referral Leaderboard</h2>
        </div>
        <div className="text-dungeon-text">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-dungeon-green rounded-lg border border-dungeon-border p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-dungeon-yellow" />
          <h2 className="text-lg sm:text-xl font-bold text-dungeon-text">Referral Leaderboard</h2>
        </div>
        <div className="text-red-400 text-sm sm:text-base">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="bg-dungeon-green rounded-lg border border-dungeon-border p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4 md:mb-6">
        <Trophy className="w-5 h-5 text-dungeon-yellow" />
        <h2 className="text-lg sm:text-xl font-bold text-dungeon-text">Referral Leaderboard</h2>
      </div>

      {leaderboard.length === 0 ? (
        <div className="text-dungeon-text text-center py-8">
          <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No referrals yet. Be the first to refer players!</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-dungeon-border">
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-dungeon-text font-semibold text-xs sm:text-sm">Rank</th>
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-dungeon-text font-semibold text-xs sm:text-sm">Referrer</th>
                <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-dungeon-text font-semibold text-xs sm:text-sm">Players Onboarded</th>
                <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-dungeon-text font-semibold text-xs sm:text-sm">Points</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry) => (
                <tr
                  key={entry.referrer_address}
                  className="border-b border-dungeon-border hover:bg-dungeon-dark/50 transition-colors"
                >
                  <td className="py-3 sm:py-4 px-2 sm:px-4">
                    <div className="flex items-center gap-2">
                      {entry.rank <= 3 && (
                        <Trophy
                          className={`w-3 h-3 sm:w-4 sm:h-4 ${
                            entry.rank === 1
                              ? 'text-dungeon-yellow'
                              : entry.rank === 2
                              ? 'text-gray-400'
                              : 'text-orange-500'
                          }`}
                        />
                      )}
                      <span className="text-white font-medium text-sm sm:text-base">#{entry.rank}</span>
                    </div>
                  </td>
                  <td className="py-3 sm:py-4 px-2 sm:px-4">
                    {entry.referrer_username ? (
                      <span className="text-white font-medium text-xs sm:text-sm">
                        {entry.referrer_username}
                      </span>
                    ) : (
                      <code className="text-gray-300 font-mono text-xs sm:text-sm">
                        {truncateAddress(entry.referrer_address)}
                      </code>
                    )}
                  </td>
                  <td className="py-3 sm:py-4 px-2 sm:px-4 text-right">
                    <span className="text-white font-semibold text-sm sm:text-base">{entry.total_points}</span>
                  </td>
                  <td className="py-3 sm:py-4 px-2 sm:px-4 text-right">
                    <span className="text-white font-semibold text-sm sm:text-base">{entry.points?.toFixed(2) || '0.00'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

