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
