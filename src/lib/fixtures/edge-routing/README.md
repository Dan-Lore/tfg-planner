# Edge routing test fixtures

Committed `.tfgp` layouts for integration tests in `src/lib/edge-routing.integration.test.ts`.

User schemes at the repo root (`Untitled*.tfgp`, `/*.tfgp`) stay in `.gitignore` and must not be referenced from tests.

## `benzene-distillation-lcr-gap.tfgp`

**Purpose:** regression layout for obstacle routing when a link must pass through the vertical gap between two stacked machine cards.

| Field | Value |
|-------|-------|
| Pack | `0.12.8` |
| Focus edge | `edge_46` — fluid `gtceu:benzene` from `node_37` → `node_44` |
| Source node | `node_37` — `gtceu:distillation_tower` / `gtceu:distill_wood_tar` |
| Target node | `node_44` — `gtceu:large_chemical_reactor` / `tfg:aromatic_feedstock@lcr` |

The distillation tower sits **below** the large chemical reactor on the canvas. A straight bezier from the benzene output port would cut through the reactor card body. The router must place a horizontal lane in the gap between the two rectangles.

The file also contains the full aromatic chain (pyrolyse → charcoal → wood tar → benzene → LCR) so tests can assert that **no** edge on a realistic ~12-node graph crosses a third-party card.

### Updating the fixture

1. Reproduce the layout in the editor (or tweak positions until `edge_46` routes through the gap).
2. Export `.tfgp`, copy into this folder as `benzene-distillation-lcr-gap.tfgp`.
3. Set `meta.name` / `meta.description` as in the committed file.
4. Run `npm test -- src/lib/edge-routing.integration.test.ts`.

Do not rename the file without updating the test constant `BENZENE_GAP_FIXTURE`.
