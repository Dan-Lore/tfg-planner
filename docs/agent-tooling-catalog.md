# Каталог инструментов для AI-агента

> Справочник кандидатов для рабочего процесса разработки TFG Planner.  
> **Что уже включено в репозиторий** — см. [§ Статус в проекте](#статус-в-проекте).  
> Оперативные команды: [AGENTS.md](../AGENTS.md) § «Инструменты контекста».

Выбирай инструмент под задачу: **графы** — связность и границы слоёв, **контекст** — ориентирование агента, **анализ** — мёртвый код и зависимости.

---

## Статус в проекте

| Инструмент | Статус | Где в репо |
|------------|--------|------------|
| `.cursor/rules/*.mdc` | ✅ Интегрирован | `.cursor/rules/` — project, architecture, calculator, parser, tests |
| `.cursorignore` | ✅ Интегрирован | корень репо |
| `AGENTS.md` | ✅ Интегрирован | корень репо |
| `dependency-cruiser` | ✅ Интегрирован | `.dependency-cruiser.cjs`, `npm run lint:arch` |
| `knip` | ✅ Интегрирован | `knip.json`, `npm run lint:knip` |
| Cursor Codebase Indexing | ✅ Из коробки | `@codebase` в чате |
| Aider repo-map, SCIP, Repomix | 📋 Справочно | Не нужны при Cursor + scoped rules |
| vulture, deptrac, ArchUnit, CodeQL | 📋 Справочно | Другой стек (Python / JVM / enterprise) |
| Semgrep | 🔮 Roadmap (K-013) | Имеет смысл для кастомных правил «без заглушек» |

**CI:** `npm run lint:agent` в `.github/workflows/verify.yml`.

**Перед рефакторингом:** `npm run lint:agent` — calculator/parser не должны тянуть React.

---

## 1. Графы и связность кода

### dependency-cruiser (JS/TS) — ✅ в проекте

**Что делает:** граф импортов, архитектурные правила, циклы, орфаны.

**Зачем:** видеть связи **и** проверять инварианты (например, `src/calculator/` без React).

**TFG Planner:** правила `no-calculator-react`, `no-parser-react`. Циклы в canvas-слое намеренно не блокируются — типично для React-компонентов.

```bash
npm run lint:arch
```

### Aider (repo-map)

**Что делает:** tree-sitter карта репозитория, сжатый текстовый граф.

**Зачем:** скелет проекта без чтения каждого файла. Полезно в **Aider**, не в Cursor.

**TFG Planner:** дублирует `@codebase` + `.cursor/rules/` — не интегрировать.

### Sourcegraph SCIP / LSIF

**Что делает:** точный индекс cross-references.

**Зачем:** точность на больших монорепах. Избыточен для ~200 TS-файлов.

### Tree-sitter + кастомный парсер

**Что делает:** `codebase-graph.json` под задачу.

**Зачем:** полный контроль формата. Имеет смысл при CI-отчётах или внешних агентах без IDE.

### deptrac (PHP) / ArchUnit (JVM)

Аналог dependency-cruiser для PHP/JVM. **Не наш стек.**

---

## 2. Контекст и ориентирование

### `.cursor/rules/` — ✅ в проекте

**Что делает:** markdown-правила с YAML frontmatter (`globs`, `alwaysApply`, `description`).

**Зачем:** агент получает контекст **только когда релевантно** — дешевле, чем один монолитный `.cursorrules`.

| Файл | Когда |
|------|-------|
| `project.mdc` | Всегда |
| `architecture.mdc` | Рефакторинг, новые модули |
| `calculator.mdc` | `src/calculator/**` |
| `parser.mdc` | `tools/parser/**` |
| `tests.mdc` | `**/*.test.ts` |

### `.cursorignore` — ✅ в проекте

Исключает из индекса Cursor: `node_modules`, `.cache/`, pack shards, snapshots, lock-файлы.  
**Не** исключает `docs/` — документация должна индексироваться.

### `AGENTS.md` — ✅ в проекте

Единый источник для Cursor, Codex CLI и других агентов: обязательное чтение, инварианты, команды lint.

### Cursor Codebase Indexing

Встроенный семантический поиск. `@codebase` + scoped rules покрывают потребность без Repomix.

### Repomix

Пакует весь кодбейз в один файл. Избыточен при Cursor indexing; может пригодиться для **разового** аудита вне IDE.

---

## 3. Мёртвый код и анализ

### knip (JS/TS) — ✅ в проекте

**Что делает:** неиспользуемые файлы, экспорты, зависимости, дубликаты re-export.

```bash
npm run lint:knip          # files, dependencies, duplicates
npx knip                   # полный отчёт включая exports
```

**Известный backlog (не блокирует CI):** legacy `enrich-energy.ts`, `gtceu-yaml.ts`, `js-yaml` только там; duplicate exports в `recipe-id-aliases.ts` / `manifest.ts`.

### vulture (Python) / ucdetector / ReSharper

Статический поиск мёртвого кода для Python, Java, C#. **Не наш стек.**

### Semgrep — 🔮 roadmap ([K-013](kanban.md))

Кастомные правила статического анализа. Кандидат для автоматической проверки «без заглушек» (`TODO: implement`, fake UI). Пока — ручной review + kanban.

**План (K-013):** `.semgrep.yml` + CI — запрет `TODO: implement`, placeholder UI, fake data в `src/` (инвариант [AGENTS.md](../AGENTS.md)).

### CodeQL

Глубокий семантический анализ, уязвимости. Overkill для MVP; рассмотреть при публичном backend (v2).

### git log + coverage

Эмпирический критерий: файл не менялся N месяцев + 0% coverage → кандидат на удаление. Дополнение к knip, не замена.

---

## 4. Мета-инструменты

### tree-sitter

Основа repo-map и кастомных анализаторов. Парсер TFG уже использует **@babel/parser** для KubeJS — менять не требуется.

### LSP

Go-to-definition, find-references в IDE. Cursor использует неявно; отдельная интеграция не нужна.

### ctags / etags

Лёгкий индекс символов. Устаревает при наличии LSP и `@codebase`.

### OpenGrok

Поиск по миллионам строк. Не актуален для размера TFG Planner.

---

## Когда что запускать

| Задача | Действие |
|--------|----------|
| Новая фича в calculator/parser | Прочитать scoped rule + `docs/architecture.md` |
| Рефакторинг импортов | `npm run lint:arch` |
| Зачистка deps / orphan-файлов | `npm run lint:knip` или `npx knip` |
| PR / перед merge | CI уже гоняет `lint:agent` |
| Новый scoped rule | `.cursor/rules/<topic>.mdc`, `<200` строк, узкий `globs` |

---

## Roadmap (фаза 2)

> Карточка: [kanban K-013](kanban.md). Статус `backlog`, P2.

| Шаг | Зачем отложено | Критерий готовности |
|-----|----------------|---------------------|
| **Semgrep** | Нужны правила + настройка false positives | `.semgrep.yml`, CI; нет `TODO: implement` / fake UI в `src/` |
| **depcruise `no-circular`** | Сейчас 20+ циклов в canvas; calculator тянет `@/canvas/ports` и замыкает цепь через schema | `ports.ts` в `src/lib/`; depcruise проходит без waivers |
| **knip exports в CI** | ~100+ unused exports; legacy-файлы в ignore | Удалены `enrich-energy`, `gtceu-yaml`; исправлены duplicate re-exports; `lint:knip` без `--include` фильтра |

**Зависимости между шагами:** knip exports и depcruise cycles **независимы**; Semgrep можно добавить в любой момент.

---

## История

- Исходный черновик: экспорт из Qwen, 2026-06-29.
- Интеграция в репозиторий: 2026-06-29 — dependency-cruiser, knip, `.cursorignore`, scoped rules, CI.
- Roadmap фаза 2: [kanban K-013](kanban.md) — Semgrep, depcruise `no-circular`, knip exports в CI.
