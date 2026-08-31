#!/bin/bash
set -e

# ── Freebuff Desktop — Webhook E2E Tests ──

PORT="${TEST_PORT:-3000}"
BASE="http://localhost:$PORT"
PASS=0; FAIL=0; TOTAL=0

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

check() {
  TOTAL=$((TOTAL + 1))
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    green "  ✅ $label"
    PASS=$((PASS + 1))
  else
    red   "  ❌ $label  (expected: $expected, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_contains() {
  TOTAL=$((TOTAL + 1))
  local label="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -qi "$needle" 2>/dev/null; then
    green "  ✅ $label"
    PASS=$((PASS + 1))
  else
    red   "  ❌ $label  (expected to contain: $needle)"
    red   "       got: $(echo $haystack | head -c 200)"
    FAIL=$((FAIL + 1))
  fi
}

# Clean old test data to avoid slot conflicts
psql -U postgres -d freebuff -c "DELETE FROM \"Message\" WHERE \"conversationId\" IN (SELECT id FROM \"Conversation\" WHERE \"contactId\" IN (SELECT id FROM \"Contact\" WHERE phone LIKE '62810%' OR phone LIKE '62899%' OR phone LIKE '62855%' OR phone LIKE '62877%'))" >/dev/null 2>&1
psql -U postgres -d freebuff -c "DELETE FROM \"Conversation\" WHERE \"contactId\" IN (SELECT id FROM \"Contact\" WHERE phone LIKE '62810%' OR phone LIKE '62899%' OR phone LIKE '62855%' OR phone LIKE '62877%')" >/dev/null 2>&1
psql -U postgres -d freebuff -c "DELETE FROM \"WorkflowExecution\" WHERE \"contactId\" IN (SELECT id FROM \"Contact\" WHERE phone LIKE '62810%' OR phone LIKE '62899%' OR phone LIKE '62855%' OR phone LIKE '62877%')" >/dev/null 2>&1
psql -U postgres -d freebuff -c "DELETE FROM \"Appointment\" WHERE \"contactId\" IN (SELECT id FROM \"Contact\" WHERE phone LIKE '62810%' OR phone LIKE '62899%' OR phone LIKE '62855%' OR phone LIKE '62877%')" >/dev/null 2>&1
psql -U postgres -d freebuff -c "DELETE FROM \"Contact\" WHERE phone LIKE '62810%' OR phone LIKE '62899%' OR phone LIKE '62855%' OR phone LIKE '62877%'" >/dev/null 2>&1
echo "  🧹 Cleaned old test data"

# Get business IDs
REST_ID=$(psql -U postgres -d freebuff -t -A -c "SELECT id FROM \"Business\" WHERE slug='demo-restaurant' LIMIT 1;")
CLINIC_ID=$(psql -U postgres -d freebuff -t -A -c "SELECT id FROM \"Business\" WHERE slug='demo-dental-clinic' LIMIT 1;")

bold "═══════════════════════════════════════════════════════"
bold "  WEBHOOK E2E TESTS"
bold "═══════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════
bold "📨 Section 1: OpenWA Webhook Payload Parsing"
echo ""

bold "  Test 1: Standard message.received event"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-raw" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-session-001","event":"message.received","data":{"body":"Hello there!","from":"628100600001@c.us","type":"chat","sender":{"pushname":"Alice"}}}')
check "returns ok" "$(echo $R | jq -r '.ok')" "true"
check "has conversationId" "$(echo $R | jq -r '.data[0].conversationId | length > 10')" "true"
check "intent is greeting" "$(echo $R | jq -r '.data[0].intent')" "greeting"
check_contains "greeting response" "$(echo $R | jq -r '.data[0].messages[0].content')" "Welcome"
echo ""

bold "  Test 2: status@broadcast filtered"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-raw" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-session-001","event":"message.received","data":{"body":"read","from":"status@broadcast","type":"chat"}}')
check "skipped" "$(echo $R | jq -r '.skipped')" "true"
echo ""

