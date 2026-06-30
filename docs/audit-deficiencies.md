# Аудит недостатков TFG Planner

> **Дата:** 2026-06-17  
> **Статус:** черновик для последующей работы  
> **Метод:** статический анализ кода, docs, CI; `npm test` и `npm run build` проходят на момент аудита.

Только подтверждённые проблемы. Спекуляции и «хотелки» без следов в коде исключены.

---

## Критические (ломают данные или могут уронить приложение)

### 1. Импорт `.tfgp` с дублирующимися ID узлов — рёбра не перепривязываются

**Файлы:** `src/stores/editor-utils.ts` (`dedupeNodeIds`), `src/stores/editor-store.ts` (`loadScheme`)

При импорте дубликаты `node.id` получают новые ID, но `edges` остаются со **старыми** `source`/`target`. Связи становятся битые.

### 2. Слабая валидация импорта `.tfgp`

**Файл:** `src/schema/tfgp.ts` (`parseTfgp`)

Проверяется только `format` / `formatVersion`. Нет проверки наличия `nodes`, `edges`, `meta`. Отсутствие `nodes` → падение на `data.nodes.map(...)`. Нет лимита размера файла (`FileReader.readAsText` без `onerror` в `src/pages/EditorPage.tsx`).

### 3. NaN в целевой скорости может уронить solver

**Файлы:** `src/pages/EditorPage.tsx` (prompt → `Number(v)`), `src/calculator/flow-solver.ts` (`R.from(target.ratePerSecond)`), `src/calculator/rational.ts` (throw на non-finite)

Невалидный ввод в «Целевая скорость» → необработанное исключение при `recalculateScheme`.

---

## Высокие (функциональные дефекты / spec не выполнен)

### 4. Undo не восстанавливает позиции узлов на канвасе

**Файлы:** `src/lib/merge-flow-nodes.ts`, `src/lib/merge-flow-nodes.test.ts`, `src/canvas/EditorCanvas.tsx`, `src/stores/editor-store.ts`

`mergeFlowNodes` всегда сохраняет `position` из React Flow, а не из store. После Ctrl+Z координаты в store меняются, на экране — нет. Тест явно закрепляет это поведение.

### 5. Viewport в undo не применяется к канвасу

**Файлы:** `src/canvas/EditorCanvas.tsx` (`defaultViewport` — только при mount), `src/stores/editor-store.ts` (viewport в snapshot)

Undo/redo меняет `scheme.viewport` в Zustand, но React Flow не получает controlled viewport. Pan/zoom не откатываются.

### 6. Двусторонний пересчёт потоков не реализован

**Файлы:** `src/pages/EditorPage.tsx`, `src/calculator/flow-solver.ts`, `docs/specification.md` §3.3

Есть только «Целевая скорость» (режим C). Нельзя менять скорость на ребре/входе и пересчитать всю схему — ключевое требование spec открыто.

### 7. Поле `parallel` в схеме не участвует в расчётах

**Файлы:** `src/schema/tfgp.ts`, `src/calculator/flow-solver.ts`

Поле есть в узле и передаётся в solver input, но внутри `solveFlows` не читается. Масштаб через parallel в runtime не работает.

### 8. Legacy port ID (`input_*` / `output_*`) ломают валидацию и pruning

**Файлы:** `docs/schema-format.md`, `src/lib/prune-edges.ts`, `src/pages/EditorPage.tsx` (`connectedPorts`), `src/canvas/ports.ts` (`parsePortId`)

Нормализация есть частично (handles в RF, `flow-display`, `flow-solver`), но `prune-edges` и `connectedPorts` работают с сырыми ID. Импорт схем из docs → порты «отключены», при смене рецепта рёбра могут удалиться.

### 9. Добавление машины без явного выбора

**Файлы:** `src/lib/search-combobox.ts` (`resolveMachineId` → `filtered[0]`), `src/pages/EditorPage.tsx`

При пустом запросе «Add machine» активна первая машина каталога — можно добавить не ту машину без Enter/клика.

### 10. Глобальный Ctrl+Z / Ctrl+Y перехватывает ввод в полях

