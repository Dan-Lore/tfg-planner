# Аудит недостатков TFG Planner

> **Дата:** 2026-07-06  
> **Статус:** актуализирован после v0.4.1 и спринта качества кода (K-018)  
> **Метод:** статический анализ, `npm test`, `npm run lint:knip`

Только подтверждённые проблемы. Kanban: [kanban.md](kanban.md) K-018…K-022.

---

## Закрыто (критические и высокие)

| # | Тема | Закрыто |
|---|------|---------|
| 1 | Import dedupe node IDs + edge remap | `dedupeSchemeTopology` |
| 2 | Валидация `.tfgp` | `assertTfgpShape`, `readTfgpFile` |
| 3 | NaN в target rate | `parsePositiveRate` |
| 4 | Undo позиций узлов | `mergeFlowNodes` + drag guard |
| 6 | Двусторонний расчёт | `edgeConstraints` + solver (K-002) |
| 11 | Backward pass только `outputs[0]` | `primaryOutputIndex` |
| 14–15 | Duplicate без рёбер / нет clipboard | `cloneSchemeFragment`, copy/paste |
| 18 | Import без warning версии modpack | `ConfirmDialog` + `version-mismatch` |
| 20 | Orphan `energyHatchCount` | Удалено из schema/i18n (K-021) |

---

## Открыто — P1 (K-019)

| ID | Недостаток | Файлы | Статус |
|----|------------|-------|--------|
| A1 | Ctrl+Z/Y/C/V в полях ввода | `EditorToolbar.tsx` | **исправлено** |
| A2 | Add machine без явного выбора | `search-combobox.ts`, `EditorToolbar.tsx` | **исправлено** |
| A3 | Legacy `input_*` / `output_*` в prune | `lib/ports.ts` `parsePortId` | **исправлено** |

---

## Открыто — P1 (viewport, K-019 / help)

| ID | Недостаток | Решение |
|----|------------|---------|
| A4 | Pan/zoom не в undo stack | **By design:** `setViewport` без `pushHistory`; задокументировано в help |
| A5 | Viewport при undo схемы | Controlled `viewport` + `useLayoutEffect` в `EditorCanvas.tsx` — синхронизация из store |

---

## Открыто — P2 (polish / backlog)

| Тема | Где |
|------|-----|
| `groups` в `.tfgp` без UI редактора | `schema-format.md` — persist only |
| Self-connection / multi-edge input | `isValidConnection`, scheme-check |
| Один рецепт не на карточке | `MachineNode.tsx` |
| Responsive sidebar | `layout.css` |
| i18n/a11y sidebar | `VersionSidebar.tsx`, inspector labels |
| Canvas drag jank | K-022 / K-014 spike `onlyRenderVisibleElements` |
| ~0.3% рецептов без energy | data gap в `build-report.json`, не UI |

---

## Заблокировано (не дефект — ждёт спецуказания)

K-005 (облако), K-009 (auto pack), K-012 (multiblock EU/t), K-B1…K-B3 — см. [kanban.md](kanban.md).

---

## Приоритеты

1. **P1 закрыт** в рамках K-019 (A1–A3, viewport policy).
2. **P2** — по мере спринтов; perf — [perf-notes.md](perf-notes.md).
3. Продуктовые фичи — только после разблокировки blocked-карточек.
