# Security & Quality Gates — CavalRe Sentinel Base

**Date:** 2026-07-22  
**Rule:** NEVER TRUST, ALWAYS VERIFY  
**Production posture:** RESEARCH ONLY — not production capital

---

## 1. Capital safety (hard gates)

| Control | Status | Evidence |
|---------|--------|----------|
| Live capital allowed | **OFF** | `ops:status` → `liveCapitalAllowed: false` |
| Write / broadcast | **OFF** | Desk VIEW mode; no signing path in Phase 0 / ML |
| Soft toxicity prior | **DISABLED** | `soft-prior.js` default `enabled: false`; returns `no_opinion` |
| Soft prior cannot relax edge floors | **PASS** | `policyHint("likely_clean")` → `no_change` |
| Soft prior cannot hard-reject alone | **PASS** | Advisory only; FillPolicy hard gates remain authoritative |
| Sim markout labels for live use | **FORBIDDEN** | All walk-forward reports set `liveUseAllowed: false` |
| Phase 0 capital interaction | **NONE** | Measurement only; no strategy, risk, or books |

**Gate rule:** Any change that enables WRITE, live capital, or soft-prior `enabled: true` requires:
1. Phase 0 verdict ≠ `INSUFFICIENT_RUNTIME`
2. Real residual markouts (not sim-only)
3. Walk-forward AUC ≥ 0.65 on **real** labels + calibration
4. Explicit human Go/No-Go review

---

## 2. Security review

| Area | Status | Notes |
|------|--------|-------|
| Private keys / mnemonics in repo | **PASS** | Phase 0 / ML scripts use no wallet secrets |
| RPC URLs | **OK** | Env override `BASE_RPC_URL`; defaults are public endpoints |
| UniswapX API | **Public read** | Open orders only; no authenticated trading API |
| Journal data | **Local** | Written under `journals/`; do not commit secrets |
| Desk API | **Local** | Research UI; not internet-facing production |
| Dependency audit | **RUN** | `npm run audit:high` |
| MODULE_TYPELESS warning | **FIXED** | `scripts/ml/package.json` → `"type": "module"` |

### Threat model (research stage)

- **In scope:** accidental live capital, false model confidence, bad labels
- **Mitigations:** fail-closed defaults, sim labels gated, soft prior disabled, Phase 0 exit criteria
- **Out of scope until production:** key custody, MEV, rate-limit abuse, multi-tenant isolation

---

## 3. Quality gates

```bash
npm run ml:test
npm run audit:high
npm run ops:status
npm run quality
```

| Gate | Pass criteria |
|------|---------------|
| ML unit tests | 22 passed, 0 failed |
| npm audit high | exit 0 |
| Capital posture | `liveCapitalAllowed: false`, soft prior disabled |
| Phase 0 not done early | Do not treat `INSUFFICIENT_RUNTIME` as GO |

---

## 4. What was built (this research arc)

### Phase 0
- Continuous Dutch_V3 residual poller (retry/backoff, notionalUsd)
- Market note (density / survival / verdict)
- CSV export
- Journals under `journals/phase0/`

### ML flywheel (advisory)
- Feature schema v1 (7 features, locked)
- Synthetic generator + walk-forward logistic
- Journal adapter + markout join
- Sim offline markout (verification only)
- Soft prior (default disabled)

### Ops
- `ops:status`, `docs/DATA_MAP.md`, `docs/RESEARCH.md`, this document

### Explicit non-goals done correctly
- Did not enable live capital
- Did not wire soft prior into FillPolicy
- Did not claim sim AUC as production edge

---

## 5. Known limitations

1. Phase 0 sample still short — not production density.
2. 127 labeled rows are **sim** markouts only.
3. Walk-forward ~0.48 AUC on sim accepts → NO_SIGNAL.
4. Live markout path still age-gated + RPC.

---

## 6. Production readiness verdict

| Dimension | Verdict |
|-----------|---------|
| Research tooling | **Usable** |
| Capital safety controls | **PASS** (fail-closed) |
| Production trading | **NOT READY** |
| Phase 0 complete | **NO** |
| Phase 1 start | **BLOCKED** on Phase 0 exit |

**Overall:** Secure for continued **research**. Not approved for production capital.
