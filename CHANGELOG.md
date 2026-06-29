# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).
Версионирование проекта следует [Semantic Versioning](https://semver.org/lang/ru/).

## [Unreleased]

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

[Unreleased]: https://github.com/your-org/tfg-planner/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/tfg-planner/releases/tag/v0.1.0
[0.0.0]: https://github.com/your-org/tfg-planner/releases/tag/v0.0.0
