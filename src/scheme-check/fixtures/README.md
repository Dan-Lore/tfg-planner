# Scheme check test fixtures

Committed `.tfgp` layouts for integration tests in `src/scheme-check/check-scheme.test.ts`.

User schemes at the repo root (`Untitled*.tfgp`, `/*.tfgp`) stay in `.gitignore` and must not be referenced from tests.

## `aromatic-chain-wiring-issues.tfgp`

**Purpose:** regression layout for `checkScheme` wiring validation on a realistic 0.12.8 aromatic chain.

| Assertion | Value |
|-----------|-------|
| Pack | `0.12.8` |
| `invalid_target_port` | `edge_85` — charcoal wired to `in_2` instead of `in_0` on liquefaction tower |
| `disconnected_input` | `node_49` — missing `gtceu:copper_dust` on `in_0` |
