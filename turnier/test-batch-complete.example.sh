#!/bin/bash

# Example script to test batch complete games functionality
# This is for testing purposes only and should be removed before production

# Configuration
TURNIER_ID=${1:-1}
COUNT=${2:-10}
BASE_URL=${BASE_URL:-http://localhost:3004}

echo "=========================================="
echo "Testing: Batch Complete Games"
echo "=========================================="
echo "Tournament ID: $TURNIER_ID"
echo "Games to complete: $COUNT"
echo "Base URL: $BASE_URL"
echo "=========================================="
echo ""

# Execute the batch complete
echo "Executing batch complete..."
response=$(curl -s -X POST "$BASE_URL/api/turniere/$TURNIER_ID/test/batch-complete-games" \
  -H "Content-Type: application/json" \
  -d "{\"count\": $COUNT}")

echo "Response:"
echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
echo ""
echo "=========================================="
echo "Done!"
echo "=========================================="
