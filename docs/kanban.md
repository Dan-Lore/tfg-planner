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

### K-002 · Калькулятор потоков продуктов (двусторонний)

| Поле | Значение |
|------|----------|
| Статус | `backlog` |
| Приоритет | P0 |
| Зависит от | K-001 |

**Scope:**

- [ ] Расчёт скоростей предметов/жидкостей по графу
- [ ] Триггер пересчёта при изменении целевой скорости **или** любого продуктового потока
- [ ] Режимы B/C: идеальные `machineCount` → округление → полный пересчёт
- [ ] Дробные множители и целевые скорости (рациональная арифметика)
- [ ] Округление: `ceil` в `rounding.ts` → полный пересчёт
- [ ] Byproducts и разветвление выходов

**Критерий закрытия:** unit-тесты на линейные цепочки и разветвления; согласованность потоков на всех рёбрах.

---

### K-011 · Дефицит и баланс потоков на схеме

| Поле | Значение |
|------|----------|
| Статус | `backlog` |
| Приоритет | P1 |
| Зависит от | K-002 |

**Scope:**

- [x] На узле: `−` оранжевым для неподключённого входа, `+` зелёным для избытка выхода
- [x] Единые цвета in/out на портах и карточке (светлая/тёмная тема)
- [ ] Пересчёт потребления и производства по всей схеме (дефicit/propagation upstream)

**Критерий закрытия:** дефицит на узле учитывает реальные потоки по графу, а не только «порт не подключён»; избыток согласован с суммой исходящих рёбер.

---

### K-006 · Редактор: undo/redo и масштабирование на холсте

| Поле | Значение |
|------|----------|
| Статус | `backlog` |
| Приоритет | P0 |
| Зависит от | K-002 (частично) |

**Scope:**

- [ ] Стек истории: Ctrl+Z / Ctrl+Y (Cmd+Z / Cmd+Shift+Z на macOS)
- [ ] Режим A: copy/paste / дублирование узлов и связей
- [ ] Режим C: ввод целевой скорости на выходном узле
- [ ] Undo включает операции C

**Критерий закрытия:** сценарии из spec §3.2 и §3.5 проходят вручную; undo восстанавливает состояние до масштабирования.

---

### K-003 · Энергия (EU/t) на схеме

| Поле | Значение |
|------|----------|
| Статус | `in_progress` |
| Приоритет | P1 |
| Зависит от | K-001, K-002 |

**Scope (фазы):**

- [x] `Recipe.energy` как EnergyStack (`minVoltageTier`, `voltage`, `amperage`) в pack data
- [x] Отображение EU/t, duration, total EU на узле при известных данных
- [x] Tier picker на узле (≥ min tier)
- [ ] ~~multiblock — `energyHatchCount`~~ → см. K-012
- [x] Парсер: snapshot + KubeJS enrich-energy + GTValues.VA в AST + sanitize legacy `euPerTick`
- [x] `calculator/energy.ts` + effective duration в flow-solver (overclock → duration, не EU/t)
- [ ] Суммарное потребление линии / группы

**Правило:** пока подпункт не закрыт — в UI **нет** соответствующего поля/цифры (не показывать «0 EU» или «—» как будто всё ок).

**Критерий закрытия:** энергия отображается только для рецептов с валидными данными; line/group totals; полное покрытие snapshot или явный backlog по источникам.

---

### K-012 · Multiblock energy input / parallel hatches

| Поле | Значение |
|------|----------|
| Статус | `backlog` |
| Приоритет | P2 |
| Зависит от | K-003 |

**Scope:**

- [ ] Модель energy hatch count / parallel для multiblock (не `ceil(amperage)` из pack)
- [ ] UI для настройки люков / parallel на multiblock-узлах
- [ ] Связь с суммарным EU/t линии (K-003)

**Правило:** `Recipe.energy.amperage` в pack — статичная характеристика рецепта на min tier; не выводить число люков из amperage.

**Критерий закрытия:** отдельная модель hatch/parallel согласована с GT; UI без ложной семантики «Люки ×N = amperage».

---

### K-004 · i18n (RU + EN)

| Поле | Значение |
|------|----------|
| Статус | `backlog` |
| Приоритет | P1 |

- [ ] Инфраструктура i18n (react-i18next или аналог)
- [ ] Переключатель языка в UI
- [ ] Локализация UI-строк
- [ ] Локализуемые имена предметов/машин из pack data (`name.ru`, `name.en`)

---

### K-005 · Облако, аккаунты, публичные схемы

| Поле | Значение |
|------|----------|
| Статус | `backlog` |
| Приоритет | P2 (после MVP) |
| См. также | [roadmap.md](roadmap.md) |

Не начинать до закрытия K-001…K-002 и файлового `.tfgp` round-trip.

---

### K-010 · TFG-native recipe snapshot pipeline

| Поле | Значение |
|------|----------|
| Статус | `done` |
| Приоритет | P0 |
| Закрыт | 2026-06-18 |

**Scope (rev. 3):**

