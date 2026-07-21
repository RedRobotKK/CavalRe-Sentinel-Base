# Go / No-Go — Live Capital

**Authority:** Team lead (JS / Cumberland-grade PM + design).  
**Default:** NO-GO. Live mode remains disabled in code.

---

## Pre-conditions (all required)

1. Dry-run harness operated with **markout-ready feature rows** for ≥ **7 calendar days**.
2. Shadow book built: for every `policyAction=accept`, simulated markout at +30s and +2m vs reference mid/AMM.
3. **No** RiskEngine or journal integrity bugs in that window.
4. Priority still classified ignore (or a separate signed Priority policy exists).
5. External signer path reviewed; no keys in repo/CI/journals.

---

## Quantitative gates (shadow accepts only)

| Metric | Go threshold | No-go if |
|--------|--------------|----------|
| N accepts (shadow) | ≥ 100 | < 100 |
| Mean markout bps (+2m) | ≥ 0 after estimated gas | < 0 |
| Median markout bps (+2m) | ≥ −5 bps | < −5 |
| Fraction toxic (markout ≤ −30 bps) | ≤ 25% | > 25% |
| Worst day shadow PnL (USDC-eq) | ≥ −1% of target equity | < −1% |
| Accept rate of all seen orders | recorded (no hard gate) | — |

Gas assumption for shadow must be written in the report (Base L2 gas in USDC-eq).

---

## Phase 1 live (only after Go)

- Max equity at risk: **$200**
- Same RiskEngine defaults scaled to that equity
- Direct `Reactor.execute` only; no callback executor required
- Halt on first unexplained divergence vs shadow model
- Daily review mandatory

---

## Explicit No-Go triggers (any time)

- Live mode enabled without this document satisfied
- Private key in journal, git, or CI logs
- Markout pipeline broken for >24h while live
- Toxic fraction > 40% over rolling 50 live fills

**Signature line (human):** ______________________ Date: __________