bold "  Test 3: Unknown session"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-raw" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"nonexistent-session","event":"message.received","data":{"body":"hi","from":"628100600002@c.us","type":"chat"}}')
check "skipped" "$(echo $R | jq -r '.skipped')" "true"
check_contains "hint mentions Integration" "$R" "Integration"
echo ""

bold "  Test 4: Batch format"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-raw" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-session-001","messages":[{"from":"628100600003@c.us","body":"Hi!","type":"chat","pushname":"Carol"},{"from":"628100600004@c.us","body":"How much does dinner cost?","type":"chat","pushname":"Dave"}]}')
check "processed 2 messages" "$(echo $R | jq '.data | length')" "2"
check "first is greeting" "$(echo $R | jq -r '.data[0].intent')" "greeting"
check_contains "second is pricing/faq" "$(echo $R | jq -r '.data[1].intent')" "pricing\|faq"
echo ""

bold "  Test 5: Non-chat (image) message — fresh phone"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-raw" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-session-001","event":"message.received","data":{"body":"","from":"628100600005@c.us","type":"image","sender":{"pushname":"Photo"}}}')
check "returns ok" "$(echo $R | jq -r '.ok')" "true"
check "generates response" "$(echo $R | jq '.data[0].messages | length > 0')" "true"
echo ""

# ═══════════════════════════════════════════════════════
bold "🔄 Section 2: Multi-turn Booking — Restaurant (4 turns)"
echo ""

bold "  Turn 1: Initiate booking"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"demo-restaurant","phone":"628100700001","message":"I want to book a table for 4 people","profileName":"Alice B."}')
check "returns ok" "$(echo $R | jq -r '.ok')" "true"
check "intent is booking" "$(echo $R | jq -r '.data.intent')" "booking"
check_contains "asks for occasion" "$(echo $R | jq -r '.data.messages[0].content')" "occasion"
echo ""

bold "  Turn 2: Provide occasion"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"demo-restaurant","phone":"628100700001","message":"It is a birthday dinner","profileName":"Alice B."}')
check "returns ok" "$(echo $R | jq -r '.ok')" "true"
check_contains "asks for date" "$(echo $R | jq -r '.data.messages[0].content')" "date"
echo ""

bold "  Turn 3: Provide date"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"demo-restaurant","phone":"628100700001","message":"Tomorrow at 3pm","profileName":"Alice B."}')
check "returns ok" "$(echo $R | jq -r '.ok')" "true"
check_contains "asks for time" "$(echo $R | jq -r '.data.messages[0].content')" "time"
echo ""

bold "  Turn 4: Provide time → booking confirmed"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"demo-restaurant","phone":"628100700001","message":"3pm please","profileName":"Alice B."}')
check "returns ok" "$(echo $R | jq -r '.ok')" "true"
check_contains "confirmation message" "$(echo $R | jq -r '.data.messages[0].content')" "booked"
check "appointment created" "$(echo $R | jq -r '.data.appointmentId | length > 10')" "true"
echo ""

# ═══════════════════════════════════════════════════════
bold "🚨 Section 3: Complaint Escalation"
echo ""

bold "  Test 6: Complaint triggers handoff"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"demo-restaurant","phone":"628101100001","message":"This is terrible! The food was cold and service awful! I want a manager NOW!","profileName":"Angry C."}')
check "escalation detected" "$(echo $R | jq -r '.data.escalation')" "handoff"
check_contains "handoff message" "$(echo $R | jq -r '.data.messages[0].content')" "connected"
echo ""

bold "  Test 7: Human agent request"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"demo-restaurant","phone":"628101100002","message":"Connect me to a real person please","profileName":"Handoff U."}')
check "escalation detected" "$(echo $R | jq -r '.data.escalation')" "handoff"
echo ""

# ═══════════════════════════════════════════════════════
bold "🦷 Section 4: Clinic Multi-turn Booking (3 turns)"
echo ""

