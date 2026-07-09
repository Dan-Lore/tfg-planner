# Архитектура

> **Статус:** v0.3.0 · 2026-07-03

## 1. Обзор

```
┌──────────────────────────────────────────────────────────────────┐
│                         TFG Planner (SPA)                         │
├──────────┬──────────┬──────────────┬─────────────┬────────────────┤
│ Version  │  Canvas  │  Calculator  │  File I/O   │  i18n (ru/en)  │
│ Manager  │  Editor  │  (products)  │  (.tfgp)    │                │
└────┬─────┴────┬─────┴──────┬───────┴──────┬──────┴────────────────┘
     │          │            │              │
     ▼          ▼            ▼              ▼
┌─────────┐ ┌─────────┐ ┌──────────────┐ ┌─────────────┐
│ Config  │ │ Graph   │ │ Flow Solver  │ │ Schema      │
│Registry │ │ Model   │ │ + Energy*    │ │ Serializer  │
└────┬────┘ └─────────┘ └──────────────┘ └─────────────┘
     │                              * Energy — только при данных в pack
     ▼
┌──────────────────────────────────────┐
│  Pack data (tfg-pack-data v1)        │
└──────────────────────────────────────┘
     ▲
     │ tools/parser (CI / CLI)
┌────┴─────────────────────────────────┐
│  TerraFirmaGreg-Modern @ git tag     │
└──────────────────────────────────────┘
```

**Будущее (v2+):** backend API, auth, object storage для схем — см. [roadmap.md](roadmap.md). Не закладывать в MVP-код.

## 2. Модули

### 2.1. TFG Parser (`tools/parser`)

См. [parser.md](parser.md).

- Вход: git tag Modpack-Modern + recipe snapshot (`tools/parser/snapshots/<tag>/`).
- Snapshot: runtime export `RecipeManager` после полной загрузки модпака (mods + KubeJS).
- Выход: `data/packs/<version>/pack.json` + `build-report.json` + `manifest.json` (`snapshotSha256`).
- `generate-tfg-snapshot` — тяжёлый one-time export; `build-pack` — лёгкая пересборка из snapshot + lang.

### 2.2. Version Manager

- UI: отдельное меню выбора версии.
- Локальный кэш pack data (session Map + localStorage persist для схем).
- Манифест версий: `data/packs/manifest.json`.

### 2.3. Config Registry

| Сущность | Поля |
|----------|------|
| `Machine` | id, `names.{ru,en}`, слоты, recipe ids |
| `Recipe` | id, machineId, inputs, outputs, durationTicks, `energy?` |
| `Item` / `Fluid` | id, names, теги, icon ref |

`energy` — optional; отсутствует, если парсер не извлёк.

### 2.4. Canvas Editor

- Узлы: машина + рецепт + **ручные** overclock / `machineCount`.
- Рёбра: `item` | `fluid` (energy edge — когда K-003 готов).
- React Flow; drag-позиции живут в `EditorCanvas`, в store пишутся на `dragEnd`.
- **Слои данных:** static `rfNodes` (топология, scaling, callbacks через `EditorNodeActionsContext`); dynamic display (rates, load, balance) — `NodeDisplayContext` keyed by `nodeId`; flow tick не пересобирает callbacks.
- **Ширина карточек:** единая на `machineId` = max natural width в группе; инкрементальный `layout-width-store` (пересчёт только dirty-групп); `stable-rf-nodes` сохраняет identity `Node` вне изменённых групп; bust кэша по `packDisplayEpoch` и гидратации рецептов; подписи портов — `port-label-stubs` до первого flow tick.
- **Edge readiness:** `useNodesInitialized` + rAF gate перед показом рёбер; nodes/edges merge в отдельных `useLayoutEffect` (данные рёбер без store-selection sync).
- **Выделение (асимметричная модель, 2026-07-06):**
  - **Узлы:** store (`selectedNodeIds`) → `applyFlowNodeSelection` в effect; RF → store через `onSelectionChange`. Store — source of truth для inspector / EU/t sum.
  - **Рёбра:** RF владеет `selected` в `flowEdges` (`onEdgesChange`); store (`selectedEdgeIds`) — зеркало через `onSelectionChange` **без** обратной записи в effect (иначе цикл `setEdges` при рамочном выделении узла с инцидентными рёбрами).
  - **Программное выделение:** `useEditorSelection().focusSelection({ nodeIds, edgeIds })` — store + `EditorCanvasHandle.focusSelection` (рёбра на RF).
  - **Риск цикла на узлах:** `applyFlowNodeSelection` в effect — accepted; покрыт тестами `merge-flow-nodes`.
- **Маршрутизация рёбер:** obstacle rects из позиций scheme store (`scheme-obstacles.ts`); на drag — simple bezier (`skipObstacleRouting`); `FlowEdge` + `memo` без `useNodes()`. Остаточный jank — [kanban K-014](kanban.md).
- **Выделение и панорама:** `selectionOnDrag` (ЛКМ на pane — рамка); направление drag → `SelectionMode.Full` (LTR, сплошная рамка) / `SelectionMode.Partial` (RTL, пунктир); `panOnDrag={[2]}` (ПКМ drag — панорама); `multiSelectionKeyCode="Shift"`.
- **Подсказка управления:** `EditorHelpHint` — кнопка «?», popover с горячими клавишами (i18n).
- **Edge constraints:** `edgeConstraints[]` в `.tfgp` — закрепление потока на ребре (K-002).
- **Energy selection total:** сумма EU/t выделенных узлов в inspector (K-003).
- **History stack** (undo/redo): снимки графа + параметров расчёта; controlled `viewport`; Ctrl+Z / Ctrl+Y (Cmd+Z / Cmd+Shift+Z на macOS).
- **Масштабирование UI:**
  - A — clipboard duplicate (топология);
  - ручной `machineCount` в инспекторе; будущая кнопка целевой скорости — K-024.
