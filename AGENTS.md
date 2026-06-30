# AGENTS.md — инструкции для AI-разработчика

## Проект

**TFG Planner** — веб-планировщик производственных мнемосхем для [TerraFirmaGreg-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern).

## Обязательное чтение перед работой

1. [docs/specification.md](docs/specification.md)
2. [docs/architecture.md](docs/architecture.md)
3. [docs/kanban.md](docs/kanban.md) — **активные недоделки**
4. [docs/parser.md](docs/parser.md) — при работе с данными
5. [docs/open-questions.md](docs/open-questions.md)
6. [CHANGELOG.md](CHANGELOG.md)

## Критическое правило: без заглушек

- **Запрещено:** fake data, `return 0`, placeholder UI, `// TODO: implement`, нерабочие кнопки.
- **Разрешено:** не показывать фичу, пока она не готова.
- **Незавершённое** → карточка в [docs/kanban.md](docs/kanban.md) с чеклистом и критерием закрытия.
- Optional в данных = поле **отсутствует**, не `null` и не ноль.

## Ключевые решения продукта

| Тема | Решение |
|------|---------|
| Данные | Парсер Modpack-Modern → `tools/parser`; **не использовать vanilla GT dumps** |
| Расчёт | Двусторонний по **продуктам**; `machineCount` = **ceil** + пересчёт в B/C |
| Энергия | Поэтапно (K-003); только реальные данные из pack |
| Языки | RU + EN |
| Облако / рейтинги | Только [roadmap.md](docs/roadmap.md), не в MVP |

## Принципы разработки

- Живая спецификация: хотелки → spec → kanban → код → CHANGELOG.
- **Общение с пользователем — на русском** (ответы, пояснения, статусы).
- `calculator/` и `tools/parser/` — без зависимости от React; тесты обязательны.
- Версионность: схема и расчёт привязаны к `modpack.version`.
- Референс: [Factorio Calculator](https://kirkmcdonald.github.io/) — граф и точность, не автомашины.

## Стек

React + TypeScript + Vite + React Flow + Zustand + react-i18next.

## Коммиты

Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`

## Не делать без запроса

- Пуш, деплой, backend для облака (до фазы v2)
- Заглушки «на потом»
- Автоподбор количества машин

## Обновление документации

При фиче: `specification.md` + `kanban.md` (закрыть карточку) + `CHANGELOG.md`.  
При новой версии pack data: `docs/versions.md`.

## Инструменты контекста для агента

| Инструмент | Назначение | Команда |
|------------|------------|---------|
| `.cursor/rules/*.mdc` | Scoped-правила (architecture, calculator, parser, tests) | авто по globs |
| `.cursorignore` | Исключения из индекса Cursor (pack shards, `.cache`, lock) | — |
| `dependency-cruiser` | Граф импортов, циклы, calculator/parser без React | `npm run lint:arch` |
| `knip` | Неиспользуемые файлы и зависимости | `npm run lint:knip` |
| `verify:ci` | Полный прогон как в CI (перед push / tag) | `npm run verify:ci` |
| `AGENTS.md` + `docs/architecture.md` | Точки входа и границы модулей | читать перед задачей |
| [docs/agent-tooling-catalog.md](docs/agent-tooling-catalog.md) | Полный справочник инструментов + статус интеграции | при выборе tooling |

Перед рефакторингом: `npm run lint:agent`. Перед **push или git tag**: `npm run verify:ci` (typecheck, test, lint:agent, parser:validate, build + Pages). Не добавлять React-импорты в `src/calculator/` и `tools/parser/`.

**Roadmap tooling (фаза 2):** [kanban K-013](docs/kanban.md) — Semgrep, depcruise `no-circular`, полный knip в CI.