bold "  Turn 1: Initiate — service auto-fills from entities, asks for date"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"demo-dental-clinic","phone":"628100900001","message":"I need a teeth cleaning appointment","profileName":"Patient P."}')
check "returns ok" "$(echo $R | jq -r '.ok')" "true"
check "intent is booking" "$(echo $R | jq -r '.data.intent')" "booking"
check_contains "asks for date" "$(echo $R | jq -r '.data.messages[0].content')" "date"
echo ""

bold "  Turn 2: Provide date — asks for time"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"demo-dental-clinic","phone":"628100900001","message":"Next Monday","profileName":"Patient P."}')
check "returns ok" "$(echo $R | jq -r '.ok')" "true"
check_contains "asks for time" "$(echo $R | jq -r '.data.messages[0].content')" "time"
echo ""

bold "  Turn 3: Provide time → appointment confirmed"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"demo-dental-clinic","phone":"628100900001","message":"10am please","profileName":"Patient P."}')
check "returns ok" "$(echo $R | jq -r '.ok')" "true"
check "appointment created" "$(echo $R | jq -r '.data.appointmentId | length > 10')" "true"
check_contains "confirmation message" "$(echo $R | jq -r '.data.messages[0].content')" "booked\|appointment"
echo ""

bold "  Test 8: Clinic FAQ (pricing)"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"demo-dental-clinic","phone":"628100900002","message":"How much does teeth cleaning cost?","profileName":"Price C."}')
check "pricing intent" "$(echo $R | jq -r '.data.intent')" "pricing"
check_contains "pricing in response" "$(echo $R | jq -r '.data.messages[0].content')" "cleaning\|\$\|price"
echo ""

bold "  Test 9: Clinic greeting"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"demo-dental-clinic","phone":"628100900003","message":"Hi!","profileName":"New P."}')
check "intent is greeting" "$(echo $R | jq -r '.data.intent')" "greeting"
check_contains "clinic greeting" "$(echo $R | jq -r '.data.messages[0].content')" "Dental\|Clinic"
echo ""

# ═══════════════════════════════════════════════════════
bold "🌐 Section 5: Conversations API"
echo ""

bold "  Test 10: GET /api/conversations"
R=$(curl -s -m 30 "$BASE/api/conversations?businessId=$REST_ID")
check "endpoint works" "$(echo $R | jq -r '.ok')" "true"
check "has items array" "$(echo $R | jq '.data.items | length > 0')" "true"
check "has total count" "$(echo $R | jq '.data.total > 0')" "true"
echo ""

bold "  Test 11: GET /api/conversations/[id] (detail)"
FIRST_CONV=$(echo $R | jq -r '.data.items[0].id')
if [ -n "$FIRST_CONV" ] && [ "$FIRST_CONV" != "null" ]; then
  DETAIL=$(curl -s -m 30 "$BASE/api/conversations/$FIRST_CONV")
  check "detail works" "$(echo $DETAIL | jq -r '.ok')" "true"
  check "has messages" "$(echo $DETAIL | jq '.data.messages | length > 0')" "true"
  check "has contact" "$(echo $DETAIL | jq '.data.contact | length > 0')" "true"
  check "has business" "$(echo $DETAIL | jq '.data.business | length > 0')" "true"
else
  red "  ⚠️  No conversations found"
fi
echo ""

# ═══════════════════════════════════════════════════════
bold "📡 Section 6: API Infrastructure"
echo ""

bold "  Test 12: GET /api/sessions"
R=$(curl -s -m 30 "$BASE/api/sessions")
check "endpoint works" "$(echo $R | jq -r '.ok')" "true"
check "provider is openwa" "$(echo $R | jq -r '.data.provider')" "openwa"
echo ""

bold "  Test 13: GET /api/docs"
R=$(curl -s -m 30 "$BASE/api/docs")
check "has name" "$(echo $R | jq -r '.name')" "Freebuff Desktop API"
check "has version" "$(echo $R | jq -r '.version')" "0.1.0"
check "has endpoints" "$(echo $R | jq 'has("endpoints")')" "true"
echo ""

