/**
 * Standalone script to verify referrals
 * Can be run via cron job or manually
 * 
 * Usage:
 *   npx tsx scripts/verify-referrals.ts
 * 
 * Or set up as a cron job:
 *   0 * * * * cd /path/to/project && npx tsx scripts/verify-referrals.ts
 */

import { supabaseAdmin } from '../lib/supabase';

const LOOT_SURVIVOR_CONTRACT = process.env.NEXT_PUBLIC_LOOT_SURVIVOR_CONTRACT || '0x0100000000000000000000000000000000000000000000000000000000000000';
const STARKSCAN_API_KEY = process.env.STARKSCAN_API_KEY || '';
const STARKNET_CHAIN = process.env.NEXT_PUBLIC_STARKNET_CHAIN || 'mainnet';

async function checkOnChainActivity(address: string): Promise<boolean> {
  try {
    const baseUrl = STARKNET_CHAIN === 'mainnet' 
      ? 'https://api.starkscan.co/api/v0' 
      : 'https://api-testnet.starkscan.co/api/v0';

    const url = `${baseUrl}/transactions?from_address=${address}&to_address=${LOOT_SURVIVOR_CONTRACT}&limit=1`;
    
    const headers: HeadersInit = {
      'Accept': 'application/json',
    };
    
    if (STARKSCAN_API_KEY) {
      headers['x-api-key'] = STARKSCAN_API_KEY;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.error(`Starkscan API error for ${address}: ${response.status} ${response.statusText}`);
      return false;
    }

    const data = await response.json();
    return data.data && data.data.length > 0;
  } catch (error) {
    console.error(`Error checking on-chain activity for ${address}:`, error);
    return false;
  }
}

async function verifyReferrals() {
  console.log('Starting referral verification...');

  try {
    // Fetch all referrals where has_played is false
    const { data: referrals, error } = await supabaseAdmin
      .from('referrals')
      .select('id, referee_address')
      .eq('has_played', false);

    if (error) {
      throw error;
    }

    if (!referrals || referrals.length === 0) {
      console.log('No unverified referrals found.');
      return;
    }

    console.log(`Found ${referrals.length} unverified referrals.`);

    let verifiedCount = 0;
    const updates: string[] = [];

    // Check each referral
    for (const referral of referrals) {
      console.log(`Checking ${referral.referee_address}...`);
      const hasPlayed = await checkOnChainActivity(referral.referee_address);
      
      if (hasPlayed) {
        updates.push(referral.id);
        verifiedCount++;
        console.log(`✓ ${referral.referee_address} has played!`);
      } else {
        console.log(`✗ ${referral.referee_address} has not played yet.`);
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Batch update verified referrals
    if (updates.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('referrals')
        .update({ has_played: true })
        .in('id', updates);

      if (updateError) {
        throw updateError;
      }

      console.log(`✓ Updated ${verifiedCount} referrals.`);
    }

    console.log(`Verification complete: ${verifiedCount} out of ${referrals.length} referrals verified.`);
  } catch (error) {
    console.error('Error verifying referrals:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  verifyReferrals()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { verifyReferrals };


