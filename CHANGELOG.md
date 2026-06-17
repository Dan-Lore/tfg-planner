# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).
Версионирование проекта следует [Semantic Versioning](https://semver.org/lang/ru/).

## [Unreleased]

### Added

- **K-001:** Парсер TFG-Modern (`tools/parser/`): fetch по git tag, AST extractors KubeJS, pipeline merge, `build-report.json`, smoke/golden validation.
- Pack `0.12.8`: 2436 KubeJS-effective рецептов из тега Modpack-Modern `0.12.8`.
- CLI: `npm run build-pack -- --tag 0.12.8`, `npm run parser:validate`.

### Changed

- `0.12.8-sample` помечен deprecated в manifest; основная версия — `0.12.8`.

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
- Парсер: динамические KubeJS-паттерны (`findRecipes`, `modifyResult`, циклы) — только warnings в `build-report.json`.

## [0.0.0] — 2026-06-17

### Added

- Спецификация и документация проекта.

[Unreleased]: https://github.com/your-org/tfg-planner/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/tfg-planner/releases/tag/v0.1.0
[0.0.0]: https://github.com/your-org/tfg-planner/releases/tag/v0.0.0
