# Low-Capital Dutch Strategy — Game Theory & Design

TRUST: [Uniswap/UniswapX](https://github.com/Uniswap/UniswapX) (`DutchDecayLib`, reactors), [CavalRe/cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) (Float/accounting), DefiLlama.

Goal: a **better Base-native Sentinel** than the NEAR-oriented original — with **hard low-capital constraints** (~$1k) and a path to a small learning model (SLM) for toxicity, not a large LLM.

---

## 1. Auction mechanics (from UniswapX source)

Linear decay (`DutchDecayLib`):

- **DutchOutput**: `startAmount >= endAmount` — output to swapper **falls** over time  
  → as time passes, swapper gets less → **better for filler**
- **DutchInput**: `startAmount <= endAmount` — input from swapper **rises** over time  
  → filler receives more input for same output → **better for filler**
- Before `decayStartTime`: start amounts  
- After `decayEndTime`: end amounts  
- Between: linear interpolation

Equilibrium story: fillers race to fill **as soon as** the decaying price clears their cost of liquidity. Waiting longer improves price but raises chance another filler takes it.

---

## 2. Game theory — who wins what

| Player | Strength | Weakness |
|--------|----------|----------|
| Pro MM / searcher | Latency, inventory, private flow, multi-venue | Ignores dust; capacity limits; risk limits |
| AMM-routing filler | Low inventory need | Gas + pool impact; thin on exotic pairs |
| **Us ($1k)** | Selectivity, journal, toxicity discipline, small-size niche | Latency, capital, no exclusive flow |

### Payoff structure (simplified)

Let:
- `P_decay(t)` = executable price at time t (filler edge vs fair increases in t)
- `C` = cost to source (AMM out + gas + inventory risk)
- `A` = expected adverse selection (toxic flow)
- `π(t) = P_decay(t) - C - A`

Rational filler fills at first t where `π(t) > 0` **and** win probability justifies it.

**Small capital cannot win the pure speed race** on easy, large, low-toxicity orders. Pros take those at early t.

### Where $1k can win

1. **Size band** below pro minimums but above gas floor (~$50–$80 on Base; verify empirically).
2. **Decay tail** — after pros pass; higher edge, higher toxicity → only with strong filter.
3. **Inventory-light fills** — route to Uniswap v3/v4 in same tx (direct fill or callback executor); capital ≈ gas + transient inventory, not full notional warehouse.
4. **Selectivity** — most orders: no. Journal every no.
5. **Pairs** with less searcher density (still liquid enough to exit).

### Where we lose (avoid)

- Exclusive windows we are not exclusive for  
- Head-of-curve races vs colocation  
- Large notionals vs $1k equity  
- Unfiltered tail fills (toxic dump)  
- Anything requiring multi-chain inventory

---

## 3. Low-capital operating rules (encoded in policy)

```
max_position   ≤ 8% of equity          # RiskEngine
max_daily_loss ≤ 2% of equity
min_notional   ≥ gas_viability floor   # e.g. $50–100 USDC-eq
prefer inventory_light = true
require_edge_bps >= min_edge_bps       # after cost model
require P(toxic) < toxic_threshold     # SLM or heuristic
never live without dry-run journal prior
```

Compounding: only net positive, post-markout expectancy increases equity; RiskEngine tightens in small-capital regime.

---

## 4. Decision pipeline (better Sentinel)

```
Poll UniswapX (Base)
  → parse (fail-closed, Amount)
  → resolve Dutch amounts at now          # DutchDecay
  → cost model (AMM quote + gas)          # edge vs C
  → toxicity score (heuristic → SLM)      # A
  → RiskEngine size / halt gates
  → FillPolicy: accept | reject | wait
  → Journal (every branch)
  → dry-run: stop
  → live (later): Reactor.execute direct fill
```

`wait` = order not yet profitable; re-evaluate next poll (Dutch may improve).

---

## 5. SLM design (only if/when data supports it)

**Not** a large LLM. A **small** specialized model:

| Item | Choice |
|------|--------|
| Target | P(toxic ∣ features) or E[markout_bps ∣ features] |
| Labels | Journal markouts (fill vs mark at +30s/+2m/+5m) |
| Features | pair, notional, decay_progress, edge_bps vs AMM, hour, recent pair markout EMA, exclusive flag |
| Model | Start: logistic / gradient boosting on tabular features. Upgrade to tiny MLP only if calibrated gain is real. |
| Train gate | N≥ labeled markouts with stable base rate; walk-forward validation |
| Serve | Offline batch score in dry-run; same Amount-safe feature pipeline |

Until labels exist: **heuristic toxicity**

- Large discount to AMM mid at open → suspicious  
- Decay progress > 80% and still open → elevated toxic prior  
- Pair with recent negative markout EMA → raise threshold  

Data flywheel:

```
dry-run harness → journals
  → (optional simulated markout vs reference price)
  → feature store
  → train SLM
  → FillPolicy.toxicity_score
  → better rejects → better live expectancy
```

---

## 6. Why this is a better Base Sentinel

| Original Sentinel bias | Base redesign |
|------------------------|---------------|
| NEAR intents + KYC gate | Permissionless UniswapX |
| Broad multi-venue ambition early | Single-chain, low-capital focus |
| AI narrative first | Journal + toxicity data first, SLM second |
| Float discipline partial | Amount/FloatLib discipline from commit 1 |
| Complex cross-bridge | Explicitly deferred |

---

## 7. TDD implementation order

1. **DutchDecay** — pure functions mirroring `DutchDecayLib` (Amount in/out)  
2. **EdgeModel** — edge_bps given resolved amounts vs reference cost  
3. **ToxicityHeuristic** — score in [0,1] from features  
4. **FillPolicy** — combine edge, toxicity, RiskEngine → accept/reject/wait  
5. Wire into `runCycle`  
6. Harness emits features for future SLM  
7. Only after multi-day journals: train SLM, shadow mode, then gate

Every step: tests first, Amount only, fail-closed.

---

## 8. Success metrics (low capital)

- Survival: no RiskEngine halt from policy bugs  
- Journal completeness: every order → decision  
- Selectivity: high reject rate OK  
- Shadow edge: accepted dry-run orders show non-negative simulated markout distribution over weeks  
- Live (phase 1): tiny size, expectancy ≥ 0 after gas over 30+ fills

**Capital safety > win rate. Win rate on toxic flow is a loss.**