**Файл:** `src/pages/EditorPage.tsx` (window `keydown` без проверки `activeElement`)

В поиске машин/рецептов и sidebar undo схемы вместо отмены текста.

### 11. Upstream propagation всегда через `outputs[0]`

**Файл:** `src/calculator/flow-solver.ts` (~336)

Обратный проход пишет demand upstream в ключ **первого** выхода рецепта. Цепочки с non-primary output считаются неверно.

### 12. ~~`nodeInputRates` — теоретический спрос, не сходимость по графу~~ **Исправлено (2026-06-17)**

**Файлы:** `src/calculator/flow-solver.ts`, `src/canvas/flow-display.ts`

Подписи на рёбрах берут `edgeFlows` (сходящиеся потоки). `nodeInputRates` остаётся для теоретических подписей портов узла.

---

## Средние

### Редактор и схема

| # | Недостаток | Где |
|---|-----------|-----|
| 13 | `clearScheme` / `loadScheme` / `switchToPack` обнуляют undo без snapshot | `src/stores/editor-store.ts` |
| 14 | Duplicate копирует узлы, не рёбра | `duplicateSelected` |
| 15 | Нет copy/paste по clipboard | — |
| 16 | Self-connection не запрещён | `isValidConnection` |
| 17 | Несколько рёбер на один input port — без предупреждения | `isValidConnection` + equal split в solver |
| 18 | Импорт не сверяет версию modpack с активной | `loadScheme` |
| 19 | `groups` в `.tfgp` — поле есть, UI нет | `src/schema/tfgp.ts` |
| 20 | `energyHatchCount` в schema/i18n, логики в app нет | `src/schema/tfgp.ts`, `src/i18n` |

### Калькулятор и баланс

| # | Недостаток | Где |
|---|-----------|-----|
| 21 | Циклы в графе → произвольный порядок узлов | `topologicalOrder` → fallback |
| 22 | ~~`buildNodeBalanceLines` показывает deficit только на **незакрытых** входах~~ **Исправлено (2026-06-17):** deficit через `nodePortDeficit` (подключённые и нет) | `src/canvas/flow-display.ts` |
| 23 | Target rate prompt только для `outputs[0]` | `src/pages/EditorPage.tsx` |
| 24 | ~~Edge flows делятся поровну между рёбрами одного порта, без учёта реального спроса downstream~~ **Исправлено (2026-06-17):** `computeConvergedFlows` с итерацией, cap по downstream demand | `src/calculator/flow-solver.ts` |

### UI / UX / a11y

| # | Недостаток | Где |
|---|-----------|-----|
| 25 | Машина с одним рецептом не показывает его на узле | `src/canvas/MachineNode.tsx` |
| 26 | Sidebar combobox обрезается `overflow-y: auto` | `src/app/layout.css`, `SearchCombobox` |
| 27 | Нет `@media` — sidebar 280px фиксирован, на узком экране ломается layout | `src/app/layout.css` |
| 28 | Ширина узла: CSS `min-width: 200px`, геометрия рёбер/подписей — 220px | `layout.css` vs `node-bounds.ts` |
| 29 | Meta chips (машины, OC) — только колёсико, без keyboard | `src/canvas/MachineNode.tsx` |
| 30 | `prompt()` / `alert()` / `confirm()` — плохая a11y, нет i18n для `'Import failed'` | `src/pages/EditorPage.tsx` |
| 31 | HomePage: `Active pack:` hardcoded EN | `src/pages/HomePage.tsx` |
| 32 | VersionSidebar: `{n} recipes · {n} machines` без i18n | `src/components/VersionSidebar.tsx` |
| 33 | Sidebar labels без `htmlFor` / `aria-labelledby` | `src/pages/EditorPage.tsx` |
| 34 | `aria-selected={selected \|\| highlighted}` — ложное состояние | `src/components/SearchCombobox.tsx` |
| 56 | **Запланировано:** нет визуального gap между рёбрами, идущими по одному коридору маршрута | см. §56 ниже |
| 57 | ~~Подписи рёбер: нет суммы на входном порте; fan-out по `itemId` вместо физического порта~~ **Исправлено (2026-06-23):** см. [edge-labels-and-port-load.md](./edge-labels-and-port-load.md) | `src/canvas/flow-display.ts` |
| 58 | ~~Нет % загрузки на выходных портах~~ **Исправлено (2026-06-23):** `nodePortOutLoad` + UI | `flow-solver.ts`, `MachineNode.tsx` |

