# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).
Версионирование проекта следует [Semantic Versioning](https://semver.org/lang/ru/).

## [Unreleased]

### Fixed

- **Холст:** подвисание при drag — селективная перерисовка рёбер (`FlowEdge` + `memo`), изоляция drag в `EditorCanvas`; статичная метка рецепта у машин с большим числом рецептов (теплица) во время drag.
- CI/Pages: `tsc -b` type errors blocked `npm run build` on GitHub Actions.
- CI: PR workflow now runs production build with `VITE_BASE_PATH` (same as Pages deploy).

### Added

- **K-010 rev.3:** TFG-native recipe snapshot pipeline — `generate-tfg-snapshot`, `loadRecipeSnapshot`, `tools/parser/snapshots/<tag>/`.
- CLI: `npm run bootstrap-snapshot`, `--strict-snapshot` gate.
- Smoke chains: pyrolyse `log_to_charcoal_byproducts`, `distill_charcoal_byproducts`, `distill_wood_tar`.
- Тесты: `snapshot.test.ts` (67 tests total).

### Changed

- `build-pack`: snapshot-only production path (без GT substrate / KubeJS recipe simulation).
- `manifest.json`: `snapshotSha256`, `pakkuLockSha256`.
- Pack `0.12.8`: **6727** recipes из snapshot, smoke 12/12, golden 6/6.
- `.gitignore`: `recipes.json`, `substrate-dumps/`, user `.tfgp`/`Untitled*.tfgp`, root `*.png`; `build-pack` auto-bootstraps snapshot из `pack.json`.

### Removed

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
