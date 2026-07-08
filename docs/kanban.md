# Kanban — недоделки и мониторинг

> **Правило проекта:** в коде **нет заглушек** (`TODO`-реализаций, `return null`, fake data, `not implemented`).
> Если фича ещё не готова — её **нет в UI** или путь явно отключён, а задача живёт здесь до завершения.

Обновлять этот файл при каждом PR и при обнаружении пробела в данных/логике.

## Статусы

| Статус | Значение |
|--------|----------|
| `backlog` | Запланировано, не начато |
| `in_progress` | В работе |
| `blocked` | Ждёт решения / внешней зависимости |
| `done` | Закрыто (перенести вниз с датой) |

---

## Активные карточки

### K-026 · EMI/i18n follow-up (post K-025)

| Поле | Значение |
|------|----------|
| Статус | `in_progress` |
| Область | parser / `product-lexicon` / runtime UX |

**Описание:** pipeline snapshot→build-pack, regression gate, runtime re-render при загрузке lang, resolver-хвосты `no_tag_member`, tier representatives tooling.

**Критерий закрытия:**
- [x] `mergeExistingLangReport` + тест; `lang-baseline` + regression gate
- [x] `downloadModJars` унифицирован в lang-скриптах
- [x] `usePackLangReady` → `packDisplayEpoch` в редакторе
- [x] Forge `sheets` / `small_gears` + тесты; `FORGE_TAG_CATEGORIES` export
- [x] `generate-gtceu-tier-reps` + JSON; deprecate `analyze-lang-coverage`
- [ ] Полный `build-pack` на CI/локально со snapshot (ждёт `generate-tfg-snapshot`)
- [ ] `recipeIoTagsLocalized` ≥ 84% после resolver-итерации (опционально)

---

### K-024 · Кнопка в тулбаре: расчёт целевой скорости

| Поле | Значение |
|------|----------|
| Статус | `backlog` |
| Область | UI / solver |

**Описание:** кнопка в `EditorToolbar` на выбранном узле — ввод целевой скорости продукта → пересчёт `machineCount` по цепочке (`preserveManualMachineCounts: false`). **Без** поля `targets` в `.tfgp` и без UI в инспекторе.

**Критерий закрытия:**
- [ ] Кнопка на линейной схеме: цель → пересчёт машин и потоков
- [ ] Для SCC: поведение зафиксировано в spec (цель на внешний выход, не на петлю)
- [ ] i18n RU+EN

---

_Прочий P2 polish — см. [audit-deficiencies.md](audit-deficiencies.md)._

---

## Заблокировано / ждёт спецуказания

| ID | Вопрос | Статус |
|----|--------|--------|
| K-005 | Облако, аккаунты, публичные схемы (v2) | `blocked` — ждёт спецуказания |
| K-009 | Автообновление pack data | `blocked` — ждёт спецуказания |
| K-012 | Multiblock energy hatch / line EU/t | `blocked` — ждёт спецуказания по GT-модели |
| K-B1 | Кастомные серверные рецепты поверх версии модпака | `blocked` → [open-questions.md](open-questions.md) Q2 |
| K-B2 | Dev-ветка Modpack-Modern vs только релизы | `blocked` → Q3 |
| K-B3 | Иконки предметов — лицензия ассетов TFG | `blocked` → Q13 |

### K-005 · Облако (справка)

Roadmap v2: аккаунты, хранилище, режимы доступа. Не начинать до спецуказания по backend/хостингу. См. [roadmap.md](roadmap.md).

### K-009 · Автообновление pack (справка)

CI cron + UI manifest check. Не начинать без явного запроса. См. [roadmap.md](roadmap.md) § «Деплой и обновление данных».

### K-012 · Multiblock EU/t (справка)

Модель hatch/parallel, UI multiblock, EU/t линии. `Recipe.energy.amperage` статичен; не выводить люки из amperage. Spec §3.4.

---

## Закрыто

| ID | Закрыто | Итог |
|----|---------|------|
| K-025 | 2026-07-08 | Product Lexicon: GTCEu tier tags, forge/mod tag resolve, namespace report (`parser:lang-coverage`), CI gate 75%/81%, smoke tags; pack `0.12.8` — 75.0% overall / 81.3% tags / 78.1% ceiling |
| K-023 | 2026-07-06 | Cycle bootstrap: seed edge buffer→SCC, pinned flow, UI yellow edge, sign-off rhenium loop |
| K-018 | 2026-07-06 | Актуализация `audit-deficiencies.md` после 0.4.1 |
| K-019 | 2026-07-06 | Editor A1–A3: keyboard guard, explicit machine pick, legacy ports |
| K-020 | 2026-07-06 | Dead code: `flow-result-fixtures`, i18n, deprecated parser exports, `debug-scheme` script |
| K-021 | 2026-07-06 | Orphan `energyHatchCount` удалён; `groups` documented in schema-format |
| K-022 | 2026-07-06 | `perf-notes.md`; prune-edges scheme-scoped tag index; K-014 spike отложен |
| K-001 | 2026-06-17 | Парсер `tools/parser/`: fetch tag, pakku-lock, KubeJS AST, pipeline, pack `0.12.8` (2436 recipes), smoke/golden tests |
| K-002 | 2026-07-06 | Двусторонний расчёт продуктов; edge constraints; sign-off `rebra-rhenium-loop.tfgp` |
| K-003 | 2026-07-06 | EU/t на узле; tier picker; selection sum; multiblock hatch → K-012 (blocked) |
| K-004 | 2026-07-06 | i18n RU+EN; ConfirmDialog; CLI check-scheme `--lang` |
| K-006 | 2026-07-06 | Undo/redo; copy/paste; box-select + pan |
| K-007 | 2026-06-18 | Полнота рецептов: chanced I/O, greenhouse, LCR mirror; pack `0.12.8` → 2781 recipes |
| K-010 | 2026-06-28 | TFG-native snapshot pipeline; `build-pack --strict-snapshot` 0.12.8 |
| K-011 | 2026-07-06 | Дефицит/избыток на узлах; propagation upstream |
| K-013 | 2026-07-06 | Agent tooling фаза 2: depcruise `no-circular`, knip exports в CI, Semgrep |
| K-014 | 2026-06-30 | Canvas drag perf; edge readiness gate; revisit spike → K-022 (отложен) |
| K-015 | 2026-06-30 | Проверка циклов: `cycle-analysis.ts`; structural issue codes |
| K-016 | 2026-07-03 | `custom_machine`: динамические порты; синтетический Recipe; UI + `.tfgp` |
| K-017 | 2026-07-06 | Унификация selection: `focusSelection` API; RF-local edges; regression-тесты; v0.4.1 |
| RC-001 | 2026-06-29 | Каноническая модель рецептов; `flow-index.json`; pack 56 295 recipes |

---

## Как пользоваться

1. Новая недоделка → карточка в **Активные** со статусом `backlog`.
2. Начали код → `in_progress`; в коде только готовые куски, без заглушек.
3. Закрыли → все чекбоксы `[x]`, статус `done`, строка в **Закрыто** с датой.
4. Еженедельно (или перед релизом) — просмотр `blocked` и приоритетов P0/P1.