### 56. Parallel gap между рёбрами по сегменту маршрута (запланировано)

**Статус:** backlog (прототип 2026-06-17 откатан — группировка по портам/узлам не подходит)  
**Файлы (целевые):** `src/canvas/FlowEdge.tsx`, `src/lib/edge-routing.ts`, `src/lib/bezier-edge-label.ts`

#### Цель

Визуальный зазор **2–10 px** (константа) между рёбрами, которые **делят один и тот же вычисленный сегмент маршрута** (горизонтальный коридор `centerY`, вертикальный `centerX`, общий участок polyline/bezier), а не между рёбрами, которые просто имеют общий source/target или порт.

#### Почему откатили прототип

Первая попытка группировала рёбра по `(source, sourcePort)`, `(target, targetPort)`, `(source, target)` и смещала control points / `centerY` постфактум. Это:

- не покрывает рёбра из **разных** узлов через **один** gap-коридор (типичный кейс `benzene-distillation-lcr-gap.tfgp`);
- лишний offset для пары узлов с **разными** портами (handles уже разнесены по Y);
- дублировало `getBezierPath` в `buildBezierPathString`;
- выбирало группу по эвристике «самая большая», без связи с геометрией.

#### Правильный критерий группировки

1. Для каждого ребра вычислить маршрут так же, как сейчас: bezier **или** `getRoutedSmoothStepPath` → `waypoints` / `center`.
2. Извлечь **ключ сегмента-коридора** — участок с постоянной координатой, по которому идут «параллельные» линии:
   - горизонтальный сегмент: `(orientation: 'h', y: round(centerY), xMin, xMax)`;
   - вертикальный: `(orientation: 'v', x: round(centerX), yMin, yMax)`.
3. Для bezier без obstacle routing — аппроксимировать «коридор» по midpoint кривой (или не применять gap, если нет общего сегмента).
4. Рёбра с **одинаковым ключом** (допуск ε ≈ 1–2 px) → одна **lane-группа**.
5. Индекс в группе → `laneOffset = (index - (n-1)/2) * PARALLEL_EDGE_GAP`.

**Не группировать** только по `sourcePort` / `targetPort` / паре узлов.

#### Применение offset

- Endpoints (handles) **не смещать**.
- Смещать только внутренние точки: `centerY` / `centerX` маршрута и interior waypoints / control points **перпендикулярно** оси сегмента.
- `edgePathNeedsObstacleRouting` и выбор `center` — **до** lane offset, но offset учитывать при финальном path (или пересчитывать collision check с малым ε).

#### Где считать

Предпочтительно **в `FlowEdge` при рендере** (доступ к `useEdges()`, актуальным `sourceX/Y`, obstacles), а не в `EditorPage` по статическому `scheme.edges`.

Вариант: вынести `computeParallelLaneOffsetsByRouteSegment(edges, routeByEdgeId)` в `src/lib/edge-routing.ts` или отдельный модуль, вызывать из canvas-слоя.

#### Тесты (обязательно до merge)

- **Unit:** два ребра с одинаковым `centerY` в `getRoutedSmoothStepPath` → разный Y горизонтального сегмента на ±gap/2.
- **Integration:** `src/lib/fixtures/edge-routing/benzene-distillation-lcr-gap.tfgp` — несколько рёбер через gap между `node_37` и `node_44`: попарное расстояние между путями на общем сегменте ≥ `PARALLEL_EDGE_GAP`.
- **Regression:** fan-out с одного порта на **разные** `centerY` не получает лишний offset; рёбра с разными портами одной пары узлов без общего сегмента — offset 0.

#### Константы

- `PARALLEL_EDGE_GAP` — одна константа (по умолчанию 3–4 px; настраиваемо позже).
- Не смешивать с `DEFAULT_EDGE_OFFSET` (20 px) — это отступ от handle, не lane spacing.


