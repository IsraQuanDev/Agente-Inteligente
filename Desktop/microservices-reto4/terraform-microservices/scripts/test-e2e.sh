#!/usr/bin/env bash
# scripts/test-e2e.sh — End-to-end integration tests
# Usage: BASE_URL=https://xxx.execute-api.us-east-1.amazonaws.com/prod ./scripts/test-e2e.sh

set -euo pipefail
BASE_URL="${BASE_URL:?Set BASE_URL env var}"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
PASS=0; FAIL=0

assert() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" == "$expected" ]; then
    echo -e "${GREEN}  ✓ ${desc}${NC}"
    ((PASS++))
  else
    echo -e "${RED}  ✗ ${desc} — expected ${expected}, got ${actual}${NC}"
    ((FAIL++))
  fi
}

section() { echo -e "\n${CYAN}══ $* ══${NC}"; }

# ── Health checks ─────────────────────────────
section "Health Checks"
for endpoint in /health /auth/health; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${endpoint}")
  assert "GET ${endpoint}" "200" "${STATUS}"
done

# ── Auth: JWT enforcement ─────────────────────
section "JWT Enforcement"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/users/me")
assert "GET /users/me without token → 401" "401" "${STATUS}"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer invalid.token.here" \
  "${BASE_URL}/users/me")
assert "GET /users/me with invalid token → 401" "401" "${STATUS}"

# ── Register & Login ──────────────────────────
section "Auth Flow"
UNIQUE="test_$(date +%s)"
REGISTER_RESP=$(curl -s -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${UNIQUE}@test.com\",\"password\":\"Test1234!\",\"firstName\":\"Test\",\"lastName\":\"User\"}")

STATUS=$(echo "$REGISTER_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('201' if 'accessToken' in d else '400')" 2>/dev/null || echo "parse_error")
assert "POST /auth/register returns accessToken" "201" "${STATUS}"

JWT=$(echo "$REGISTER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || echo "")
[ -n "$JWT" ] && echo -e "  → Token obtained (${#JWT} chars)" || { echo -e "${RED}  ✗ No token${NC}"; ((FAIL++)); }

LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${UNIQUE}@test.com\",\"password\":\"Test1234!\"}")
assert "POST /auth/login → 200" "200" "${LOGIN_STATUS}"

# ── Authenticated requests ────────────────────
section "Protected Endpoints"
PROFILE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${JWT}" \
  "${BASE_URL}/users/me")
assert "GET /users/me with token → 200" "200" "${PROFILE_STATUS}"

PRODUCTS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${JWT}" \
  "${BASE_URL}/products")
assert "GET /products with token → 200" "200" "${PRODUCTS_STATUS}"

# ── Create product & order ────────────────────
section "Order Flow"
PRODUCT_RESP=$(curl -s -X POST "${BASE_URL}/products" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"E2E Product\",\"price\":9.99,\"stock\":10,\"sku\":\"E2E-${UNIQUE}\",\"category\":\"test\"}")

PRODUCT_ID=$(echo "$PRODUCT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
[ -n "$PRODUCT_ID" ] && assert "POST /products → has id" "true" "true" || assert "POST /products" "id" "missing"

if [ -n "$PRODUCT_ID" ]; then
  ORDER_RESP=$(curl -s -X POST "${BASE_URL}/orders" \
    -H "Authorization: Bearer ${JWT}" \
    -H "Content-Type: application/json" \
    -d "{\"items\":[{\"productId\":\"${PRODUCT_ID}\",\"quantity\":1}],\"shippingAddress\":{\"street\":\"Test St\",\"city\":\"León\",\"country\":\"MX\"}}")
  ORDER_ID=$(echo "$ORDER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  [ -n "$ORDER_ID" ] && assert "POST /orders → has id" "true" "true" || assert "POST /orders" "id" "missing"
fi

# ── WAF Rate Limiting ─────────────────────────
section "WAF Rate Limiting (sending 10 requests)"
BLOCK_COUNT=0
for i in $(seq 1 10); do
  S=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health")
  [ "$S" == "429" ] && ((BLOCK_COUNT++)) || true
done
echo -e "  → Blocked requests: ${BLOCK_COUNT}/10 (WAF activates at 2000/min, test volume is low)"

# ── Summary ───────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo -e "  ${GREEN}PASS: ${PASS}${NC}  ${RED}FAIL: ${FAIL}${NC}"
echo "════════════════════════════════════════"
[ "$FAIL" -eq 0 ] && echo -e "${GREEN}All tests passed! ✅${NC}" && exit 0 || { echo -e "${RED}Some tests failed ❌${NC}"; exit 1; }
