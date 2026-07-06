# Performance notes

> Baseline и точечные оптимизации (K-022). Обновлять при измеримых изменениях.

## Baseline (2026-07-06, Node 24.18, vitest 3)

| Зона | Наблюдение | Где |
|------|------------|-----|
| Unit tests (full) | ~337 tests, ~14–15 s wall | `npm test` |
| Tag index (pack 0.12.8) | ~1 s build, 5913 tags | `tag-index.pack.test.ts` |
| Edge routing integration | ~5 s (4 cases) | `edge-routing.integration.test.ts` |
| Flow index generation | ~5 s rewrite | `generate-flow-index.test.ts` |
| Flow recalc | Web Worker, stale request drop via `latestId` | `flow-compute.ts`, `flow-worker` |

## Сделано

### `pruneInvalidEdges` — scheme-scoped tag index

**Было:** при `PackData` с массивом `recipes` вызывался `buildTagIndex(pack)` (~56k рецептов).

**Стало:** всегда `buildTagIndexForRecipes` только по рецептам узлов схемы + meta tags.

**Файл:** [`src/lib/prune-edges.ts`](../src/lib/prune-edges.ts)

## Отложено

### K-014 · `onlyRenderVisibleElements`

Spike не включён: риск регрессий подписей рёбер и obstacle routing при culling узлов. Повторить на отдельной ветке с прогоном `edge-routing.integration.test.ts` и manual drag на схеме 50+ узлов.

### Canvas drag profiling

Ручной Chrome Performance на большой `.tfgp` — при появлении жалоб на jank.

## Viewport / undo

Pan/zoom **не** попадает в undo stack (`setViewport` без `pushHistory`). Undo схемы восстанавливает viewport из snapshot только если он был записан в history вместе с другим действием. См. help «Ctrl+Z (без pan/zoom)».
