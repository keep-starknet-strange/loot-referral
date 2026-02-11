#!/bin/bash
# Complete test script for verify endpoint with environment variable support

set -e

echo "=== Complete Verify Endpoint Test ==="
echo ""

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
    echo "✓ Loading environment variables from .env.local"
    export $(cat .env.local | grep -v '^#' | xargs)
else
    echo "⚠ No .env.local file found"
    echo "  You can create one with:"
    echo "    NEXT_PUBLIC_SUPABASE_URL=your_url"
    echo "    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key"
    echo "    SUPABASE_SERVICE_ROLE_KEY=your_service_key"
    echo "    STARKNET_RPC=your_rpc_url"
    echo "    VERIFY_API_KEY=your_verify_key"
    echo ""
fi

# Check required environment variables
MISSING_VARS=()
[ -z "$NEXT_PUBLIC_SUPABASE_URL" ] && MISSING_VARS+=("NEXT_PUBLIC_SUPABASE_URL")
[ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] && MISSING_VARS+=("NEXT_PUBLIC_SUPABASE_ANON_KEY")
[ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && MISSING_VARS+=("SUPABASE_SERVICE_ROLE_KEY")
[ -z "$STARKNET_RPC" ] && MISSING_VARS+=("STARKNET_RPC")

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "❌ Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Set them in .env.local or export them before running this script"
    exit 1
fi

echo "✓ All required environment variables are set"
echo ""

# Check if server is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "❌ Error: Next.js dev server is not running on port 3000"
    echo "   Start it with: npm run dev:http"
    exit 1
fi

echo "✓ Server is running"
echo ""

# Use VERIFY_API_KEY if set, otherwise use a test key (will fail but show the flow)
API_KEY="${VERIFY_API_KEY:-test-key-for-dev}"

echo "=== Running Verify Endpoint Test ==="
echo "Batch parameters: limit=5, offset=0"
echo ""

# Make the request
RESPONSE=$(curl -s -X POST "http://localhost:3000/api/verify?batch_limit=5&batch_offset=0" \
  -H "Content-Type: application/json" \
  -H "x-verify-key: $API_KEY" \
  -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $HTTP_STATUS"
echo ""
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

# Analyze the response
if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ SUCCESS: Verify endpoint completed successfully!"
    echo ""
    echo "Response summary:"
    echo "$BODY" | jq -r '
        "  Total processed: \(.total // "N/A")
  Updated: \(.updated // "N/A")
  Newly verified: \(.newlyVerified // "N/A")
  Batch limit: \(.batchLimit // "N/A")
  Batch offset: \(.batchOffset // "N/A")
  Has more: \(.hasMore // "N/A")
  Events scanned: \(.eventsScanned // "N/A")
  Transactions fetched: \(.txsFetched // "N/A")"
    ' 2>/dev/null || echo "  (Could not parse JSON)"
elif [ "$HTTP_STATUS" = "401" ]; then
    echo "⚠ Unauthorized: Check VERIFY_API_KEY"
elif [ "$HTTP_STATUS" = "500" ]; then
    echo "⚠ Server error: Check server logs for details"
    echo "  Common issues:"
    echo "    - Missing Supabase credentials"
    echo "    - Missing STARKNET_RPC"
    echo "    - Database connection issues"
else
    echo "⚠ Unexpected status: $HTTP_STATUS"
fi

echo ""
echo "=== Test Complete ==="