| # | Недостаток | Где |
|---|-----------|-----|
| 35 | Pack JSON ~4.7 MB грузится целиком | `src/data/pack-registry.ts` |
| 36 | Все рёбра `animated: true` постоянно | `src/pages/EditorPage.tsx` |
| 37 | Схемы всех pack keys в localStorage без лимита | `editor-store` persist |

---

## Низкие

| # | Недостаток |
|---|-----------|
| 38 | Нет React Error Boundary — uncaught error → white screen |
| 39 | `escapeValue: false` в i18next — риск при будущем HTML interpolation |
| 40 | Dead i18n keys `energyHatchCount` в RU-блоке на EN |
| 41 | `gt-multiblock.ts` используется только парсером, не app (energy hatch UI удалён) |
| 42 | Balance lines: `key={line.text}` — коллизии при одинаковом тексте |
| 43 | `mergeFlowNodes` сохраняет stale `measured` после смены рецепта |

---

## Тесты и CI

| # | Недостаток | Подтверждение |
|---|-----------|---------------|
| 44 | Нет тестов `parseTfgp` / round-trip `.tfgp` | нет `tfgp.test.ts` |
| 45 | Нет тестов `editor-store.ts` (~566 строк) | только `editor-utils.test.ts` |
| 46 | Нет тестов `prune-edges`, `pack-store` | — |
| 47 | Solver: нет тестов cycles, byproducts, разветвления (spec §3.3) | `flow-solver.test.ts` — базовые кейсы |
| 48 | CI: `npm test` + `build` + `lint:agent` (arch, knip, semgrep) + `parser:validate`; нет coverage gate, E2E | `.github/workflows/verify.yml` |
| 49 | Vitest `environment: 'node'` — UI не тестируется в CI | `vitest.config.ts` |

---

## Документация расходится с кодом

| # | Документ | Реальность |
|---|----------|------------|
| 50 | `README.md`: «2436 рецептов» | `build-report.json`: **6727** |
| 51 | `architecture.md`: IndexedDB cache | session cache + localStorage persist; `pack-build-manifest.ts` |
| 52 | `schema-format.md`: migration/warning при несовпадении версии | не реализовано |
| 53 | `schema-format.md`: visual `groups` | нет в editor |
| 54 | `kanban.md`: дублирующийся ID K-011; K-004 «i18n не начата» | K-011 deficit закрыт; drag jank → K-014; K-004 in_progress |
| 55 | `specification.md` §3.2–3.3: большинство чекбоксов `[ ]` | соответствует фактическим пробелам |

---

## Не считается недостатком (перепроверено)

| Тема | Почему исключено |
|------|------------------|
| Target dedup по `(target, product)` | **Задумано:** разные ингредиенты → отдельные подписи; один продукт с нескольких рёбер → одна |
| Source dedup по `(source, product, port)` | **Задумано** для fan-out с одного порта |
| Converged edge flows + balance | **Исправлено** (2026-06-17): `computeConvergedFlows`, `nodePortDeficit`, подписи рёбер из `edgeFlows` |
| Recipe picker сброс при blur без выбора | **Исправлено** (2026-06-17) |
| Отсутствие `unified` в FlowEdge | **Исправлено** (2026-06-17) |
| `gt-multiblock.ts` «мёртвый модуль» | используется **парсером**, не app |

---

## Приоритеты

### P0 — критично

1. Import dedupe + remap edges (#1)
2. parseTfgp validation + import error handling (#2)
3. NaN guard на target rate (#3)

### P1 — следующий спринт

4. Undo positions (#4)
5. Legacy port normalization everywhere (#8)
6. Bidirectional flow editing (#6)

### P2 — backlog / polish

Пункты #7–#55 по таблицам выше.  
**#56** — parallel gap по сегменту маршрута (детали в §56).

---

## Связанные документы

- [specification.md](./specification.md) — требования продукта
- [kanban.md](./kanban.md) — карточки backlog
- [schema-format.md](./schema-format.md) — формат `.tfgp`
- [edge-labels-and-port-load.md](./edge-labels-and-port-load.md) — подписи рёбер и загрузка портов