- **Editor state:** `useSchemeStore` (топология, selection, undo/redo, persist `schemesByPack` + `activePackKey`) + `useFlowStore` (расчёт, `flowResult`, `schemeCheckResult`, persist `flowsByPack`); `useEditorStore` — facade для существующих consumers. Оба slice пишут в один ключ `tfg-editor-store` через `editor-combined-storage`. После F5: `editor-hydration` ждёт rehydrate обоих slice; восстановление cached flow — в scheme `onRehydrateStorage` (`restoreForPack`), `restore-active-pack` использует `waitForEditorHydration`.
- **Editor UI:** `EditorPage` — оркестратор; `EditorToolbar`, `EditorSidebar`, `PortAttachMenu`; хуки `useEditorRfGraph`, `useSchemeIssues`. Узлы: store → `SelectionProvider` → `useNodeSelected`; `mergeFlowNodes` не сохраняет RF-local `selected` на merge. Рёбра: см. асимметричную модель выделения выше.

### 2.5. Calculator Engine

**Модель:** пользователь владеет **топологией** (узлы на холсте); солвер балансирует **продуктовые потоки** по `machineCount`, `edgeConstraints` и cycle bootstrap.

```
         ┌─────────────────────────────────────┐
         │  User edits:                        │
         │  · machineCount on nodes            │
         │  · rate pin on edge (constraints)    │
         │  · recipe / OC / topology           │
         └─────────────────┬───────────────────┘
                           ▼
              ┌────────────────────────┐
              │  Ideal machine counts  │  rational (может быть дробным)
              └───────────┬────────────┘
                          ▼
              ┌────────────────────────┐
              │  ceil(machineCount)    │  min 1; единственная стратегия
              └───────────┬────────────┘
                          ▼
              ┌────────────────────────┐
              │  Flow Solver           │
              │  · full graph recalc     │
              │  · rational arithmetic   │
              └────────────────────────┘
                           ▼
              ┌────────────────────────┐
              │  Edge labels, counts   │
              │  Energy display*       │
              └────────────────────────┘
```

**Не делает:** автодобавление/удаление **узлов** на холсте.

**Делает:** обновление `machineCount` на узлах (B, C); полный пересчёт потоков; валидация связей и byproducts.

Модуль: `calculator/rounding.ts` — `ceilMachineCount(ideal): integer` (min 1), затем вызов flow solver.

### 2.6. Energy (фазированно)

- Подмодуль `calculator/energy.ts` — изолирован.
- Вход: узлы с `recipe.energy` + overclock.
- Если данных нет — модуль не вызывается для этого узла; UI не рендерит блок энергии.

### 2.7. i18n

- `react-i18next` (или аналог).
- Ключи UI в `locales/{ru,en}/`.
- Имена сущностей — из pack data `names`, fallback: en → id.

### 2.8. Schema Serializer

`.tfgp` — [schema-format.md](schema-format.md).

## 3. Потоки данных

### Сборка pack data (CI / dev)

```
git tag → generate-tfg-snapshot → snapshots/<ver>/
       → build-pack (lang + normalize) → validate → data/packs/<ver>/ → manifest bump
```

### Runtime

```
Version Manager → Config Registry → Editor + Calculator
User edit → Graph Model → Flow Solver → UI labels
Export → .tfgp | Import → Graph Model
```

## 4. Стек

| Слой | Выбор |
|------|-------|
| UI | React + TypeScript |
| Холст | React Flow |
| Состояние | Zustand |
| Сборка | Vite |
| i18n | react-i18next |
| Тесты | Vitest |
| Парсер | Node.js + TypeScript (AST: @babel/parser) |
| Pack artifacts | GitHub Releases или `data/packs/` в репо |

## 5. Структура кода (целевая)

```
tools/
  parser/              # CLI: build-pack, validate; src/index.ts — programmatic API
  parser-legacy/       # документация KubeJS AST (код пока в parser/src/kubejs)
src/
  shared/              # domain: ports, tag-index, flow-match, gt-voltage, product-lexicon, node-kind, primary-output
  editor-graph/        # routing/, flow-compute, machine-layout-width, scheme-obstacles, flow-display/
  editor/              # build-rf-graph, inspector/, editor hooks
  canvas/flow-display/ # re-export from editor-graph flow-display
  calculator/buffers/  # start/intermediate/end buffer solver modules
  scheme-check/        # check-scheme-structural → structural/, check-scheme-cycles
  app/bootstrap/       # restore-active-pack (entry orchestration)
  calculator/          # flow-solver, index.ts — public API
  canvas/
  data/                # pack-key, pack-persist, pack-selection, resolve-pack-entry
  schema/
  i18n/                # → src/locales/{ru,en}/translation.json
  stores/              # scheme-store (thin) + scheme-mutations, scheme-lifecycle, …
  pages/editor/        # EditorPage + useEditorConnections/Selection/Import
src/locales/
  ru/
  en/
```

## 6. Правило: без заглушек

- Нет `TODO` в рантайм-коде с псевдо-логикой.
- Незавершённая фича = нет UI + карточка в [kanban.md](kanban.md).
- Optional поля в данных — отсутствуют, а не `null` / `0` как «временно».

## 7. Backend (v2, только дизайн)

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐
│  Client  │────▶│  API        │────▶│  DB + S3     │
│  SPA     │     │  auth,      │     │  schemes,    │
└──────────┘     │  schemes    │     │  users, votes│
                 └─────────────┘     └──────────────┘
```

Сущности: `User`, `Scheme` (graph + visibility), `Rating`, `SchemeStats` (views для trending).

Реализация после MVP — не создавать пустые API routes заранее.
