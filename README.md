# Loot Survivor Referral Tracker

A referral tracking system for Loot Survivor on Starknet. Track which players brought in new users who actually played the game.

## Features

- 🔗 **Referral Link Capture**: Automatically captures referral addresses from URL parameters
- 💾 **LocalStorage Persistence**: Saves referral data until wallet connection
- 🔐 **Wallet Integration**: Cartridge Controller (Starknet) wallet connection
- ✅ **On-Chain Verification**: Verifies actual gameplay via Starkscan API
- 📊 **Leaderboard**: Real-time leaderboard showing top referrers
- 🎨 **Dark Theme UI**: Modern, clean interface with Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, Lucide-react icons
- **Backend/Database**: Supabase (PostgreSQL)
- **Web3**: Cartridge Controller (Starknet)
- **Verification**: Starkscan API

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
VERIFY_API_KEY=your_verify_endpoint_secret
NEXT_PUBLIC_LOOT_SURVIVOR_CONTRACT=0x0100000000000000000000000000000000000000000000000000000000000000
STARKSCAN_API_KEY=your_starkscan_api_key
NEXT_PUBLIC_STARKNET_CHAIN=mainnet
```

### 3. Database Setup

Run the migration SQL in your Supabase SQL editor:

```sql
-- See supabase/migrations/001_create_referrals_table.sql
```

Or execute it via Supabase dashboard:
1. Go to your Supabase project
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase/migrations/001_create_referrals_table.sql`
4. Run the migration

### 3b. Lock down direct Supabase access (recommended)

To ensure the public `anon` key cannot read/write referral data directly, run:

- `supabase/SECURITY_SETUP.sql`

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

### Referral Flow

1. **User visits with referral link**: `https://yoursite.com?ref=0x...`
2. **Referral captured**: The `ref` parameter is saved to localStorage
3. **Wallet connection**: When user connects their Cartridge Controller wallet
4. **Referral mapping created**: POST request to `/api/referrals` creates the mapping
5. **On-chain verification**: Server checks Starkscan API for actual gameplay
6. **Leaderboard update**: Verified referrals appear on the leaderboard

### Verification Process

The verification system checks if a referee address has interacted with the Loot Survivor contract:

1. Fetches all referrals where `has_played = false`
2. For each address, queries Starkscan API for transactions
3. Updates `has_played = true` if transactions are found

### Running Verification

You can trigger verification manually:

```bash
curl -X POST http://localhost:3000/api/verify -H "x-verify-key: $VERIFY_API_KEY"
```

Or set up a cron job to run periodically:

```bash
# Example cron job (runs every hour)
0 * * * * curl -X POST https://your-domain.com/api/verify -H "x-verify-key: $VERIFY_API_KEY"
```

For production, consider using:
- Vercel Cron Jobs
- GitHub Actions
- A dedicated cron service

## API Endpoints

### POST `/api/referrals`
Create a new referral mapping.

**Request:**
```json
{
  "referee_address": "0x...",
  "referrer_address": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

### GET `/api/referrals?leaderboard=true`
Get leaderboard data.

**Response:**
```json
{
  "data": [
    {
      "rank": 1,
      "referrer_address": "0x...",
      "total_points": 10
    }
  ]
}
```

### POST `/api/verify`
Trigger on-chain verification for all unverified referrals.

**Response:**
```json
{
  "message": "Verified 5 out of 10 referrals",
  "verified": 5,
  "total": 10
}
```

### GET `/api/verify`
Get verification statistics.

**Response:**
```json
{
  "total": 100,
  "verified": 75,
  "unverified": 25
}
```

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── referrals/
│   │   │   └── route.ts          # Referral CRUD endpoints
│   │   └── verify/
│   │       └── route.ts          # On-chain verification
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Main page
├── components/
│   ├── ReferralLeaderboard.tsx   # Leaderboard component
│   ├── ReferralShare.tsx         # Share referral link component
│   └── WalletConnection.tsx      # Wallet connection component
├── hooks/
│   └── useReferral.ts            # Referral capture hook
├── lib/
│   ├── referral.ts               # Referral utilities
│   └── supabase.ts               # Supabase client
├── supabase/
│   └── migrations/
│       └── 001_create_referrals_table.sql
└── package.json
```

## Cartridge Controller Integration

The app expects Cartridge Controller to be available at `window.cartridge.controller`. Make sure users have the Cartridge extension installed.

The wallet connection component:
- Checks for Cartridge Controller on mount
- Polls connection status
- Automatically submits referral when wallet connects
- Handles connect/disconnect events

## Starkscan API

The verification system uses Starkscan API to check for on-chain activity. You can get an API key from [Starkscan](https://starkscan.co/).

**Note**: The API key is optional but recommended to avoid rate limits.

## Security Considerations

1. **API Protection**: Consider adding authentication to `/api/verify` endpoint
2. **Rate Limiting**: Implement rate limiting on referral creation
3. **Input Validation**: Address format validation is already implemented
4. **Self-Referral Prevention**: The system prevents users from referring themselves

## Future Enhancements

- [ ] Add authentication/authorization
- [ ] Implement rate limiting
- [ ] Add email notifications for referrals
- [ ] Create admin dashboard
- [ ] Add referral analytics
- [ ] Support multiple games/contracts
- [ ] Add referral rewards system

## License

MIT


