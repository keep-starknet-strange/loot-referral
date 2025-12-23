import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [];
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  
  throw new Error(
    `Missing Supabase environment variables: ${missing.join(', ')}\n` +
    `Please update your .env.local file with valid Supabase credentials.\n` +
    `Get them from: https://supabase.com/dashboard/project/_/settings/api`
  );
}

// Validate URL format
try {
  new URL(supabaseUrl);
} catch {
  throw new Error(
    `Invalid NEXT_PUBLIC_SUPABASE_URL: "${supabaseUrl}"\n` +
    `It must be a valid HTTP or HTTPS URL (e.g., https://xxxxx.supabase.co)\n` +
    `Please update your .env.local file with a valid Supabase project URL.`
  );
}

// Check if placeholder values are still present
if (supabaseUrl.includes('your_supabase') || supabaseUrl.includes('placeholder')) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL appears to be a placeholder.\n` +
    `Please replace it with your actual Supabase project URL in .env.local\n` +
    `Get it from: https://supabase.com/dashboard/project/_/settings/api`
  );
}

if (supabaseAnonKey.includes('your_') || supabaseAnonKey.includes('placeholder')) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be a placeholder.\n` +
    `Please replace it with your actual Supabase anon key in .env.local\n` +
    `Get it from: https://supabase.com/dashboard/project/_/settings/api`
  );
}

// Client for client-side operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations (with service role key)
// Fail fast if service role key is missing - never fall back to anon key for security
if (!supabaseServiceKey) {
  throw new Error(
    `Missing SUPABASE_SERVICE_ROLE_KEY environment variable.\n` +
    `This is required for server-side admin operations.\n` +
    `Please add it to your .env.local file.\n` +
    `Get it from: https://supabase.com/dashboard/project/_/settings/api`
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

