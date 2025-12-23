'use client';

import { useEffect, useState, useCallback } from 'react';
import { parseReferralFromUrl, saveReferralToStorage, getReferralFromStorage, clearReferralFromStorage } from '@/lib/referral';

/**
 * Hook to handle referral link capture and submission
 */
export function useReferral() {
  const [referralAddress, setReferralAddress] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Capture referral from URL on mount
  useEffect(() => {
    const refFromUrl = parseReferralFromUrl();
    if (refFromUrl) {
      saveReferralToStorage(refFromUrl);
      setReferralAddress(refFromUrl);
    } else {
      // Check if there's a stored referral
      const storedRef = getReferralFromStorage();
      if (storedRef) {
        setReferralAddress(storedRef);
      }
    }
  }, []);

  /**
   * Submit referral mapping when wallet is connected
   * Memoized to prevent unnecessary re-renders and race conditions with WASM bridge
   */
  const submitReferral = useCallback(async (refereeAddress: string): Promise<boolean> => {
    if (!referralAddress || isProcessing) return false;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/referrals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          referee_address: refereeAddress,
          referrer_address: referralAddress,
        }),
      });

      if (response.ok) {
        clearReferralFromStorage();
        setReferralAddress(null);
        return true;
      } else {
        const error = await response.json();
        console.error('Failed to submit referral:', error);
        return false;
      }
    } catch (error) {
      console.error('Error submitting referral:', error);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [referralAddress, isProcessing]);

  return {
    referralAddress,
    submitReferral,
    isProcessing,
  };
}

