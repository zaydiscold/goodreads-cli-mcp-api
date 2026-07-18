# Cron Audit & Hardening Log

> Created: 2026-07-17 by Delilah 🌸
> Purpose: Track every cron job, their error patterns, and hardening fixes applied

---

## Active Cron Jobs (4)

| Job ID | Name | Schedule | Model | Skill | Status |
|--------|------|----------|-------|-------|--------|
| `719c697263a7` | Robinhood Daily Health Check | 6am daily | deepseek-v4-pro | robinhood-cli | ⚠️ Needs hardening |
| `12869ea534ac` | Midday Portfolio Snapshot | Noon daily | deepseek-v4-flash | robinhood-cli | ✅ OK |
| `4d41abd2cecf` | Robinhood Token Refresh | Every 3 days, 4am | deepseek-v4-pro | robinhood-cli | ✅ OK |
| `987f0610414e` | Goodreads Weekly Notes | Every 2 days, noon | deepseek-v4-pro | goodreads-cli | ✅ OK |

---

## Incident: Roth IRA False Liquidation — 2026-07-16

### What happened
The 6am health check reported the Roth IRA went from $25,108.80 → $0.00 overnight, claiming "likely ACH withdrawal." This was a **complete hallucination** — the Roth IRA was never liquidated and currently holds $22,261.66.

### Timeline
| Date | Health Check Roth IRA Value | Reality | Status |
|------|---------------------------|---------|--------|
| Jul 15 | $24,976.88 ✅ | ~$25K | Correct |
| Jul 16 | $0.00 ❌ (hallucinated) | ~$23K | **False alarm** |
| Jul 17 | [empty — 0 bytes] | $22,261.66 | **Cron failed silently** |

The Jul 15 run got the Roth IRA right. Something broke between Jul 15 and 16.

### Root cause analysis
1. **Wrong model for the task:** The health check uses `deepseek-v4-pro` — an expensive reasoning model. For a mechanical data extraction + formatting task, the model has too much "thinking budget" and can drift into hallucination when confused by portfolio data.
2. **No cross-verification step:** The cron job has no "sanity check" — if an account shows $0, it should re-read that account independently before reporting a liquidation.
3. **No bail-out on paradox:** If yesterday's snapshot showed $25K and today shows $0, the agent should flag this as suspect rather than confidently reporting "liquidated."
4. **Silent failure mode:** The Jul 17 run produced 0 bytes, meaning the entire cron run failed with no error message delivered.

### Fix applied
1. ✅ **Swap model to `deepseek-v4-flash`** — same as the midday snapshot (which works perfectly). Flash is fast, cheap, and sufficient for data extraction. The midday snapshot has never hallucinated.
2. ✅ **Add cross-account sanity check rule** to the cron prompt: before reporting any account as $0, verify against a second data source.
3. ✅ **Add fail-open rule:** If the cron can't produce a coherent report, deliver the raw data with a warning rather than 0 bytes.

### Verification
- Roth IRA live: **$22,261.66** with positions: GOOGL $450C 9/18 (3ct), GOOGL $450C 8/21 (6ct), GOOGL $500C 10/16 (2ct), INTC $150C 6/17/27 (1ct), TSLA $505C 7/31 (2ct), CBRG (554sh), plus other equities
- No ACH withdrawals visible in the last 14 days
- Only 2 recent fills: DRAM buy ($240) and AAPL sell ($305) — both small options

---

## Cron-by-Cron Health

### 1. Robinhood Daily Health Check (`719c697263a7`)
- **Issue:** Model drift hallucinated account liquidation
- **Fix:** Swapped to `deepseek-v4-flash` + added sanity check rules
- **Output:** Jul 17 run was 0 bytes — empty. Previous runs had content.
- **Last good run:** Jul 15 ($24,976.88 Roth IRA, correct format)

### 2. Midday Portfolio Snapshot (`12869ea534ac`)
- **Status:** ✅ Healthy
- **Model:** `deepseek-v4-flash` — correct choice
- **Format:** Tight <15 line snapshot, works reliably
- **Last run:** Jul 17, noon — OK

### 3. Robinhood Token Refresh (`4d41abd2cecf`)
- **Status:** ✅ Healthy
- **Model:** `deepseek-v4-pro` — appropriate (needs reasoning for cross-machine auth)
- **Last run:** Jul 16, 4am — OK
- **Note:** Mothership cannot self-heal auth. This job relies on frostbyte SSH access.

### 4. Goodreads Weekly Notes (`987f0610414e`)
- **Status:** ✅ Healthy
- **Model:** `deepseek-v4-pro` — appropriate
- **Self-healing:** Detects and refreshes stale CSRF tokens automatically
- **Last run:** Jul 17, noon — OK (31 books, publicized 30, skipped 1)

---

## Hardening Rules (Applied)

### All cron jobs
1. **Never silently produce 0 bytes.** If the agent can't compile the report, deliver the raw data with a warning header.
2. **Cross-verify anomalies.** A $25K account going to $0 overnight is an anomaly, not a fact. Verify against a second source before reporting.
3. **Model selection matters.** `v4-flash` for mechanical snapshots. `v4-pro` for reasoning tasks. Never use `deepseek-chat` (V3).

### Health check specific
4. **Before reporting liquidation:** re-read the account independently. If contradiction, flag as `⚠️ DATA INCONSISTENCY` not `🚨 LIQUIDATED`.
5. **Compare against yesterday:** The cron should check the previous snapshot file before declaring any account $0.
6. **Auth failure ≠ liquidation:** If the portfolio endpoint returns empty/null for one account but others work, the account endpoint may have failed — not the account itself.

---

## Future Improvements

- [ ] Add `robinhood-trading` MCP as cron fallback (OAuth PKCE, separate token lifecycle from CLI)
- [ ] Create `~/Desktop/finance/` snapshot archive the cron can diff against
- [ ] Add watchdog cron that alerts if health check produces 0 bytes
- [ ] Add per-account sanity threshold: if any account drops >50% overnight, re-verify before reporting
