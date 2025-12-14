#!/bin/bash
# Test script for qualification progression enhancements
# This script tests the new endpoints without requiring a full tournament setup

BASE_URL="${BASE_URL:-http://localhost:3004}"
TURNIER_ID="${1:-1}"

echo "=========================================="
echo "Testing Qualification Progression Enhancements"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo "Tournament ID: $TURNIER_ID"
echo "=========================================="
echo ""

echo "=== Test 1: Check Qualification Status ==="
echo "GET /api/turniere/$TURNIER_ID/qualification-status"
response=$(curl -s "$BASE_URL/api/turniere/$TURNIER_ID/qualification-status")
echo "$response" | jq . 2>/dev/null || echo "$response"
echo ""

echo "=== Test 2: Try Manual Trigger (might fail if not ready) ==="
echo "POST /api/turniere/$TURNIER_ID/trigger-qualification-complete"
response=$(curl -s -X POST "$BASE_URL/api/turniere/$TURNIER_ID/trigger-qualification-complete")
echo "$response" | jq . 2>/dev/null || echo "$response"
echo ""

echo "=========================================="
echo "Tests Complete!"
echo "=========================================="
echo ""
echo "Notes:"
echo "- Test 1 should show qualification status (even if tournament doesn't exist)"
echo "- Test 2 might fail if qualification isn't complete or tournament doesn't exist"
echo "- These are non-destructive read operations"
echo ""
