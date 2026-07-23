# Research Outcomes Framework

**Use case (Daniel):** 1 ETH deposited; CavalRe Sentinel operates residual Dutch_V3 fills autonomously.  
**Current posture:** VIEW · WRITE OFF · NO_GO · soft prior disabled · Phase 0 measuring  
**Rule:** NEVER TRUST, ALWAYS VERIFY

This document defines **what the research is allowed to conclude**, **how we know**, and **how it fails** — before any capital is unlocked.

---

## 1. Target end-state (not today’s state)

| Requirement | Meaning |
|-------------|---------|
| Deposit | ~1 ETH (or stable equivalent) in a dedicated filler wallet |
| Autonomy | Poll → edge → policy → risk → fill → journal → markout without manual intervention |
| Capital safety | Hard notional caps, halt on drawdown, no model-only rejects that relax floors |
| Evidence | Real residual markouts support positive expected value after gas + adverse selection |

**Today:** none of the autonomy path is live. Research decides whether that end-state is *plausible* on Base Dutch_V3 residual.

---

## 2. Terminal research outcomes (Phase 0 → decision)

Exactly one of these must be chosen after Phase 0 has enough clock time and a formal market note.

### Outcome A — `GO_RESIDUAL_VIABLE`

**Claim:** Residual Dutch_V3 on Base is dense and selective enough to instrument a low-capital filler research path toward 1 ETH autonomy.

| Evidence required | Threshold (discipline) |
|-------------------|------------------------|
| Phase 0 runtime | ≥ 24 h continuous preferred; **minimum 2 h** before any non-null verdict |
| Order sightings | ≥ 30 distinct residual hashes (not heartbeats) |
| Orders / hour | ≥ 5 sustained (not a single spike) |
| Empty-cycle rate | < 90% at 15 s poll |
| Exclusive fraction | Documented (high exclusive share may mean unfillable residual) |
| Survival | Median lifetime and % reaching mid/late decay recorded |
| Next step | Shadow markouts on any policy accepts; only then discuss limited WRITE |

**Why we would land here:** Open Dutch_V3 flow left after pros is continuous enough that a selective policy (min edge, toxicity, notional floors) can sample without sitting idle most of the day.

---

### Outcome B — `MARGINAL_BACKGROUND_ONLY`

**Claim:** Residual exists but is too thin for 1 ETH as a *primary* strategy. Viable only as a low-attention background process or multi-venue later.

| Evidence pattern | Typical signature |
|------------------|-------------------|
| Orders / hour | ~1–5 |
| Empty-cycle rate | 90–99% |
| Sightings over 24 h | Tens, not hundreds |
| EV story | Even perfect selection may not cover ops attention vs return on 1 ETH |

**Why we would land here:** Pros clear most flow; what remains is sporadic. A 1 ETH “set and forget” bot would mostly idle; opportunity cost and operational risk dominate expected fill PnL.

**Research action:** Keep journals; do **not** expand ML surface or desk ceremony. Optionally lengthen Phase 0 window or test another chain/order type with the **same** measurement stack.

---

### Outcome C — `NO_GO_SPARSE`

**Claim:** Residual Dutch_V3 on Base is not a viable path for autonomous 1 ETH deployment in the current regime.

| Evidence pattern | Typical signature |
|------------------|-------------------|
| Orders / hour | ≪ 1–2 sustained |
| Empty-cycle rate | ≥ 99% |
| Sightings | Single digits over many hours |
| Exclusive / exotic only | Unfillable or non-economic when present |

**Why we would land here:** There is no residual market to select from. Building more policy/ML does not create flow.

**Research action:** Stop prioritizing Base Dutch_V3 residual. Archive Phase 0 note as the decision record. Redeploy measurement to another venue only with a new Phase 0 charter.

---

### Outcome D — `INCONCLUSIVE` (temporary)

**Claim:** Not enough clock or sample to choose A/B/C.

| Trigger | Action |
|---------|--------|
| Runtime < 2 h | Keep Phase 0 running |
| Runtime 2–24 h but sightings < 10 | Extend; do not invent density |
| API outages dominate | Fix observability; do not treat errors as empty market |

**Current status (2026-07-22 evening):** **D — INCONCLUSIVE**  
~0.6 h, ~3 sightings, ~99% empty cycles, verdict `INSUFFICIENT_RUNTIME`. Early *hint* leans B/C, but discipline forbids promoting that to a terminal outcome yet.

---

## 3. Path from research → “1 ETH, CavalRe does the rest”

