# Парсер TerraFirmaGreg-Modern

Извлечение нормализованных данных (машины, рецепты, предметы, жидкости, энергия) из репозитория [Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern).

**Статус:** реализован (K-001 закрыт 2026-06-17) · доработки динамических паттернов — см. [kanban.md](kanban.md).

## Цель

На входе — тег релиза модпака (например `0.12.8`).  
На выходе — JSON-бандл `tfg-pack-data` v1 для загрузки в приложение.

## Источники данных (приоритет)

| # | Источник | Путь в репо | Что извлекаем |
|---|----------|-------------|---------------|
| 1 | KubeJS server scripts | `kubejs/server_scripts/` | Добавленные/изменённые рецепты, удаления |
| 2 | KubeJS startup | `kubejs/startup_scripts/` | Регистрация предметов, теги (если есть) |
| 3 | GregTech configs | `kubejs/`, `config/gtceu/`, `defaultconfigs/` | Базовые машины, шаблоны рецептов |
| 4 | Lock-файл | `pakku-lock.json` | Точные версии модов для трассировки |
| 5 | TFC / Create / Greate скрипты | внутри `kubejs/` | Кросс-модовые рецепты TFG |

Порядок применения: **KubeJS-effective recipes** для конкретного тега релиза (не vanilla GT). GTCEu JAR — внутренний субстрат, если есть статические JSON; иначе только подтверждённые KubeJS/datapack извлечения.

## Пайплайн сборки

```
┌─────────────────┐
│ Input: git tag  │  TerraFirmaGreg-Team/Modpack-Modern@vX.Y.Z
└────────┬────────┘
         ▼
┌─────────────────┐
│ Fetch sources   │  shallow clone / GitHub archive
└────────┬────────┘
         ▼
┌─────────────────┐
│ Mod index       │  pakku-lock.json → mod id → version
└────────┬────────┘
         ▼
┌─────────────────┐
│ Recipe extract  │  KubeJS AST / event handlers + GT defaults
└────────┬────────┘
         ▼
┌─────────────────┐
│ Normalize       │  Machine, Recipe, Item, Fluid, Energy
└────────┬────────┘
         ▼
┌─────────────────┐
│ Validate        │  schema, dangling ids, smoke recipes
└────────┬────────┘
         ▼
┌─────────────────┐
│ Output bundle   │  data/packs/<version>/pack.json (+ chunks)
└─────────────────┘
```

## Нормализованная модель

### Recipe

```typescript
interface Recipe {
  id: string;
  machineId: string;
  inputs: Flow[];   // item | fluid
  outputs: Flow[];
  durationTicks: number;
  energy?: EnergyCost;  // только если извлечено; иначе поле отсутствует
}

interface EnergyCost {
  euPerTick: number;      // рациональное число (числитель/знаменатель)
  voltageTier?: string;   // ULV, LV, MV, …
}
```

**Правило:** если энергия не извлечена парсером — ключа `energy` **нет**. Калькулятор и UI не выдумывают значение.

### Machine

```typescript
interface Machine {
  id: string;
  names: { ru: string; en: string };
  category: string;
  inputSlots: Port[];
  outputSlots: Port[];
  supportedRecipes: string[]; // recipe ids
}
```

## KubeJS — подход к парсингу

KubeJS — JavaScript в рантайме Minecraft. Для офлайн-парсера варианты:

| Подход | Плюсы | Минусы |
|--------|-------|--------|
| **Статический анализ** (AST, regex для типовых паттернов) | Без JVM, быстрый CI | Хрупкий на нестандартном JS |
| **Песочница Rhino/GraalVM** + моки `ServerEvents` | Ближе к реальности | Сложнее поддержка |
| **Гибрид** | Типовые файлы — AST; сложные — эвристики + ручной kanban | Рекомендуется для старта |

Стартуем с **гибрида**: покрываем самые частые event-паттерны TFG (`ServerEvents.recipes`, `event.recipes.gtceu`, `event.remove`, TFC-интеграции). Непокрытые файлы → запись в отчёт сборки + карточка в [kanban.md](kanban.md).

## Отчёт сборки

Каждая сборка генерирует `build-report.json`:

```json
{
  "modpackVersion": "0.12.8",
  "generatedAt": "2026-06-17T00:00:00Z",
  "stats": {
    "recipes": 4200,
    "machines": 180,
    "recipesWithEnergy": 3100,
    "recipesMissingEnergy": 1100
  },
  "warnings": [
    { "file": "kubejs/server_scripts/...", "reason": "unparsed_pattern", "kanban": "K-001" }
  ]
}
```

## Размещение в репозитории

```
tools/
  parser/           # CLI: npm run build-pack -- --tag 0.12.8
    src/
    fixtures/       # фрагменты реальных скриптов для тестов
data/
  packs/
    0.12.8/
      pack.json
      build-report.json
      manifest.json   # format, version, checksum
```

## CI (целевое)

- Триггер: вручную или webhook на новый release Modpack-Modern.
- Job: clone tag → `build-pack` → validate → commit / publish artifact.
- PR в tfg-planner: обновление `docs/versions.md`.

## Тестирование

- **Fixture tests:** известный кусок KubeJS → ожидаемый Recipe JSON.
- **Smoke set:** 20–50 эталонных цепочек TFG (медь, сталь, полимеры…) — сверка с игрой вручную на этапе калибровки.
- **Regression:** при изменении парсера diff stats в `build-report.json` не должен неожиданно падать > N%.
