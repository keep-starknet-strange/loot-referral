# Loot Survivor Referral Tracker

A referral tracking system for Loot Survivor on Starknet. Track which players brought in new users who actually played the game.

## Features

- 🔗 **Referral Link Capture**: Automatically captures referral addresses from URL parameters
- 💾 **LocalStorage Persistence**: Saves referral data until wallet connection
- 🔐 **Wallet Integration**: Cartridge Controller (Starknet) wallet connection
- ✅ **On-Chain Verification**: Verifies actual gameplay via Starknet RPC
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

The repo uses **starknet@9** and **@cartridge/connector** / **@cartridge/controller** latest. Because `@starknet-react/core@5` declares a peer dependency on `starknet@^8`, `.npmrc` sets `legacy-peer-deps=true` so `npm install` succeeds. You can update all of these with `npm update` (or bump versions in `package.json` and run `npm install` again).

### 2. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
VERIFY_API_KEY=your_verify_endpoint_secret
NEXT_PUBLIC_LOOT_SURVIVOR_CONTRACT=0x0100000000000000000000000000000000000000000000000000000000000000
NEXT_PUBLIC_STARKNET_CHAIN=mainnet
NEXT_PUBLIC_STARKNET_RPC=your_starknet_rpc_url

# Invite Code Ticket Claimer (server-only; never expose admin key or real codes)
STARKNET_RPC=your_starknet_rpc_url
ADMIN_ADDRESS=your_admin_starknet_account_address
ADMIN_PRIVATE_KEY=your_admin_private_key
INVITE_CODES=code1,code2,code3
# Invite claim state (required for ticket claimer): Supabase table ticket_claims
NEXT_PUBLIC_SUPABASE_URL_INVITE=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY_INVITE=your_service_role_key
```

### 3. Create Supabase database

For the **Invite Ticket Claimer**, claim state is stored only in Supabase (no JSON file). Create the table in your invite Supabase project:

- Open the project (e.g. the one used for `NEXT_PUBLIC_SUPABASE_URL_INVITE`) → **SQL Editor** → New query → paste and run the contents of `supabase/ticket_claims.sql`.

Set `NEXT_PUBLIC_SUPABASE_URL_INVITE` and `SUPABASE_SERVICE_ROLE_KEY_INVITE` so the claim flow can persist and enforce one claim per address and per-code limits.

### 4. Run Development Server

**HTTPS (recommended for dev, e.g. wallet connections):**

1. Install [mkcert](https://github.com/FiloSottile/mkcert) and run `mkcert -install` once.
2. Generate certs: `npm run certs`
3. Start the server: `npm run dev`  
   → **https://localhost:3000**

**HTTP only:** `npm run dev:http` → http://localhost:3000

Open the URL in your browser.

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

### POST `/api/claim-ticket`
Claim 1 Dungeon Ticket using an invite code (Admin Push: gas paid by server).

**Request:**
```json
{
  "inviteCode": "YOUR_INVITE_CODE",
  "address": "0x_your_starknet_address"
}
```

**Response (success):**
```json
{
  "success": true,
  "transactionHash": "0x...",
  "message": "1 Dungeon Ticket has been sent to your address."
}
```

**Security:** Admin private key is server-only. Starknet address format is validated before sending the transaction. Each address can claim only once; each code is limited to 25 uses. **Invite codes must not be public:** set them in the `INVITE_CODES` environment variable (comma-separated, server-only); do not commit real codes.

## Invite Code Ticket Claimer

The app includes an **Invite Code Ticket Claimer** that lets users enter a text invite code and their Starknet address to receive 1 Dungeon Ticket. The transfer is executed by the Admin Wallet (gas paid server-side).

- **Valid codes:** Set via **`INVITE_CODES`** env var (comma-separated, e.g. `INVITE_CODES=CODE1,CODE2,CODE3`). Never commit real codes; optional fallback file `lib/invite-codes.json` is gitignored.
- **Max uses per code:** 25.
- **One claim per address:** Each Starknet address can only claim once.
- **Constants:** Ticket contract `0x0452810188C4Cb3AEbD63711a3b445755BC0D6C4f27B923fDd99B1A118858136`.

Required env vars: `STARKNET_RPC`, `ADMIN_ADDRESS`, `ADMIN_PRIVATE_KEY`. **Important:** (1) `ADMIN_ADDRESS` must be a **deployed** Starknet account on the same network as `STARKNET_RPC`. (2) The admin account must **hold Dungeon Ticket tokens** at the ticket contract address — each claim transfers 1 ticket from the admin to the user, so "ERC20: INSUFFICIENT BALANCE" means the admin wallet needs to be funded with tickets. Claim state is stored only in Supabase: set `NEXT_PUBLIC_SUPABASE_URL_INVITE` and `SUPABASE_SERVICE_ROLE_KEY_INVITE` and run `supabase/ticket_claims.sql` in that project.

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── claim-ticket/
│   │   │   └── route.ts          # Invite code ticket claim (admin push)
│   │   ├── referrals/
│   │   │   └── route.ts          # Referral CRUD endpoints
│   │   └── verify/
│   │       └── route.ts          # On-chain verification
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Main page
├── components/
│   ├── InviteCodeTicketClaimer.tsx # Invite code ticket claim UI
│   ├── ReferralLeaderboard.tsx   # Leaderboard component
│   ├── ReferralShare.tsx         # Share referral link component
│   └── WalletConnection.tsx      # Wallet connection component
├── hooks/
│   └── useReferral.ts            # Referral capture hook
├── lib/
│   ├── claim-state.ts            # Claim state (Supabase ticket_claims only)
│   ├── invite-codes.example.json # Example format only; real codes via INVITE_CODES env
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

### Wallet won’t connect / CSP or WASM errors

When you click “Connect Wallet”, the Cartridge Controller opens in an **iframe** loaded from **api.cartridge.gg**. The errors you see (Google Fonts blocked, Stripe blocked, WASM “unreachable”) come from **that iframe’s** Content-Security-Policy — i.e. from Cartridge’s server, not from this app. We can’t change their headers.

**Workarounds that often fix Connect Wallet in dev:**

1. **Use HTTPS**  
   Run `npm run certs` then `npm run dev` and open **https://localhost:3000** (not `http://`).

2. **Temporarily relax CSP for localhost (Chrome)**  
   - Install an extension that disables CSP for the current site, e.g. “Disable Content-Security-Policy” or “CSP Unblock”.  
   - Enable it only for `https://localhost:3000` (or your dev URL).  
   - Reload and try “Connect Wallet” again.  
   Use only for local development; leave it off on production sites.

3. **Try another browser**  
   Sometimes one browser (e.g. Chrome vs Firefox) works when the other doesn’t.

4. **Report upstream**  
   If it still fails, open an issue with [Cartridge (controller)](https://github.com/cartridge-gg/controller) and mention that their iframe CSP blocks `https://fonts.googleapis.com` and `https://js.stripe.com`, which breaks the connect flow. They need to add those to `style-src` / `script-src` (or equivalent) for their Controller UI.

## Security Considerations

1. **API Protection**: Consider adding authentication to `/api/verify` endpoint
2. **Rate Limiting**: Implement rate limiting on referral creation
3. **Input Validation**: Address format validation is already implemented
4. **Self-Referral Prevention**: The system prevents users from referring themselves

## License

MIT


