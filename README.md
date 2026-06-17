# TFG Planner

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-lightgrey)](https://YOUR_GITHUB_USERNAME.github.io/tfg-planner/)

Веб-приложение для планирования производственных мнемосхем модпака [TerraFirmaGreg-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern).

**Демо:** после публикации репозитория сайт будет доступен по адресу  
`https://<ваш-username>.github.io/tfg-planner/`  
(имя пути совпадает с именем репозитория на GitHub).

## Быстрый старт

```bash
npm install
npm run dev
```

Откройте http://localhost:5173

1. **Версии** — выберите `0.12.8` (парсер KubeJS-effective) или `0.12.8-sample` (демо, deprecated).
2. **Редактор** — добавьте машины, соедините, задайте целевую скорость или умножьте выходы.
3. **Ctrl+Z / Ctrl+Y** — отмена и повтор.
4. Сохраните схему как `.tfgp` или загрузите с диска.

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Dev-сервер |
| `npm run build` | Production-сборка (корень `/`, для своего хостинга) |
| `npm run build:pages` | Сборка для GitHub Pages (`/tfg-planner/`, см. `.env.pages`) |
| `npm test` | Unit-тесты |
| `npm run build-pack -- --tag 0.12.8` | Сборка pack data из Modpack-Modern |
| `npm run parser:validate` | Валидация pack JSON |

## Публикация на GitHub

Репозиторий ещё не создан — ниже порядок действий.

### 1. Создать репозиторий

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create tfg-planner --public --source=. --push
```

Или создайте пустой репозиторий на GitHub и выполните:

```bash
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/tfg-planner.git
git branch -M main
git push -u origin main
```

### 2. Включить GitHub Pages

1. **Settings → Pages**
2. **Build and deployment → Source:** `GitHub Actions`
3. После push в `main` workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) соберёт проект и опубликует `dist/`.

URL сайта: `https://YOUR_GITHUB_USERNAME.github.io/tfg-planner/`

Если имя репозитория **не** `tfg-planner`, обновите `VITE_BASE_PATH` в [`.env.pages`](.env.pages) (локальная проверка) — в CI путь подставляется автоматически из `github.event.repository.name`.

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

## Статус v0.1.0

- Редактор мнемосхем (React Flow)
- Калькулятор потоков с `ceil(machineCount)`
- Import/export `.tfgp`
- i18n RU / EN
- Pack data `0.12.8` (2436 рецептов, парсер KubeJS)
- Демо `0.12.8-sample` (deprecated)
- Контекстное меню на портах (добавление машин по ПКМ)

## Лицензия

[MIT](LICENSE) — см. файл `LICENSE`.

## Ссылки

- [Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern)
- [Factorio Calculator](https://kirkmcdonald.github.io/) — вдохновение
