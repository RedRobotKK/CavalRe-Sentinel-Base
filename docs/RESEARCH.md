# Research Playbook — CavalRe Sentinel Base

**Posture:** VIEW · WRITE OFF · NO_GO · soft prior disabled  
**Rule:** NEVER TRUST, ALWAYS VERIFY

## Daily loop

```bash
# Terminal A — leave running
npm run phase0

# Terminal B — check anytime
npm run ops:status
npm run phase0:note
npm run phase0:csv
```

After ≥2 hours of Phase 0, read the market note verdict before any other work.

## Data locations

| Data | Path |
|------|------|
| Live residual JSONL | `journals/phase0/phase0-*.jsonl` |
| Market note | `journals/phase0/market-note-*.{json,md}` |
| Residual CSV | `journals/phase0/residual-seen.csv`, `residual-gone.csv` |
| Sim journals | `journals/sim-base-dutch-*.jsonl` |
| ML reports | `journals/ml/` |

Full map: `docs/DATA_MAP.md`

## ML (advisory only)

```bash
npm run ml:test
npm run ml:pipeline
npm run ml:loop -- --no-simulate
npm run ml:ingest-all
npm run ml:ingest-all -- --train
```

Soft prior stays disabled until **real** residual walk-forward AUC ≥ 0.65 + calibration.

## Capital gates (all required)

1. Phase 0 note not `INSUFFICIENT_RUNTIME`
2. Density assessed (`TOO_SPARSE` / `LOW_DENSITY` / `MEASURABLE`)
3. Real markouts on policy accepts (not sim-only labels)
4. Walk-forward AUC ≥ 0.65 on real residual
5. Explicit Go/No-Go human review

Until then: no WRITE, no live capital, no soft-prior enablement.
