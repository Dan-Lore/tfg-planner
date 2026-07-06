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

### K-005 · Облако, аккаунты, публичные схемы

| Поле | Значение |
|------|----------|
| Статус | `backlog` |
| Приоритет | P2 (после MVP) |
| См. также | [roadmap.md](roadmap.md) |

Не начинать до закрытия K-001…K-002 и файлового `.tfgp` round-trip.

---

### K-009 · Автообновление pack data и мониторинг версий модпака

| Поле | Значение |
|------|----------|
| Статус | `blocked` |
| Приоритет | P2 |
| Зависит от | K-001 (парсер), деплой на GitHub Pages |
| См. также | [roadmap.md](roadmap.md) § «Деплой и обновление данных» |

**Ждёт спецуказания заказчика — не начинать без явного запроса.**

**Контекст:** GitHub Pages — только статика (HTML/JS/CSS). Сайт **не может** сам запускать `build-pack`, Java datagen или клонировать Modpack-Modern. Рецепты обновляются **вне** Pages: dev или CI → commit `pack.json` → push → redeploy.

**Рекомендуемая модель (MVP):** `generate-tfg-snapshot` для нового тега → commit `snapshots/<tag>/` + `npm run build-pack` → commit `pack.json` → Pages.

**Scope (фазы):**

- [ ] **CI (scheduled):** workflow по cron / `workflow_dispatch` — проверка нового тега [Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern), `build-pack`, commit или PR с обновлённым pack + `build-report.json`
- [ ] **CI:** кэш `snapshots/<tag>/` и modpack archive между прогонами (укладываться в лимиты Actions)
- [ ] **UI (лёгкий):** периодическая проверка `manifest.json` / `checksum` (например при открытии вкладки или раз в сутки) — уведомление «доступна новая версия данных», без пересборки в браузере
- [ ] **Документация:** `docs/versions.md` — кто и когда пересобирает pack при новом релизе TFG

**Вне scope (не делать на Pages):**

- Парсинг KubeJS / скачивание modpackа в браузере (сотни MB трафика, минуты CPU/RAM у пользователя).
- Фоновый «живой» rebuild рецептов на клиенте.

**Критерий закрытия:** при публикации нового тега TFG maintainer получает автоматический PR или issue; после merge пользователь на Pages видит новую версию в меню или toast о свежем `checksum`; деплой не требует Java на машине пользователя.

---

## Заблокировано / ждёт решения

| ID | Вопрос | Статус |
|----|--------|--------|
| K-009 | Автообновление pack data | `blocked` — ждёт спецуказания (см. активные карточки) |
| K-B1 | Кастомные серверные рецепты поверх версии модпака | `blocked` → [open-questions.md](open-questions.md) Q2 |
| K-B2 | Dev-ветка Modpack-Modern vs только релизы | `blocked` → Q3 |
| K-B3 | Иконки предметов — лицензия ассетов TFG | `blocked` → Q13 |

---

## Закрыто

| ID | Закрыто | Итог |
|----|---------|------|
| K-001 | 2026-06-17 | Парсер `tools/parser/`: fetch tag, pakku-lock, KubeJS AST, pipeline, pack `0.12.8` (2436 recipes), smoke/golden tests |
| K-002 | 2026-07-06 | Двусторонний расчёт продуктов; edge constraints; sign-off `rebra-rhenium-loop.tfgp` |
| K-003 | 2026-07-06 | EU/t на узле; tier picker; selection sum; multiblock hatch → K-012 |
| K-004 | 2026-07-06 | i18n RU+EN; ConfirmDialog; CLI check-scheme `--lang` |
| K-006 | 2026-07-06 | Undo/redo; copy/paste; target rate (C); box-select + pan |
| K-007 | 2026-06-18 | Полнота рецептов: chanced I/O, greenhouse, LCR mirror; pack `0.12.8` → 2781 recipes |
| K-010 | 2026-06-28 | TFG-native snapshot pipeline; `build-pack --strict-snapshot` 0.12.8 |
| K-011 | 2026-07-06 | Дефицит/избыток на узлах; propagation upstream |
| K-013 | 2026-07-06 | Agent tooling фаза 2: depcruise `no-circular`, knip exports в CI, Semgrep |
| K-014 | 2026-06-30 | Canvas drag perf; edge readiness gate; K-014 revisit spike отложен |
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
