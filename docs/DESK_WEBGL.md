# Desk graphics stack — WebGL + CSS + Three.js

## Layers (bottom → top)

| Layer | Tech | Role |
|-------|------|------|
| **ShaderBackdrop** | Raw WebGL (1 triangle) | Default ambient: noise, grid, scan, activity uniform |
| **CircuitThree** | Three.js Points + Line | Additive particle bus under the circuit |
| **Circuit SVG** | React + CSS keyframes | Nodes, wires, decision packets, ticker |
| **Panels** | CSS `panel-rise`, blur | Glass quant chrome |

## Why not Three.js for everything?

- Full-scene Three is heavier than needed for a research desk.
- Fragment shader backdrop is **one draw call**, low power.
- Three is reserved for the **circuit underlay** where particles/blending help.

## Activity coupling

- `ShaderBackdrop` receives `activity \in [0,1]` from journal size.
- `CircuitThree` bursts particle opacity/color on `pulseKey` (new journal rows).

## Future (optional)

- Bloom pass (EffectComposer) — only if GPU budget allows
- Instanced decision glyphs in Three when accept rate is high
- Prefer keeping **readable numbers** over spectacle

## Run

```bash
npm install
npm run stack
# hard-refresh browser
```