bold "  Test 14: POST /api/webhooks/openwa (real endpoint)"
R=$(curl -s -m 30 -X POST "$BASE/api/webhooks/openwa" \
  -H "Content-Type: application/json" \
  -d '{"event":"message.received","sessionId":"test-session-001","data":{"body":"Real webhook test","from":"628100600010@c.us","type":"chat","sender":{"pushname":"Webhook"}}}')
check "real webhook ok" "$(echo $R | jq -r '.ok')" "true"
echo ""

bold "  Test 15: GET /api/cron/followups"
R=$(curl -s -m 30 "$BASE/api/cron/followups")
check "cron works" "$(echo $R | jq -r '.ok')" "true"
echo ""

# ═══════════════════════════════════════════════════════
bold "🔁 Section 7: Complete Conversation Lifecycle"
echo ""

PHONE="628101000001"

bold "  Step 1/5: Greeting"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d "{\"businessSlug\":\"demo-restaurant\",\"phone\":\"$PHONE\",\"message\":\"Hi there!\",\"profileName\":\"LC Test\"}")
check_contains "greeting works" "$(echo $R | jq -r '.data.messages[0].content')" "Hello\|Welcome"

bold "  Step 2/5: FAQ"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d "{\"businessSlug\":\"demo-restaurant\",\"phone\":\"$PHONE\",\"message\":\"What are your opening hours?\",\"profileName\":\"LC Test\"}")
check_contains "FAQ works" "$(echo $R | jq -r '.data.messages[0].content')" "Mon\|AM\|PM\|hour\|11"
echo ""

bold "  Step 3/5: Complaint → handoff"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d "{\"businessSlug\":\"demo-restaurant\",\"phone\":\"$PHONE\",\"message\":\"This is terrible! The food was cold and service awful! I want a manager NOW!\",\"profileName\":\"LC Test\"}")
check "complaint escalates" "$(echo $R | jq -r '.data.escalation')" "handoff"
echo ""

bold "  Step 4/5: Verify conversations list"
R=$(curl -s -m 30 "$BASE/api/conversations?businessId=$REST_ID")
check "multiple conversations exist" "$(echo $R | jq '.data.items | length > 3')" "true"
echo ""

# ═══════════════════════════════════════════════════════
bold "⚡ Section 8: Error Handling"
echo ""

bold "  Test 16: Missing business slug"
R=$(curl -s -m 30 -X POST "$BASE/api/test/webhook-simulate" \
  -H "Content-Type: application/json" \
  -d '{"businessSlug":"nonexistent","message":"hi","phone":"123"}')
check "returns error" "$(echo $R | jq -r '.ok')" "false"
echo ""

bold "  Test 17: Homepage loads"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 30 http://localhost:$PORT/)
check "homepage 200" "$HTTP_CODE" "200"
echo ""

# ═══════════════════════════════════════════════════════
echo ""
bold "═══════════════════════════════════════════════════════"
printf "\033[1m  RESULTS: %d/%d passed, %d failed\033[0m\n" "$PASS" "$TOTAL" "$FAIL"
bold "═══════════════════════════════════════════════════════"

if [ $FAIL -eq 0 ]; then
  echo ""
  green "🎉 ALL TESTS PASSED!"
  echo ""
  echo "  ✅ OpenWA webhook payload parsing (standard, batch, media, broadcast filter)"
  echo "  ✅ Session routing (known session resolves business, unknown returns hint)"
  echo "  ✅ Multi-turn restaurant booking (4 turns → appointment created)"
  echo "  ✅ Multi-turn clinic booking (3 turns → appointment created)"
  echo "  ✅ Complaint escalation / human handoff"
  echo "  ✅ FAQ / knowledge base responses"
  echo "  ✅ Conversations API (list + detail with messages/contact)"
  echo "  ✅ OpenWA sessions API"
  echo "  ✅ Real webhook endpoint accepts OpenWA payloads"
  echo "  ✅ Cron/followup endpoint"
  echo "  ✅ API documentation"
  echo "  ✅ Error handling (missing business)"
  echo "  ✅ Full lifecycle (greeting → FAQ → complaint escalation)"
  echo ""
  exit 0
else
  red "💥 $FAIL test(s) failed"
  exit 1
fi
