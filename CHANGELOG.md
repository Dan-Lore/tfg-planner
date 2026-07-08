# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).
Версионирование проекта следует [Semantic Versioning](https://semver.org/lang/ru/).

## [Unreleased]

### Fixed
- CI: циклический импорт `product-lexicon` (depcruise), knip (мёртвый `formatting.ts`, dev-скрипт `analyze-lang-misses`), унификация workflow на `npm run verify:ci`
- Dev: `pack.lang.json.gz` — Vite отдаёт сырой gzip без `Content-Encoding`; парсер принимает и сжатые, и уже распакованные байты

### Added
- **Product Lexicon (K-025):** `src/lib/product-lexicon/` — EMI-like resolve (lang keys, forge category/material, GT tier tags `#gtceu:circuits/*` / `#gtceu:batteries/*`, tag members, GT prefix/suffix); `pack.lang.json.gz` с lazy fetch + IndexedDB; `PackRuntime.getItemName` через lexicon; `npm run parser:export-lang` / `parser:recanonicalize-lang` / `parser:lang-coverage`; namespace breakdown в `build-report.json`
- `machineCount: 0` на узле машины — отключение потока без удаления узла (инспектор, колесо на карточке)
- Debounce пересчёта потоков при правках схемы: **500 ms** (было 100 ms)
- Стохастическая рекомендуемая ёмкость буфера катализатора (99% запас на 1 ч по биномиальному распределению попыток)
- Инспектор seed-ребра цикла (раздел «Расчёт»): петля, попытки производства/s, ожидаемое потребление/s, воспроизводство, режим цикла, рекомендуемая ёмкость с tooltip расчёта
- Подсказка узкого места: при загрузке машины &lt; 100% на карточке и в инспекторе — краткая причина (вход/выход + продукт) и развёрнутый tooltip
- Cycle bootstrap: замкнутые петли заводятся через главное ребро buffer→кольцо; жёлтая подсветка seed-ребра с % воспроизводства и балансом (K-023)
- `npm run debug-scheme` — CLI отладка solver по `.tfgp`
- [`docs/perf-notes.md`](docs/perf-notes.md) — baseline и оптимизации (K-022)

### Fixed
- Баланс петли (seed-ребро): потребление по тегу `#forge:…` учитывается вместе с конкретным id буфера (серная кислота в петле БХР)
- Port attach: рецепты с входом по тегу `#forge:purified_ores/…` (термоцентрифуга) предлагаются при подключении от `gtceu:purified_*_ore` (inferred-теги только в lookup, не в `flow-index.json`)
- Метрики seed-цикла катализатора: воспроизводство по соотношению попыток (≈100%), а не expected produce÷consume; ёмкость буфера не завышается при chanced-рецептах
- Баланс цикла: воспроизводство и net seed-продукта в items/s (не доля загрузки входа); буфер pass-through не дублирует машины
- Подписи потоков на рёбрах с chance: префикс `~` на стороне chanced-порта (не на карточке машины)
- Cycle bootstrap: петля заводится при `capacity: 0` у буфера катализатора (теоретический спрос, без привязки к ёмкости)
- Солвер: chanced-катализатор на входе (рений chance 1000) больше не режет машину как полный расход — БХР в цикле рения доходит до 100%, крекер ограничен только рецептом
- Cycle bootstrap: seed-ребро не фиксирует поток SCC на каждой итерации (только synthetic inflow буфера)
- Подсказка узкого места: «мало на входе» только при `maxLoad ≈ throughput`; «упор на выходе» — на порт с насыщенным машинным потребителем (не end buffer)
- Cycle check: дефицит внешнего питания (пар из ∞ start buffer) не попадает в предупреждения петли; баланс только на seed-продукте
- `Rational`: корректный знак отрицательных дробей (режим deficit в балансе циклов)
- Editor: новые машины и произвольные процессы из тулбара появляются в центре видимой области холста
- Editor: Ctrl+Z/Y/C/V не перехватываются в полях ввода (A1)
- Editor: «Добавить машину» только после явного выбора в combobox (A2)
- Legacy port ids `input_*` / `output_*` в `parsePortId` и prune edges (A3)

### Changed
- **K-026:** lang regression baseline, `mergeExistingLangReport`, unified `downloadModJars`, editor re-render on lang load, forge sheets/small_gears resolve, `generate-gtceu-tier-reps`
- **K-025 закрыт:** CI lang gate 75% overall / 81% tags (max achievable на bundle 0.12.8); smoke-теги `#forge:sulfuric_acid`, `#forge:purified_ores/chalcopyrite`, `#gtceu:circuits/mv`, `#gtceu:batteries/lv`
- Runtime: Node.js 24.18.0 LTS (CI, engines, @types/node)
- `pruneInvalidEdges`: tag index только по рецептам узлов схемы (не full pack)
- Kanban: K-005, K-009, K-012 → `blocked` (ждут спецуказания)
- Docs: актуализированы `audit-deficiencies.md`, `kanban.md`, `schema-format.md` §groups

### Removed
- **`targets`** из формата `.tfgp`, солвера и UI инспектора (режим C снят с MVP; будущее — K-024, кнопка в тулбаре)
- Orphan `energyHatchCount` из schema и i18n (K-021)
- Мёртвый `flow-result-fixtures.ts`; deprecated parser re-exports

## [0.4.1] — 2026-07-06

### Added
- `useEditorSelection().focusSelection({ nodeIds, edgeIds })` — единый API программного выделения (store + canvas)
- Regression-тесты `selection-sync.test.ts` для box-select / `setEdges` loop
- Направленное рамочное выделение: LTR → `SelectionMode.Full` (сплошная синяя рамка); RTL → `SelectionMode.Partial` (пунктирная зелёная)

### Fixed
- Editor: `Maximum update depth exceeded` при рамочном выделении узла/ребра — убрана обратная синхронизация `selectedEdgeIds` store → `flowEdges`
- Programmatic selection: сброс подсветки рёбер при добавлении узла (toolbar, port attach)

### Changed
- Docs: kanban hygiene (done-карточки в «Закрыто»); K-009 → `blocked` (ждёт спецуказания); roadmap MVP статусы; spec §3.3–3.6
- Docs: асимметричная модель выделения в `architecture.md`; K-017 закрыт

## [0.4.0] — 2026-07-06

### Added
- Editor: ЛКМ — рамка выделения; ПКМ drag — панорама; кнопка «?» с подсказками управления
- Editor: duplicate/copy-paste (Ctrl+C/V) с внутренними рёбрами; целевая скорость в inspector (режим C)
- Editor: закрепление потока на ребре (`edgeConstraints` в `.tfgp` + inspector)
- Editor: предупреждение при import/switch версии modpack (`ConfirmDialog`)
- Editor: суммарное EU/t для выделенных машин
- `ConfirmDialog` вместо `window.confirm` / `alert` для clear/import
- CLI `check-scheme`: i18n через `format-scheme-issue` (`--lang=en`)
- `sumSelectionEnergyEuPerTick` в `src/lib/selection-energy.ts`

### Changed
- Solver: edge constraints в machine-count и convergence фазах
- `buildReportFromShardedMeta`: опциональные `recipesWithEnergy` / `recipesWithChance`
- i18n: `energyHatchCount` (ru), `editor.edgeConstraint.*`, `editor.versionMismatch.*`

### Fixed
- `MachineInspector` / `TargetRateSection`: типы и `primaryOutputIndex` для machine/custom nodes

## [0.3.0] — 2026-07-03

### Added
- Scheme check: cycle analysis (SCC, product net balance, `cycle_not_running`, `catalyst_imbalance`)
- Scheme check: `target_not_output`, `disconnected_output`, `orphan_start_buffer` issue codes with i18n

### Changed
- Editor: split `EditorPage` into `EditorToolbar`, `EditorSidebar`, `PortAttachMenu`, hooks `useEditorRfGraph` / `useSchemeIssues`
- Store: `useSchemeStore` + `useFlowStore`; `useEditorStore` facade; combined persist key `tfg-editor-store`; dual persist rehydrate via `editor-hydration` (scheme slice owns `restoreForPack`)
- Canvas selection: store is sole source of truth (`mergeFlowNodes` no longer preserves RF-local `selected`; nodes use `useNodeSelected` only)
- Scheme check: removed `stalled_machine` warnings (covered by `cycle_not_running`, `disconnected_output`, etc.)
- Scheme check UX: issue list in inspector; minimap highlights selection; double-click issue pans to node (zoom unchanged)
- Node scaling: removed `parallel` from scheme node model; scale only via `machineCount`. Legacy `.tfgp` import merges `parallel` into `machineCount` on load.

### Removed
- Scheme node field `parallel` (breaking for hand-edited JSON; backward-compatible import via `normalizeNodeScaling`)

### Fixed
- Editor: dual persist rehydrate waits for scheme + flow slices (`editor-hydration`); cached flows restored in scheme `onRehydrateStorage` after F5
- Dev: `run-semgrep.mjs` adds pip Scripts dir to PATH on Windows when invoking `semgrep.exe`
- Canvas: recipe picker dropdown renders above other machine cards (`react-flow__node` z-index when menu open)
- Edge routing: obstacle avoidance for buffer + machine cards; parallel lane gap (`PARALLEL_EDGE_GAP = 4`) between edges sharing a route corridor segment (`edge-route-lanes.ts`, batch plan in canvas). Fixtures: `rebra-rhenium-loop.tfgp`, extended `benzene-distillation-lcr-gap` integration tests.
- Edge routing: overlapping source/target cards (e.g. rebra `edge_140`) route above both endpoint bodies, not only above target.
- Solver: `portInputDemandRate` applies GT chance multiplier on chanced inputs (symmetric with outputs)

## [0.2.0] — 2026-06-30

### Fixed
- Import `.tfgp`: dedupe duplicate node IDs with edge/target remapping
- Canvas: machine card width stuck at min after pack shard load — layout width cache now busts on `packDisplayEpoch` and recipe hydration
- Canvas: port labels empty on first open — recipe/edge stubs before flow tick
- Canvas: full-scheme freeze on width recompute — incremental per-`machineId` layout store + stable `rfNodes` identity; `internalsKey` no longer includes card width
- `parseTfgp`: shape validation, file size limit, import error handling
- Target rate prompt: reject NaN/non-positive input
- Flow compute race: pending queue + scheme revision guard during worker compute
- Undo restores node positions when not dragging (merge-flow-nodes)
- Canvas: React Flow #008 (edge/handle race) — `useNodesInitialized` gate, atomic nodes/edges sync, structural `updateNodeInternals` only

### Changed
- Architecture: split `flow-solver` into `flow-convergence`, `flow-machine-counts`, `flow-rates`, `flow-result-metrics`, `flow-edge-assignment` (orchestrator ~380 lines)
- Store: `flowEdgeData` derived in EditorPage; `flowsByPack` persist only `flowResult` + revision; layout width cache
- depcruise: `no-circular-lib`, `no-stores-canvas`; lib cycle fixes (`edge-geometry`, `tfgp-types`, `recipe-attach-types`)
- Canvas: controlled viewport for undo sync; `nonConverged` UI warning
- Edge inspector: rate edit → downstream target + full recalc (K-002 partial)
- `primaryOutputIndex` on machine nodes + solver backward pass
- Legacy port IDs normalized in connected-port maps
- knip exports in CI; Semgrep strict in CI (pip install)
- Architecture: `lib/ports`, `calculator/format`, `port-resolution`, `scheme-solver`, `flow-solver-types`, `flow-graph`, `flow-display-pipeline`, `tfgp-types`
- Performance: `useShallow` store selectors, FNV scheme revision hash, `nonConverged` flow flag, MiniMap hidden during drag, Vite manualChunks
- Canvas K-014: `NodeDisplayContext` / `EditorNodeActionsContext`; obstacle routing from scheme store; `FlowEdge` without per-edge `useNodes()`
- Removed legacy parser files (`enrich-energy`, `gtceu-yaml`, `load-json`, `apply-replaces`); dropped `js-yaml` dependency
- CI: `parser:validate`, Semgrep, parser typecheck via `tsconfig.parser.json`

### Backlog (unchanged scope)
- K-002 full bidirectional edge rate editing (solver pins edge flows)
- Primary output: remaining solver paths still using `out_0` heuristics in convergence metrics

### Added

- **Recipe canon:** `src/lib/recipe-canon.ts` — `recipeLogicalKey`, `normalizeRecipeCanon`, `dedupeRecipesForDisplay`, `dedupeAttachCandidates`; шаг `normalizeRecipeCanon` в `build-pack` после LCR mirror; `removedDuplicateRecipeIdsSample` в build-report.
- **Port attach index:** `recipes/flow-index.json` при сборке pack; `PackRuntime.loadFlowAttachIndex` (prod — только flow-index; dev — fallback по шардам с `console.warn`); `npm run generate-flow-index`, `npm run recanonicalize-pack`.
- **Tag matcher:** универсальный inference forge/mod тегов (`tag-rules.ts`, `tag-index.ts`) для attach по продуктам.
- CI gate: `pack-artifacts.test.ts` требует `flow-index.json` для pack `0.12.8`.
- **Agent tooling:** `.cursorignore`, scoped `.cursor/rules/`; `dependency-cruiser` + `knip` (`lint:arch`, `lint:knip`, `lint:agent`); CI verify step; [docs/agent-tooling-catalog.md](docs/agent-tooling-catalog.md); roadmap **K-013**.

### Removed

- **`dedupe-attach-candidates.ts`** — заменён на `recipe-canon`.
- Deprecated demo pack `0.12.8-sample` (replaced by inline `src/test-fixtures/minimal-pack.ts` for unit tests).
- Monolithic `public/data/packs/0.12.8/pack.json` (~40 MiB) — replaced by sharded v2 output.

### Changed

- **Pack 0.12.8:** 57 179 → **56 295** recipes после канонизации (удалены chem/LCR и alias-дубли с идентичным I/O).

### Breaking

- Recipe ids `gtceu:chemical_reactor/{suffix}@lcr` **удалены** из pack, если существует native `gtceu:large_chemical_reactor/{suffix}` с тем же I/O. Старые `.tfgp` с такими id нужно обновить вручную; alias-map не предусмотрен.

### Fixed

- **mirror-lcr:** зеркало создаётся только при отсутствии native LCR с тем же path suffix (не по полному id).
- **Recipe picker / port attach:** дубли PTFE, PVA, aromatic и др. не показываются после канонизации pack.
- **Recipe data:** server snapshot as single source of truth — removed `enrich-energy` / `enrich-chances` and auto-bootstrap from `build-pack`; GT JSON export script (I/O + `tickInputs.eu`).
- **Wiremill / GT circuit:** `circuitConfiguration` field; integrated circuit excluded from product flows; circuit-only broken bootstrap recipes dropped at build.
- **Tier picker:** hidden when recipe has no `energy`; no fake LV fallback in `allowedTiersForRecipe`.
- **Energy model:** removed erroneous `energyHatchCount` UI (amperage ≠ hatch count); parser infer uses machine kind + `nativeTier` (singleblock A≤1, multiblock prefers native tier).
- CI/Pages: edge-routing tests no longer depend on gitignored `Untitled*.tfgp`; committed fixture `benzene-distillation-lcr-gap.tfgp` + consolidated integration tests.
- **build-pack:** chanced I/O preserved via snapshot GT JSON + `sanitizeFlow` (no KubeJS enrich pass).
- **Холст:** подвисание при drag — селективная перерисовка рёбер (`FlowEdge` + `memo`), изоляция drag в `EditorCanvas`; статичная метка рецепта у машин с большим числом рецептов (теплица) во время drag.
- CI/Pages: `tsc -b` type errors blocked `npm run build` on GitHub Actions.
- CI: `check-scheme` test uses committed fixture instead of gitignored `Untitled (29).tfgp`.
- **Промежуточный буфер:** `capacity` больше не ограничивает скорость выхода; pass-through `min(вход, спрос downstream)`.
- **Буферы:** исходящий поток распределяется пропорционально спросу потребителей (tier/overclock), а не поровну между рёбрами.

### Added

- **Pack v2 (performance):** sharded layout `pack.meta.json` + `recipes/{machineId}.json`; `PackRuntime` lazy-loads recipe shards; flow solver + scheme check run in Web Worker on scheme slice only; debounced `updateFlows` (100 ms); UI shows compute state in toolbar.
- **RecipeManager v2 export:** full server snapshot via `RecipeManager` + `GTRecipeSerializer.CODEC` fallback; manifest schema v2 with `typeCounts`/`serializeStats`; strict gates for greenhouse, liquefaction, and `tfg:*` markers; 0.12.8 pack 57 179 recipes, smoke 15/15.
- **Recipe picker:** tier badge + circuit meta (`C:N`) in combobox options.
- Smoke chains: wiremill copper×8, liquefaction aromatic, greenhouse bamboo.
- Multiblock registry: `coal_liquefaction_tower`, `hydroponics_facility`.
- **K-003 (phase 1):** EnergyStack — `Recipe.energy { minVoltageTier, voltage, amperage }`, `calculator/energy.ts`, `calculator/gt-voltage.ts`.
- Node field `voltageTier`; tier picker + EU/t/duration/total EU on machine card. `Machine.nativeTier` in pack for multiblock infer.
- Kanban **K-012:** multiblock energy hatch / parallel (backlog).

### Changed

- **build-pack:** recipe source is server snapshot only; bootstrap deprecated.
- **flow-solver:** effective duration from tier OC + overclock; overclock no longer double-applied as speed factor.

### Added (earlier)

- **K-010 rev.3:** TFG-native recipe snapshot pipeline — `generate-tfg-snapshot`, `loadRecipeSnapshot`, `tools/parser/snapshots/<tag>/`.
- CLI: `npm run bootstrap-snapshot`, `--strict-snapshot` gate.
- Smoke chains: pyrolyse `log_to_charcoal_byproducts`, `distill_charcoal_byproducts`, `distill_wood_tar`.
- Тесты: `snapshot.test.ts` (67 tests total).

### Changed

- Chanced recipe outputs: optional `chance` in pack data; port labels `80% × 16× …`, expected rates prefixed with `~`.
- Удалён режим масштабирования B (`outputMultiplier` / «× выход»): параллельные машины задаются только через `machineCount`. При импорте legacy `.tfgp` множитель сворачивается в `machineCount`.
- `build-pack`: snapshot + KubeJS chance enrichment (greenhouse, chancedOutput); `recipesWithChance` in build-report.
- `manifest.json`: `snapshotSha256`, `pakkuLockSha256`.
- Pack `0.12.8`: **6727** recipes из snapshot, smoke 12/12, golden 6/6.
- `.gitignore`: `recipes.json`, `substrate-dumps/`, user `.tfgp`/`Untitled*.tfgp`, root `*.png`; `build-pack` auto-bootstraps snapshot из `pack.json`.

### Removed

- Поле `outputMultiplier` в схеме и UI; кнопка «Умножить выходы»; `multiplySelectedOutputs` в store.
- `substrate-dumps/`, `generate-gt-dump`, `gt-vanilla-substrate`, GT JAR recipe pipeline.
- Тесты симуляции: `early-gas-patch.test.ts`, `gt-vanilla-substrate.test.ts`.

### Added (ранее K-010)
- Pack `0.12.8` пересобран: **2781** рецептов (было 2436); greenhouse, рений в ароматической цепочке, pyrolyse log patches.
- CLI: `--gt-recipe-dump <dir>` для опционального GT recipe dump.
- Smoke chains: ароматика + рений, LCR mirror, pyrolyse log.

### Changed

- `0.12.8-sample` помечен deprecated в manifest; основная версия — `0.12.8`.
- Pack `0.12.8`: обновлён build-report (substrateRecipes: 4, golden 6/6).

### Added (ранее)

- **K-001:** Парсер TFG-Modern (`tools/parser/`): fetch по git tag, AST extractors KubeJS, pipeline merge, `build-report.json`, smoke/golden validation.
- Pack `0.12.8`: KubeJS-effective рецепты из тега Modpack-Modern `0.12.8`.
- CLI: `npm run build-pack -- --tag 0.12.8`, `npm run parser:validate`.

## [0.1.0] — 2026-06-17

### Added

- **v0.1.0 MVP:** React + Vite + TypeScript приложение.
- Редактор мнемосхем на React Flow: узлы-машины, связи, подписи потоков.
- Калькулятор продуктовых потоков: рациональная арифметика, `ceil(machineCount)`, двусторонний пересчёт.
- Режимы масштабирования: дублирование узлов, «Умножить выходы», целевая скорость на выходе.
- Undo/redo: Ctrl+Z, Ctrl+Y.
- Import/export `.tfgp`.
- Меню версий modpack + демо pack `0.12.8-sample` (медная линия).
- i18n: русский и английский.
- Unit-тесты калькулятора (Vitest).
- CLI `npm run parser:build` — отчёт по pack JSON.

### Known limitations (см. docs/kanban.md)

- K-003: EU/t отображается только при наличии `energy` в pack data.
- Парсер: динамические KubeJS-паттерны (`findRecipes`, `modifyResult`, нелитеральные циклы) — warnings в `build-report.json`.
- Полный каталог GT base recipes: только curated substrate + опциональный `--gt-recipe-dump` (JAR 7.x без recipe JSON).

## [0.0.0] — 2026-06-17

### Added

- Спецификация и документация проекта.

[Unreleased]: https://github.com/Dan-Lore/tfg-planner/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Dan-Lore/tfg-planner/releases/tag/v0.3.0
[0.2.0]: https://github.com/Dan-Lore/tfg-planner/releases/tag/v0.2.0
[0.1.0]: https://github.com/dan-lore/tfg-planner/releases/tag/v0.1.0
[0.0.0]: https://github.com/your-org/tfg-planner/releases/tag/v0.0.0