```text
Phase 0 density verdict
    │
    ├─ C NO_GO_SPARSE ──────────────► stop Base residual thesis
    ├─ B MARGINAL ──────────────────► optional background only; no 1 ETH primary
    └─ A VIABLE
         │
         ▼
   Real accepts + shadow markouts (RPC, age-gated)
         │
         ▼
   Walk-forward on REAL labels (AUC ≥ 0.65 + calibration)
         │
         ▼
   Go/No-Go report + human review
         │
         ▼
   Phase D limited capital (≪ 1 ETH first; halt rules)
         │
         ▼
   Only after stable markouts / no halt storms → scale toward 1 ETH autonomy
```

**There is no skip.** Soft prior, desk UI, and sim AUC do not move capital.

---

## 4. How the research fails (and how often, order-of-magnitude)

Failures are stated as **research-process risks** and **deployment risks**, with rates informed by *observed* residual sparsity and sim results — not marketing.

### 4.1 Research-process failure modes

| Failure | What happens | Approx. rate / severity |
|---------|--------------|-------------------------|
| **False density** | Short window looks busy; 24 h is dead | High if concluding before ≥2–24 h |
| **False sparsity** | API errors counted as empty book | Medium without retry/backoff (mitigated in Phase 0 poller) |
| **Sim label leakage** | Train on sim markouts, enable soft prior | Certain ruin of discipline if allowed; **blocked in code** (`liveUseAllowed: false`) |
| **Ceremony over data** | More UI/ML while Phase 0 still INCONCLUSIVE | Process failure; no capital loss yet, time loss sure |
| **Feature expansion early** | Overfit 7→N features on &lt;300 real labels | High overfit risk; schema locked v1 |

### 4.2 If we ignored gates and deployed 1 ETH anyway

| Failure | Mechanism | Illustrative frequency* |
|---------|-----------|-------------------------|
| **Idle capital** | 99% empty cycles → almost no fills | Dominant regime in early Phase 0 sample |
| **Adverse selection** | Fills concentrate when edge looks good but markout toxic | Common in Dutch residual; exact rate unknown until real markouts |
| **Gas / ops drag** | Rare fills; fixed costs dominate | High when orders/hour ≪ 5 |
| **Model theater** | Soft prior on NO_SIGNAL features (sim AUC ~0.48) | Would be coin-flip noise; **disabled** |
| **Halt / inventory** | Unbounded inventory or no halt | Controlled only if Phase D limits enforced |

\*Frequencies are **hypotheses to be replaced by Phase 0 + shadow-markout counts**, not guarantees. Early data: ~1–2 residual sightings/hour and 99% empty polls → **idle capital is the leading failure mode** for a 1 ETH autonomous bot *on this venue right now*.

### 4.3 Probabilistic sketch (decision, not a promise)

After a proper ≥24 h Phase 0 (update when note is final):

| Terminal outcome | Prior belief from early sample | What would revise belief |
|------------------|-------------------------------|---------------------------|
| A VIABLE | Low | Sustained ≥5 orders/h, non-exclusive fillable size, positive markouts |
| B MARGINAL | Moderate–high | 1–5 orders/h sustained, some fillable non-exclusive |
| C NO_GO_SPARSE | Moderate | Still ≪2 orders/h after 24–72 h |
| D INCONCLUSIVE | Current | Clock &lt; 2 h or broken API |

This table is **Bayesian discipline**: early empty cycles push mass toward B/C; only sustained density moves mass to A.

---

## 5. Clarity rules (how outcomes are published)

1. **One terminal outcome** per Phase 0 campaign (A/B/C), or D with a resume time.  
2. **Numbers only** in the market note — no anecdotes.  
3. **Sim metrics labeled sim** — never mixed into live Go/No-Go numerics.  
4. **1 ETH autonomy** is a *product* claim allowed only after Phase D stability, not after a green unit test.  
5. **If outcome is C**, the successful research result is *stopping* — not building more filler features.

---

## 6. What Daniel should do with 1 ETH *today*

| Action | Allowed? |
|--------|----------|
| Deposit 1 ETH for Sentinel to trade live | **No** |
| Run Phase 0 / dry-run / simulate / ML research | **Yes** |
| Interpret early empty cycles as final NO_GO | **No** (still D) |
| Plan capital size before density verdict | **No** |

When Phase 0 closes as **A**, the next capital step is still **≪ 1 ETH** under Phase D limits, with halt rules — then scale only on real markout statistics.

---

## 7. Sign-off checklist for closing Phase 0

- [ ] Runtime ≥ 2 h (prefer ≥ 24 h)  
- [ ] `npm run phase0:note` verdict ≠ `INSUFFICIENT_RUNTIME`  
- [ ] Orders/hour, empty-cycle %, exclusive %, size buckets, survival filled  
- [ ] Explicit choice: **A / B / C** written in the note or a short ADR  
- [ ] If A: shadow-markout plan dated; if B/C: stop or re-charter venue  
- [ ] `npm run quality` still green  
- [ ] No soft-prior enablement, no WRITE flag changes  

**Research is successful when the outcome is correct — including “do not deploy.”**
