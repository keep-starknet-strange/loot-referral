#!/bin/bash
# Process all referrals by running batches sequentially until completion

cd /Users/estevan.vilar/Downloads/loot-referral-main
source .env.local

BATCH_LIMIT=${VERIFY_BATCH_LIMIT:-10}
START_OFFSET=${1:-0}  # Accept starting offset as first argument, default to 0
BATCH_OFFSET=$START_OFFSET
BATCH_NUMBER=$((START_OFFSET / BATCH_LIMIT))
TOTAL_PROCESSED=0
ALL_RESULTS=()

echo "=== Processing All Referrals ==="
echo "Batch limit: $BATCH_LIMIT"
echo "Starting from offset: $BATCH_OFFSET (batch #$((BATCH_NUMBER + 1)))"
echo ""

while true; do
    BATCH_NUMBER=$((BATCH_NUMBER + 1))
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Batch #$BATCH_NUMBER: Processing referrals $BATCH_OFFSET to $((BATCH_OFFSET + BATCH_LIMIT - 1))"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    START_TIME=$(date +%s)
    
    RESPONSE=$(curl -s -X POST "http://localhost:3000/api/verify?batch_limit=$BATCH_LIMIT&batch_offset=$BATCH_OFFSET" \
      -H "Content-Type: application/json" \
      -H "x-verify-key: $VERIFY_API_KEY" \
      -w "\nHTTP_STATUS:%{http_code}")
    
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
    BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
    
    if [ "$HTTP_STATUS" != "200" ]; then
        echo "❌ Error: HTTP $HTTP_STATUS"
        echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
        break
    fi
    
    # Parse response
    TOTAL=$(echo "$BODY" | jq -r '.total // 0')
    UPDATED=$(echo "$BODY" | jq -r '.updated // 0')
    NEWLY_VERIFIED=$(echo "$BODY" | jq -r '.newlyVerified // 0')
    HAS_MORE=$(echo "$BODY" | jq -r '.hasMore // false')
    EVENTS_SCANNED=$(echo "$BODY" | jq -r '.eventsScanned // 0')
    TXS_FETCHED=$(echo "$BODY" | jq -r '.txsFetched // 0')
    
    TOTAL_PROCESSED=$((TOTAL_PROCESSED + TOTAL))
    
    echo "✓ Completed in ${DURATION}s"
    echo "  Processed: $TOTAL referrals"
    echo "  Updated: $UPDATED game counts"
    echo "  Newly verified: $NEWLY_VERIFIED"
    echo "  Events scanned: $EVENTS_SCANNED"
    echo "  Transactions fetched: $TXS_FETCHED"
    echo "  Has more: $HAS_MORE"
    echo ""
    
    ALL_RESULTS+=("$BODY")
    
    # Check if we're done
    if [ "$HAS_MORE" = "false" ] || [ "$TOTAL" -lt "$BATCH_LIMIT" ]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "✅ All batches processed!"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        break
    fi
    
    # Move to next batch
    BATCH_OFFSET=$((BATCH_OFFSET + BATCH_LIMIT))
    
    # Safety limit
    if [ $BATCH_NUMBER -ge 100 ]; then
        echo "⚠ Safety limit reached (100 batches). Stopping."
        break
    fi
    
    # Small delay between batches to avoid overwhelming the server
    sleep 1
done

echo ""
echo "=== Summary ==="
echo "Total batches: $BATCH_NUMBER"
echo "Total referrals processed: $TOTAL_PROCESSED"
echo ""