- [x] `generate-tfg-snapshot`: pakku + runServer + KubeJS export → `snapshots/<tag>/`
- [x] `loadRecipeSnapshot()` — flat RecipeOp + GT 7.5 JSON adapters
- [x] `build-pack`: snapshot → lang → normalize (без substrate/KubeJS simulation)
- [x] `snapshot-manifest.json` + pack `manifest.json` с `snapshotSha256`
- [x] Удалены `substrate-dumps`, `generate-gt-dump`, `gt-vanilla-substrate`, GT JAR pipeline
- [x] Smoke: aromatic chain + pyrolyse + distillation markers; `--strict-snapshot`
- [x] Pack `0.12.8`: **6727** recipes из bootstrap snapshot, smoke 12/12, golden 6/6

**Метрики:** `snapshotRecipes: 6727`, `snapshotManifestOk: true`, warnings 1 (lang coverage).

**Следующий шаг для 100% in-game:** заменить bootstrap snapshot на `npm run generate-tfg-snapshot -- 0.12.8` (CI K-009).

---

### K-009 · Автообновление pack data и мониторинг версий модпака

| Поле | Значение |
|------|----------|
| Статус | `backlog` |
| Приоритет | P2 |
| Зависит от | K-001 (парсер), деплой на GitHub Pages |
| См. также | [roadmap.md](roadmap.md) § «Деплой и обновление данных» |

**Контекст:** GitHub Pages — только статика (HTML/JS/CSS). Сайт **не может** сам запускать `build-pack`, Java datagen или клонировать Modpack-Modern. Рецепты обновляются **вне** Pages: dev или CI → commit `pack.json` → push → redeploy.

**Рекомендуемая модель (MVP):** `generate-tfg-snapshot` для нового тега → commit `snapshots/<tag>/` + `npm run build-pack` → commit `pack.json` → Pages.

**Scope (фазы):**

- [ ] **CI (scheduled):** workflow по cron / `workflow_dispatch` — проверка нового тега [Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern), `build-pack`, commit или PR с обновлённым pack + `build-report.json`
- [ ] **CI:** кэш `snapshots/<tag>/` и modpack archive между прогонами (укладываться в лимиты Actions)
- [ ] **UI (лёгкий):** периодическая проверка `manifest.json` / `checksum` (например при открытии вкладки или раз в сутки) — уведомление «доступна новая версия данных», без пересборки в браузере
- [ ] **Документация:** `docs/versions.md` — кто и когда пересобирает pack при новом релизе TFG

**Вне scope (не делать на Pages):**

- Парсинг KubeJS / скачивание модпака в браузере (сотни MB трафика, минуты CPU/RAM у пользователя).
- Фоновый «живой» rebuild рецептов на клиенте.

**Критерий закрытия:** при публикации нового тега TFG maintainer получает автоматический PR или issue; после merge пользователь на Pages видит новую версию в меню или toast о свежем `checksum`; деплой не требует Java на машине пользователя.

---

### K-011 · Холст: остаточные подвисания при drag

| Поле | Значение |
|------|----------|
| Статус | `backlog` |
| Приоритет | P2 |
| Зависит от | — |
| См. также | [architecture.md](architecture.md) §2.4 |

**Контекст (2026-06-20):** drag ускорен — состояние drag в `EditorCanvas`; несвязанные рёбра не перерисовываются (`FlowEdge` + `memo`); у машин с сотнями рецептов (теплица) во время drag статичная метка рецепта вместо `RecipePicker`. На больших схемах при резком drag возможны **лёгкие** подвисания.

**Scope (отложено):**

- [ ] Профилирование оставшегося jank: `EditorCanvas` re-render на каждый кадр controlled nodes, MiniMap, `animated` edges
- [ ] Снижение частоты sync позиций во время drag (internal RF store до `dragEnd`)
- [ ] `onlyRenderVisibleElements` / отключение MiniMap на время drag

**Критерий закрытия:** резкий drag одной машины на схеме ~20 узлов / ~20 рёбер (см. user `.tfgp`) без заметных фризов на типичном dev-машине; метрики не хуже ~N рендеров рёбер на кадр (N = число инцидентных рёбер узла, не все рёбра схемы).

---

## Заблокировано / ждёт решения

| ID | Вопрос | Статус |
|----|--------|--------|
| K-B1 | Кастомные серверные рецепты поверх версии модпака | `blocked` → [open-questions.md](open-questions.md) Q2 |
| K-B2 | Dev-ветка Modpack-Modern vs только релизы | `blocked` → Q3 |
| K-B3 | Иконки предметов — лицензия ассетов TFG | `blocked` → Q13 |

---

## Закрыто

| ID | Закрыто | Итог |
|----|---------|------|
| K-001 | 2026-06-17 | Парсер `tools/parser/`: fetch tag, pakku-lock, KubeJS AST, pipeline, pack `0.12.8` (2436 recipes), smoke/golden tests |
| K-007 | 2026-06-18 | Полнота рецептов: chanced I/O, `global.modifyRecipe`, greenhouse helpers, GT vanilla substrate, LCR mirror; pack `0.12.8` → 2781 recipes, smoke 9/9 |

---

## Как пользоваться

1. Новая недоделка → карточка в **Активные** со статусом `backlog`.
2. Начали код → `in_progress`; в коде только готовые куски, без заглушек.
3. Закрыли → все чекбоксы `[x]`, статус `done`, строка в **Закрыто** с датой.
4. Еженедельно (или перед релизом) — просмотр `blocked` и приоритетов P0/P1.
