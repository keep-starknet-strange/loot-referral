/**
 * Utility functions for handling referral links
 */

const REFERRAL_STORAGE_KEY = 'loot_survivor_ref';

/**
 * Parse referral address from URL query parameter
 * @param url - The URL to parse (defaults to window.location.href)
 * @returns The referral address if found, null otherwise
 */
export function parseReferralFromUrl(url?: string): string | null {
  if (typeof window === 'undefined') return null;
  
  const urlObj = new URL(url || window.location.href);
  const refParam = urlObj.searchParams.get('ref');
  
  if (refParam && refParam.startsWith('0x')) {
    return refParam;
  }
  
  return null;
}

/**
 * Save referral address to localStorage
 */
export function saveReferralToStorage(referralAddress: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, referralAddress);
  } catch (error) {
    console.error('Failed to save referral to localStorage:', error);
  }
}

/**
 * Get referral address from localStorage
 */
export function getReferralFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  
  try {
    return localStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to get referral from localStorage:', error);
    return null;
  }
}

/**
 * Clear referral from localStorage (after successful submission)
 */
export function clearReferralFromStorage(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear referral from localStorage:', error);
  }
}

/**
 * Create referral URL for a given address
 */
export function createReferralUrl(referrerAddress: string, baseUrl?: string): string {
  if (baseUrl) {
    return `${baseUrl}?ref=${referrerAddress}`;
  }
  
  // Default to bridge page (/play) on current domain
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/play?ref=${referrerAddress}`;
  }
  
  // Fallback for SSR
  return `/play?ref=${referrerAddress}`;
}

