# CavalRe Sentinel — Data Map

**Capital posture:** VIEW · WRITE OFF · NO_GO  
**Rule:** NEVER TRUST, ALWAYS VERIFY

## Directory layout

```
journals/
├── phase0/
│   ├── phase0-base-dutchv3-*.jsonl   # live residual observation
│   └── market-note-*.{json,md}       # Phase 0 evidence summary
├── sim-base-dutch-*.jsonl            # simulate-flow accepts + offline markouts
├── dry-run-*.jsonl                   # dry-run harness
└── ml/
    ├── synthetic-residual-*.jsonl    # generated residual with ground-truth labels
    ├── features-*.csv                # tabular feature matrix
    ├── loop-coverage.json
    └── loop-walkforward.json
```

## Who writes what

| Producer | Command | Output |
|----------|---------|--------|
| Phase 0 poller | `npm run phase0` | `journals/phase0/phase0-*.jsonl` |
| Market note | `npm run phase0:note` | `journals/phase0/market-note-*.{json,md}` |
| Simulate | `npm run simulate` | `journals/sim-base-dutch-*.jsonl` |
| Sim markout | `npm run ml:sim-markout` | appends `kind:markout` into sim JSONL |
| Shadow markout (live/RPC) | `npm run shadow-markout` | appends real markouts (age-gated) |
| Synthetic + train | `npm run ml:pipeline` | `journals/ml/synthetic-*.jsonl`, `features-*.csv`, walkforward |
| Full sim loop | `npm run ml:loop` | coverage + walkforward under `journals/ml/` |
| Ingest one file | `npm run ml:ingest -- --file PATH [--train]` | coverage (+ walkforward if `--train`) |
| Ops snapshot | `npm run ops:status` | stdout only (no write) |

## Ingest path (ML)

```
any JSONL
  → scripts/ml/src/journal-adapter.js   (normalize + join markout by ref)
  → feature schema v1 (7 features)
  → labeled rows only if toxic/markout known
  → scripts/ml/src/train-baseline.js    (walk-forward logistic, if --train)
```

Phase 0 journals are **measurement**. They become training data only after policy accepts exist and markouts are attached (`shadow-markout` for live, `ml:sim-markout` for sim).

## Gates before any capital change

1. Phase 0 note verdict not `INSUFFICIENT_RUNTIME`
2. Residual density assessed (`TOO_SPARSE` / `LOW_DENSITY` / `MEASURABLE`)
3. Real residual walk-forward AUC ≥ 0.65 + calibration (sim labels do not count)
4. Soft prior remains disabled until (3)
5. Explicit human review of Go/No-Go report
