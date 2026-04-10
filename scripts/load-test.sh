#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Luka System — Load Test Script
# Self-contained: uses only curl + bash (no k6, artillery, etc.)
#
# Usage:  ./scripts/load-test.sh [concurrent_users] [requests_per_user]
# Example: ./scripts/load-test.sh 10 50
#
# Environment variables:
#   API_URL          Base API URL       (default: http://localhost:3001/api)
#   LOGIN_EMAIL      Admin email        (default: admin@lukapoke.com)
#   LOGIN_PASSWORD   Admin password     (default: Admin123!)
#   BRANCH_ID        Branch ID for store dashboard test (auto-detected if omitted)
# ──────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ────────────────────────────────────────────

API_URL="${API_URL:-http://localhost:3001/api}"
CONCURRENT="${1:-10}"
REQUESTS="${2:-50}"
LOGIN_EMAIL="${LOGIN_EMAIL:-admin@lukapoke.com}"
LOGIN_PASSWORD="${LOGIN_PASSWORD:-Admin123!}"

TMPDIR_LOAD=$(mktemp -d)
trap 'rm -rf "$TMPDIR_LOAD"' EXIT

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

# ── Helper functions ─────────────────────────────────────────

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${RESET} $*"; }
ok()   { echo -e "${GREEN}[OK]${RESET} $*"; }
fail() { echo -e "${RED}[FAIL]${RESET} $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET} $*"; }

header() {
  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  $1${RESET}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
}

# ── Validate dependencies ────────────────────────────────────

for cmd in curl bc awk sort; do
  if ! command -v "$cmd" &>/dev/null; then
    fail "Required command '$cmd' not found."
    exit 1
  fi
done

# ── Login to get JWT token ───────────────────────────────────

header "LUKA SYSTEM LOAD TEST"
log "Target:     $API_URL"
log "Concurrent: $CONCURRENT users"
log "Requests:   $REQUESTS per user per endpoint"
log "Total:      $((CONCURRENT * REQUESTS)) requests per endpoint"
echo ""

log "Authenticating..."
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}")

LOGIN_HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

if [ "$LOGIN_HTTP_CODE" != "200" ] && [ "$LOGIN_HTTP_CODE" != "201" ]; then
  fail "Login failed with HTTP $LOGIN_HTTP_CODE"
  echo "$LOGIN_BODY"
  exit 1
fi

# Extract token — handles both { accessToken: "..." } and { access_token: "..." }
TOKEN=$(echo "$LOGIN_BODY" | grep -o '"access[_T]*oken"\s*:\s*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')

if [ -z "$TOKEN" ]; then
  fail "Could not extract JWT token from login response."
  echo "$LOGIN_BODY" | head -5
  exit 1
fi
ok "Authenticated (token: ${TOKEN:0:20}...)"

# ── Auto-detect a branch ID if not provided ──────────────────

