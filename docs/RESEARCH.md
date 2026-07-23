# Research Playbook — CavalRe Sentinel Base

**Posture:** VIEW · WRITE OFF · NO_GO · soft prior disabled  
**Rule:** NEVER TRUST, ALWAYS VERIFY  
**Related:** [DATA_MAP](DATA_MAP.md) · [SECURITY_QUALITY](SECURITY_QUALITY.md) · [README](../README.md)

---

## Daily loop

```bash
# Terminal A — leave running
npm run phase0

# Terminal B — check anytime
npm run ops:status
npm run phase0:note
npm run phase0:csv
npm run quality
```

After **≥ 2 hours** of Phase 0, read the market note verdict before any strategy or ML promotion work.

| Verdict | Meaning |
|---------|---------|
| `INSUFFICIENT_RUNTIME` | Keep measuring |
| `TOO_SPARSE` | Residual likely not viable as primary strategy |
| `LOW_DENSITY` | Background research filler only |
| `MEASURABLE` | Enough flow to instrument markouts seriously |

---

## Data locations

| Data | Path |
|------|------|
| Live residual JSONL | `journals/phase0/phase0-*.jsonl` |
| Market note | `journals/phase0/market-note-*.{json,md}` |
| Residual CSV | `journals/phase0/residual-seen.csv`, `residual-gone.csv` |
| Sim journals | `journals/sim-base-dutch-*.jsonl` |
| ML reports | `journals/ml/` |

Full map: [DATA_MAP.md](DATA_MAP.md)

---

## ML (advisory only)

```bash
npm run ml:test
npm run ml:pipeline                 # synthetic end-to-end
npm run ml:loop -- --no-simulate    # batch sim journals
npm run ml:ingest-all
npm run ml:ingest-all -- --train    # walk-forward if ≥50 labels
```

| Rule | Detail |
|------|--------|
| Feature schema | v1 locked (7 features) until ≥300 **real** labeled accepts |
| Soft prior | Default `enabled: false` → always `no_opinion` |
| Sim labels | Pipeline verification only — never unlock live capital |
| Live unlock | Real residual AUC ≥ 0.65 + calibration + human review |

---

## Capital gates (all required)

1. Phase 0 note not `INSUFFICIENT_RUNTIME`  
2. Residual density assessed (`TOO_SPARSE` / `LOW_DENSITY` / `MEASURABLE`)  
3. Real markouts on policy accepts (not sim-only)  
4. Walk-forward AUC ≥ 0.65 on real residual  
5. Explicit Go/No-Go human review  

Until then: **no WRITE, no live capital, no soft-prior enablement.**

---

## Quality checklist

```bash
npm run quality
# expects: ml tests green, capital flags off, soft prior disabled, audit high clean
```

See [SECURITY_QUALITY.md](SECURITY_QUALITY.md) for the full threat model and production readiness verdict.
