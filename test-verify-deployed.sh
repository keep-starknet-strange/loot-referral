#!/bin/bash
# Test the verify endpoint on the deployed Vercel app

DEPLOYED_URL="https://loot-referral-git-timeoutvercel-keep-starknet-strange.vercel.app"
BATCH_LIMIT=${1:-5}
BATCH_OFFSET=${2:-0}

echo "=== Testing Verify Endpoint on Deployed App ==="
echo "URL: $DEPLOYED_URL"
echo "Batch limit: $BATCH_LIMIT"
echo "Batch offset: $BATCH_OFFSET"
echo ""

# Check if VERIFY_API_KEY is set
if [ -z "$VERIFY_API_KEY" ]; then
    echo "⚠ VERIFY_API_KEY not set in environment"
    echo "  Set it with: export VERIFY_API_KEY=your_key"
    echo "  Or provide it as the 3rd argument: $0 <limit> <offset> <api_key>"
    echo ""
    read -p "Enter VERIFY_API_KEY (or press Enter to skip): " API_KEY
    if [ -z "$API_KEY" ]; then
        echo "Skipping test..."
        exit 0
    fi
else
    API_KEY="$VERIFY_API_KEY"
fi

# Allow override from command line
if [ -n "$3" ]; then
    API_KEY="$3"
fi

echo "Making request..."
echo ""

RESPONSE=$(curl -s -X POST "$DEPLOYED_URL/api/verify?batch_limit=$BATCH_LIMIT&batch_offset=$BATCH_OFFSET" \
  -H "Content-Type: application/json" \
  -H "x-verify-key: $API_KEY" \
  -w "\nHTTP_STATUS:%{http_code}" \
  --max-time 300)

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $HTTP_STATUS"
echo ""
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ SUCCESS!"
    echo ""
    echo "Response details:"
    echo "$BODY" | jq -r '
        "Total processed: \(.total // "N/A")
Updated: \(.updated // "N/A")
Newly verified: \(.newlyVerified // "N/A")
Usernames updated: \(.usernamesUpdated // "N/A")
Batch limit: \(.batchLimit // "N/A")
Batch offset: \(.batchOffset // "N/A")
Has more: \(.hasMore // "N/A")
Events scanned: \(.eventsScanned // "N/A")
Transactions fetched: \(.txsFetched // "N/A")
Latest block: \(.latestBlock // "N/A")"
    ' 2>/dev/null || echo "  (Could not parse JSON)"
elif [ "$HTTP_STATUS" = "401" ]; then
    echo "❌ Unauthorized: Invalid VERIFY_API_KEY"
elif [ "$HTTP_STATUS" = "500" ]; then
    echo "❌ Server error: Check Vercel logs"
elif [ "$HTTP_STATUS" = "000" ] || [ -z "$HTTP_STATUS" ]; then
    echo "❌ Connection error or timeout"
else
    echo "⚠ Unexpected status: $HTTP_STATUS"
fi

echo ""
echo "=== Test Complete ==="
