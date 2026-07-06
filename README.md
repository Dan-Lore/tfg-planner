# TFG Planner

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-lightgrey)](https://dan-lore.github.io/tfg-planner/)

Веб-приложение для планирования производственных мнемосхем модпака [TerraFirmaGreg-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern).

**Демо:** [https://dan-lore.github.io/tfg-planner/](https://dan-lore.github.io/tfg-planner/)

## Быстрый старт

**Node.js** ≥ 24.18.0 (LTS). Рекомендуется `nvm use` при наличии `.nvmrc`.

```bash
npm install
npm run dev
```

Откройте http://localhost:5173

1. **Версии** — выберите `0.12.8` (server snapshot, ~56k рецептов, sharded pack).
2. **Редактор** — добавьте машины, соедините, задайте целевую скорость на выходе.
3. **Ctrl+Z / Ctrl+Y** — отмена и повтор.
4. Сохраните схему как `.tfgp` или загрузите с диска.

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Dev-сервер |
| `npm run build` | Production-сборка (корень `/`, для своего хостинга) |
| `npm run build:pages` | Сборка для GitHub Pages (`/tfg-planner/`, см. `.env.pages`) |
| `npm test` | Unit-тесты |
| `npm run verify:ci` | Полный прогон как в CI (перед push / релизом) |
| `npm run lint:agent` | Архитектура, knip, Semgrep |
| `npm run build-pack -- --tag 0.12.8` | Сборка pack data из server snapshot (см. ниже) |
| `npm run parser:validate` | Валидация pack JSON |

## Публикация на GitHub Pages

Репозиторий: [github.com/Dan-Lore/tfg-planner](https://github.com/Dan-Lore/tfg-planner)

### Включить деплой (обязательно)

1. **Settings → Pages**
2. **Build and deployment → Source:** выберите **GitHub Actions** (не «Deploy from a branch»)
3. Push в `main` или `master` — workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) соберёт `dist/` и опубликует сайт.

> **Белый экран?** Если в Source выбрана ветка `master` / корень репозитория, GitHub отдаёт исходники (`/src/main.tsx`), а не сборку. Переключите Source на **GitHub Actions** и дождитесь зелёного workflow в **Actions**.

URL: `https://dan-lore.github.io/tfg-planner/`

Если имя репозитория другое — обновите `VITE_BASE_PATH` в [`.env.pages`](.env.pages); в CI путь берётся из `github.event.repository.name`.

### 3. Локальная проверка сборки для Pages

```bash
npm run build:pages
npm run preview
```

Откройте URL из вывода `vite preview` (с учётом base path).

## Документация

| Документ | Назначение |
|----------|------------|
| [docs/README.md](docs/README.md) | Оглавление |
| [docs/specification.md](docs/specification.md) | Спецификация |
| [docs/kanban.md](docs/kanban.md) | Недоделки |
| [CHANGELOG.md](CHANGELOG.md) | История версий |

## Статус v0.3.0

- Редактор мнемосхем (React Flow) с оптимизированным drag (K-014)
- Калькулятор потоков с `ceil(machineCount)` в Web Worker
- Import/export `.tfgp` с валидацией и dedupe node IDs
- i18n RU / EN
- Pack data `0.12.8` (~56k рецептов, sharded v2, server snapshot pipeline)
- Scheme check (cycles, wiring issues), `custom_machine` nodes

## Пересборка pack data (maintainer)

**В репозитории (git):** `public/data/packs/<tag>/` — sharded pack (`pack.meta.json`, `recipes/*.json`, `flow-index.json`).

**Не в git:** `tools/parser/snapshots/<tag>/recipes.json` — тяжёлый export из игры (~4 MB+). Генерируется локально:

```bash
npm run generate-tfg-snapshot -- 0.12.8   # JDK 21+, ~45–90 мин первый раз
npm run build-pack -- --tag 0.12.8 --strict-snapshot
```

Подробности: [tools/parser/snapshots/README.md](tools/parser/snapshots/README.md), [docs/parser.md](docs/parser.md).
- Контекстное меню на портах (добавление машин по ПКМ)
- CI: typecheck, tests, `lint:agent` (depcruise, knip, Semgrep), `parser:validate`

## Лицензия

[MIT](LICENSE) — см. файл `LICENSE`.

## Ссылки

- [Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern)
- [Factorio Calculator](https://kirkmcdonald.github.io/) — вдохновение