if [ -z "${BRANCH_ID:-}" ]; then
  log "Detecting branch ID..."
  BRANCHES_RESPONSE=$(curl -s "$API_URL/branches" \
    -H "Authorization: Bearer $TOKEN")
  # Try to grab the first branch ID from the response
  BRANCH_ID=$(echo "$BRANCHES_RESPONSE" | grep -o '"id"\s*:\s*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
  if [ -z "$BRANCH_ID" ]; then
    # Fallback: try numeric id
    BRANCH_ID=$(echo "$BRANCHES_RESPONSE" | grep -o '"id"\s*:\s*[0-9]*' | head -1 | grep -o '[0-9]*$')
  fi
  if [ -n "$BRANCH_ID" ]; then
    ok "Using branch ID: $BRANCH_ID"
  else
    warn "Could not auto-detect branch ID. Store dashboard test will be skipped."
  fi
fi

# ── Worker function: sends sequential requests ───────────────
#
# Writes one line per request to an output file:
#   <http_code> <time_total_ms>
#
run_worker() {
  local endpoint="$1"
  local method="$2"
  local auth="$3"        # "auth" or "noauth"
  local body="$4"        # JSON body for POST, or empty
  local count="$5"
  local outfile="$6"

  local curl_args=(-s -o /dev/null -w "%{http_code} %{time_total}")
  curl_args+=(-X "$method")
  curl_args+=("$API_URL$endpoint")

  if [ "$auth" = "auth" ]; then
    curl_args+=(-H "Authorization: Bearer $TOKEN")
  fi

  if [ -n "$body" ]; then
    curl_args+=(-H "Content-Type: application/json" -d "$body")
  fi

  for ((i = 0; i < count; i++)); do
    result=$(curl "${curl_args[@]}" 2>/dev/null || echo "000 0.000")
    http_code=$(echo "$result" | awk '{print $1}')
    time_s=$(echo "$result" | awk '{print $2}')
    time_ms=$(echo "$time_s * 1000" | bc 2>/dev/null || echo "0")
    echo "$http_code $time_ms" >> "$outfile"
  done
}

# ── Run a load test for one endpoint ─────────────────────────
#
# Spawns $CONCURRENT background workers, waits for all, aggregates.
#
run_endpoint_test() {
  local label="$1"
  local endpoint="$2"
  local method="${3:-GET}"
  local auth="${4:-auth}"
  local body="${5:-}"

  local result_dir="$TMPDIR_LOAD/$label"
  mkdir -p "$result_dir"

  log "Testing: $method $endpoint ($label)"
  log "  -> $CONCURRENT users x $REQUESTS requests = $((CONCURRENT * REQUESTS)) total"

  local start_time
  start_time=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")

  # Spawn concurrent workers
  local pids=()
  for ((u = 0; u < CONCURRENT; u++)); do
    run_worker "$endpoint" "$method" "$auth" "$body" "$REQUESTS" "$result_dir/worker_$u.txt" &
    pids+=($!)
  done

  # Wait for all workers
  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done

  local end_time
  end_time=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")

  # Aggregate results
  local combined="$result_dir/combined.txt"
  cat "$result_dir"/worker_*.txt > "$combined" 2>/dev/null || touch "$combined"

  local total_requests
  total_requests=$(wc -l < "$combined" | tr -d ' ')

  if [ "$total_requests" -eq 0 ]; then
    warn "  No results collected for $label"
    echo "$label|$endpoint|$method|0|0|0|0|0|0|0|0" >> "$TMPDIR_LOAD/summary.csv"
    return
  fi

  # Count successes (2xx) and failures
  local successes failures
  successes=$(awk '$1 >= 200 && $1 < 300 { count++ } END { print count+0 }' "$combined")
  failures=$((total_requests - successes))

  # Count rate-limited (429)
  local rate_limited
  rate_limited=$(awk '$1 == 429 { count++ } END { print count+0 }' "$combined")

  # Timing stats from second column (ms)
  local times_file="$result_dir/times.txt"
  awk '{print $2}' "$combined" | sort -n > "$times_file"

  local min_ms avg_ms max_ms p95_ms
  min_ms=$(head -1 "$times_file")
  max_ms=$(tail -1 "$times_file")
  avg_ms=$(awk '{ sum += $1; count++ } END { if (count > 0) printf "%.1f", sum/count; else print 0 }' "$times_file")
  p95_ms=$(awk -v p=0.95 'BEGIN{} { a[NR]=$1 } END { idx=int(NR*p); if(idx<1) idx=1; printf "%.1f", a[idx] }' "$times_file")

  # Requests per second
  local wall_ms rps
  wall_ms=$(( (end_time - start_time) / 1000000 ))
  if [ "$wall_ms" -gt 0 ]; then
    rps=$(echo "scale=1; $total_requests * 1000 / $wall_ms" | bc)
  else
    rps="N/A"
  fi

  # Print inline results
  local success_rate
  success_rate=$(echo "scale=1; $successes * 100 / $total_requests" | bc)

  if [ "$failures" -eq 0 ]; then
    ok "  ${successes}/${total_requests} passed (${success_rate}%) | avg: ${avg_ms}ms | p95: ${p95_ms}ms | rps: ${rps}"
  else
    warn "  ${successes}/${total_requests} passed (${success_rate}%), ${failures} failed | avg: ${avg_ms}ms | p95: ${p95_ms}ms | rps: ${rps}"
    if [ "$rate_limited" -gt 0 ]; then
      warn "  ${rate_limited} requests were rate-limited (HTTP 429)"
    fi
  fi

  # Save to summary CSV
  echo "$label|$endpoint|$method|$total_requests|$successes|$failures|$rate_limited|$min_ms|$avg_ms|$max_ms|$p95_ms|$rps" >> "$TMPDIR_LOAD/summary.csv"
}

# ── Run rate-limit test ──────────────────────────────────────

run_rate_limit_test() {
  local endpoint="/auth/login"
  local body="{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}"
  local rapid_count=120

  header "RATE LIMITING TEST"
  log "Sending $rapid_count rapid sequential requests to POST $endpoint"
  log "Expected: throttling after ~5 requests/minute (per @Throttle decorator)"

  local result_dir="$TMPDIR_LOAD/rate_limit"
  mkdir -p "$result_dir"
  local outfile="$result_dir/results.txt"

  for ((i = 0; i < rapid_count; i++)); do
    result=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" \
      -X POST "$API_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$body" 2>/dev/null || echo "000 0.000")
    echo "$result" >> "$outfile"
  done

  local total ok_count throttled other
  total=$(wc -l < "$outfile" | tr -d ' ')
  ok_count=$(awk '$1 >= 200 && $1 < 300 { c++ } END { print c+0 }' "$outfile")
  throttled=$(awk '$1 == 429 { c++ } END { print c+0 }' "$outfile")
  other=$(( total - ok_count - throttled ))

  echo ""
  log "Rate Limit Results:"
  log "  Total requests:     $total"
  log "  Successful (2xx):   $ok_count"
  log "  Throttled (429):    $throttled"
  log "  Other errors:       $other"

  if [ "$throttled" -gt 0 ]; then
    ok "Rate limiting is working: $throttled out of $total requests were throttled."
  else
    warn "Rate limiting may NOT be working: 0 out of $total requests were throttled."
    warn "Global limit is 100 req/min. Login-specific limit is 5 req/min."
  fi

  # Record for summary
  echo "rate-limit|/auth/login|POST|$total|$ok_count|$((total - ok_count))|$throttled|-|-|-|-|-" >> "$TMPDIR_LOAD/summary.csv"
}

# ── Print summary table ──────────────────────────────────────

print_summary() {
  header "LOAD TEST SUMMARY"

  echo ""
  printf "${BOLD}%-20s %-6s %7s %7s %7s %7s %9s %9s %9s %9s %8s${RESET}\n" \
    "ENDPOINT" "METHOD" "TOTAL" "OK" "FAIL" "429" "MIN(ms)" "AVG(ms)" "MAX(ms)" "P95(ms)" "RPS"
  printf '%.0s─' {1..120}
  echo ""

  while IFS='|' read -r label endpoint method total ok_count fail_count rate_limited min_ms avg_ms max_ms p95_ms rps; do
    local color="$GREEN"
    if [ "$fail_count" -gt 0 ] 2>/dev/null; then
      color="$YELLOW"
    fi
    # All failures
    if [ "$ok_count" = "0" ] && [ "$total" != "0" ] 2>/dev/null; then
      color="$RED"
    fi

    printf "${color}%-20s %-6s %7s %7s %7s %7s %9s %9s %9s %9s %8s${RESET}\n" \
      "$label" "$method" "$total" "$ok_count" "$fail_count" "$rate_limited" \
      "$min_ms" "$avg_ms" "$max_ms" "$p95_ms" "$rps"
  done < "$TMPDIR_LOAD/summary.csv"

  printf '%.0s─' {1..120}
  echo ""

  # Grand totals
  local grand_total grand_ok grand_fail
  grand_total=$(awk -F'|' '{ sum += $4 } END { print sum+0 }' "$TMPDIR_LOAD/summary.csv")
  grand_ok=$(awk -F'|' '{ sum += $5 } END { print sum+0 }' "$TMPDIR_LOAD/summary.csv")
  grand_fail=$(awk -F'|' '{ sum += $6 } END { print sum+0 }' "$TMPDIR_LOAD/summary.csv")

  echo ""
  log "Grand total: ${grand_total} requests | ${grand_ok} succeeded | ${grand_fail} failed"

  if [ "$grand_fail" -eq 0 ]; then
    ok "All endpoint tests passed with zero failures."
  else
    local fail_pct
    fail_pct=$(echo "scale=1; $grand_fail * 100 / $grand_total" | bc)
    warn "${grand_fail} failures (${fail_pct}%). Review endpoints with failures above."
  fi
}

# ══════════════════════════════════════════════════════════════
# MAIN — Run all endpoint tests
# ══════════════════════════════════════════════════════════════

touch "$TMPDIR_LOAD/summary.csv"

header "ENDPOINT LOAD TESTS"

# 1. Health — no auth, baseline
run_endpoint_test "health" "/health" "GET" "noauth" ""

# 2. Branches — simple CRUD list
run_endpoint_test "branches" "/branches" "GET" "auth" ""

# 3. Investor dashboard — heavy aggregation
run_endpoint_test "dash-investor" "/reportes/dashboard/investor" "GET" "auth" ""

# 4. Store dashboard (if branch ID available)
if [ -n "${BRANCH_ID:-}" ]; then
  run_endpoint_test "dash-store" "/reportes/dashboard/store/$BRANCH_ID" "GET" "auth" ""
else
  warn "Skipping store dashboard test: no BRANCH_ID available"
fi

# 5. Products list (inventarios)
run_endpoint_test "products" "/inventarios/products" "GET" "auth" ""

# 6. Notifications
run_endpoint_test "notifications" "/notifications?limit=10" "GET" "auth" ""

# 7. Auth login (test with fewer requests to avoid excessive throttling during load test)
SAVED_REQUESTS=$REQUESTS
SAVED_CONCURRENT=$CONCURRENT
REQUESTS=3
CONCURRENT=2
run_endpoint_test "auth-login" "/auth/login" "POST" "noauth" \
  "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}"
REQUESTS=$SAVED_REQUESTS
CONCURRENT=$SAVED_CONCURRENT

# 8. Rate limiting test (separate, sequential)
run_rate_limit_test

# Print the final summary
print_summary

header "DONE"
log "Temp files cleaned up automatically."
log "See scripts/load-test-report.md for baseline thresholds and troubleshooting."
