# Dependency security remediation

## Changes applied

- **Vitest 3** + **TypeScript 5.8** across workspaces
- **npm overrides**: `esbuild ^0.25.5`, `vite ^6.3.5` (closes common dev-server / toolchain advisories)
- **Desk** on Vite 6
- **@noble/hashes** / **secp256k1** bumped
- CI `dependency-gate` runs `npm audit --audit-level=high`

## Required on your machine (lockfile not in git yet)

```bash
cd /Users/daniel/Development/CavalRe-Sentinel-Base
git pull origin main
rm -rf node_modules
npm install
npm audit --audit-level=high
npm test
npm run typecheck

# If audit is clean, pin the tree for CI:
git add package-lock.json
git commit -m "chore: commit package-lock after security remediation"
git push origin main
```

If audit still reports high/critical, paste `npm audit` output and remediate remaining packages (prefer overrides over `--force`).
