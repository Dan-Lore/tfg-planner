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

## `rebra-rhenium-loop.tfgp`

**Purpose:** compact rhenium loop (5 nodes, 5 edges) — regression for obstacle routing with buffer nodes and parallel lane gap between edges that share vertical/horizontal corridors (steam feed, cracker column, Re buffer loop).

| Field | Value |
|-------|-------|
| Pack | `0.12.8` |
| Nodes | LCR `node_96`, cracker `node_30`, electrolyzer `node_131`, start buffer steam `node_60`, intermediate buffer Re `node_139` |
| Focus | no third-party card hits; `edge_140` (Re dust) must not cut through buffer `node_139` **or** source electrolyzer `node_131`; parallel gap ≥ 4 px on shared corridor segments |

Run: `npm test -- src/lib/edge-routing.integration.test.ts`
