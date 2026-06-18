# Архитектура

> **Статус:** v0.2 · 2026-06-17

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
- Локальный кэш pack data (IndexedDB).
- Манифест версий: `data/packs/manifest.json`.

### 2.3. Config Registry

| Сущность | Поля |
|----------|------|
| `Machine` | id, `names.{ru,en}`, слоты, recipe ids |
| `Recipe` | id, machineId, inputs, outputs, durationTicks, `energy?` |
| `Item` / `Fluid` | id, names, теги, icon ref |

`energy` — optional; отсутствует, если парсер не извлёк.

### 2.4. Canvas Editor

- Узлы: машина + рецепт + **ручные** overclock / parallel.
- Рёбра: `item` | `fluid` (energy edge — когда K-003 готов).
- React Flow.
- **History stack** (undo/redo): снимки графа + параметров расчёта; Ctrl+Z / Ctrl+Y (Cmd+Z / Cmd+Shift+Z на macOS).
- **Масштабирование UI:**
  - A — clipboard duplicate (топология);
  - B — `outputMultiplier` на выделенных узлах + кнопка «Умножить выходы»;
  - C — панель целевой скорости на выходном узле / в `targets`.

### 2.5. Calculator Engine

**Модель:** пользователь владеет **топологией** (узлы на холсте); солвер балансирует **продуктовые потоки** и в режимах B/C обновляет **`machineCount`** на существующих узлах.

```
         ┌─────────────────────────────────────┐
         │  User edits:                        │
         │  · target rate (mode C)             │
         │  · output scale (mode B, rational)  │
         │  · rate on any edge                 │
         │  · recipe / OC / parallel / count   │
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
  parser/              # K-001
src/
  app/                 # роутинг, layout, меню версий
  canvas/
  calculator/
    flow-solver.ts
    rounding.ts          # ceil(machineCount), min 1
    energy.ts            # K-003, изолирован
  data/
  schema/
  i18n/
  shared/
data/
  packs/
locales/
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
