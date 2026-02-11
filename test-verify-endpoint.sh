#!/bin/bash
# Test script for verify endpoint

echo "=== Testing Verify Endpoint ==="
echo ""

# Check if server is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "❌ Error: Next.js dev server is not running on port 3000"
    echo "   Start it with: npm run dev:http"
    exit 1
fi

echo "✓ Server is running"
echo ""

# Test 1: Without API key (should work in dev mode if VERIFY_API_KEY not set)
echo "Test 1: Request without API key"
RESPONSE1=$(curl -s -X POST "http://localhost:3000/api/verify?batch_limit=5&batch_offset=0" \
  -H "Content-Type: application/json" \
  -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS1=$(echo "$RESPONSE1" | grep "HTTP_STATUS" | cut -d: -f2)
BODY1=$(echo "$RESPONSE1" | sed '/HTTP_STATUS/d')

echo "  HTTP Status: $HTTP_STATUS1"
echo "  Response: $BODY1"
echo ""

# Test 2: With API key (if VERIFY_API_KEY is set)
if [ -n "$VERIFY_API_KEY" ]; then
    echo "Test 2: Request with API key"
    RESPONSE2=$(curl -s -X POST "http://localhost:3000/api/verify?batch_limit=5&batch_offset=0" \
      -H "Content-Type: application/json" \
      -H "x-verify-key: $VERIFY_API_KEY" \
      -w "\nHTTP_STATUS:%{http_code}")
    
    HTTP_STATUS2=$(echo "$RESPONSE2" | grep "HTTP_STATUS" | cut -d: -f2)
    BODY2=$(echo "$RESPONSE2" | sed '/HTTP_STATUS/d')
    
    echo "  HTTP Status: $HTTP_STATUS2"
    echo "  Response: $BODY2"
    echo ""
else
    echo "Test 2: Skipped (VERIFY_API_KEY not set)"
    echo ""
fi

# Test 3: Check batch parameters
echo "Test 3: Testing different batch parameters"
for limit in 5 10 20; do
    echo "  Testing batch_limit=$limit"
    RESPONSE=$(curl -s -X POST "http://localhost:3000/api/verify?batch_limit=$limit&batch_offset=0" \
      -H "Content-Type: application/json" \
      -H "x-verify-key: ${VERIFY_API_KEY:-test}" 2>&1)
    
    if echo "$RESPONSE" | grep -q "batch_limit\|batchLimit\|Unauthorized\|Missing"; then
        echo "    ✓ Request processed (got response)"
    else
        echo "    ? Unexpected response"
    fi
done

echo ""
echo "=== Test Complete ==="
echo ""
echo "Note: Full test requires:"
echo "  - NEXT_PUBLIC_SUPABASE_URL"
echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "  - SUPABASE_SERVICE_ROLE_KEY"
echo "  - STARKNET_RPC"
echo "  - VERIFY_API_KEY (optional in dev mode)"
