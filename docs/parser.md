# Парсер TerraFirmaGreg-Modern

Извлечение нормализованных данных (машины, рецепты, предметы, жидкости, энергия) для конкретного релиза [Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern).

**Статус:** snapshot pipeline (K-010, rev. 5) · 2026-06-28 — **закрыто** (0.12.8: 56 715 snapshot → 57 179 pack recipes, smoke 15/15)

## Цель

На входе — тег релиза модпака (например `0.12.8`).  
На выходе — JSON-бандл `tfg-pack-data` **v2** (sharded) для загрузки в приложение.

**Layout v2:**

```
public/data/packs/<tag>/
  pack.meta.json       # machines, items, fluids (без recipes)
  recipes/
    index.json         # machineId → shard file + count
    gtceu__macerator.json
    …                  # по одному файлу на machineId
```

Manifest entry: `path` → `pack.meta.json`, `recipesRoot` → `recipes/`.

**Принцип:** рецепты = **все** записи `RecipeManager` после полной загрузки modpack (mods + KubeJS + post-reload), не KubeJS AST и не GT-only subset.

## Источник рецептов

| Источник | Путь | Роль |
|----------|------|------|
| Recipe snapshot | `tools/parser/snapshots/<tag>/` | **Единственный** production-источник рецептов |
| Lang bundle | modpack kubejs + mod JARs | Имена ru/en |
| TFG excludes | `tfg_excludes.zip` | Post-filter snapshot (EMI-hidden) |

KubeJS AST (`tools/parser/src/kubejs/`) сохранён только для validate-only тестов разработки, **не** для `build-pack`.

## Пайплайн сборки

```
git tag → generate-tfg-snapshot (once per tag)
              ↓
   server export (RecipeManager v2)
              ↓
        snapshots/<tag>/recipes.json
              ↓
        build-pack → lang bundle → normalize → validate
              ↓
        public/data/packs/<tag>/pack.meta.json + recipes/*.json
```

### CLI

```bash
# Полный export из игры (обязателен для production pack data)
npm run generate-tfg-snapshot -- 0.12.8

# Повтор export без re-fetch mods
npm run resume-tfg-server-export -- 0.12.8

# Сборка pack data (только из server snapshot)
npm run build-pack -- --tag 0.12.8 --strict-snapshot
```

**Bootstrap** (`npm run bootstrap-snapshot`) — **deprecated**, dev-only; копирует `pack.json` и теряет GT I/O (wiremill и др.).

### Server export (RecipeManager v2)

Скрипт [`tools/parser/snapshot/kubejs-export-recipes.js`](tools/parser/snapshot/kubejs-export-recipes.js):

1. **Tick 500/800/1200** — export после стабилизации TFG `/reload`, не stash с `ServerEvents.recipes`.
2. **Сбор:** Minecraft `RecipeManager` (все `GTRecipe`) + `GTRegistries.RECIPE_TYPES` + merge KubeJS `findRecipes`/`addedRecipes`/`originalRecipes` (без early return).
3. **Сериализация:** primary `recipe.json` (GT JSON); fallback `GTRecipeSerializer.CODEC.encodeStart(JsonOps)` когда json null (Rhino-safe `ResourceLocation` id).
4. **Quality gate перед записью:** `gtceu:greenhouse` ≥ 1000, `gtceu:coal_liquefaction_tower` ≥ 10, `tfg:*` ≥ 3000; marker recipes (с alias, см. ниже).

### Single source of truth

| Данные рецепта | Источник |
|----------------|----------|
| inputs, outputs, chanced I/O | GT JSON slots в server snapshot (primary или fallback serialize) |
| energy / min tier | `tickInputs.eu` → `sanitize-energy` |
| integrated circuit | `gtceu:circuit` → `Recipe.circuitConfiguration` (не product flow) |

KubeJS AST (`enrich-energy`, `enrich-chances`) **не** вызывается из `build-pack`.

### Recipe id aliases (scheme ↔ RecipeManager)

Runtime codec export использует ids вида `tfg:{machine}/{path}` (например `tfg:greenhouse/8x_tfc_wood_sapling_pine/1`), тогда как `.tfgp` и KubeJS short ids — `tfg:tfc_wood_sapling_pine/1`, `tfg:aromatic_feedstock@lcr` и т.д.

`build-pack` регистрирует canonical ids через `RECIPE_SCHEME_ALIASES` (`tools/parser/src/snapshot/manifest.ts` + `expandRecipeSchemeAliases`) и LCR mirror (`mirrorChemReactorToLcr`). Strict gates и smoke chains проверяют **canonical** ids.

## Snapshot manifest

`snapshot-manifest.json` (schema v2):

```json
{
  "schemaVersion": 2,
  "modpackTag": "0.12.8",
  "pakkuLockSha256": "...",
  "recipeCount": 45000,
  "markerRecipeIds": [
    "tfg:tfc_wood_sapling_pine/1",
    "tfg:raw_aromatic_mix_charcoal_hydrogen",
    "tfg:aromatic_feedstock@lcr",
    "gtceu:pyrolyse_oven/log_to_charcoal_byproducts",
    "gtceu:distillation_tower/distill_wood_tar"
  ],
  "typeCounts": { "gtceu:greenhouse": 1130, "gtceu:coal_liquefaction_tower": 12 },
  "serializeStats": { "primary": 40000, "fallback": 5000, "dropped": 0 },
  "snapshotSha256": "..."
}
```

`manifest.json` pack data включает `snapshotSha256` и `pakkuLockSha256`.

## Gates (`--strict-snapshot`)

- snapshot существует для tag
- manifest schema v2 валиден
- marker recipes (greenhouse, aromatic, pyrolyse, distillation) присутствуют
- `recipeCount` ≥ 40 000 для 0.12.8
- `gtceu:greenhouse` ≥ 1000, `gtceu:coal_liquefaction_tower` ≥ 10 recipes в pack
- `tfg:*` recipe count ≥ 3000
- smoke chains (полная aromatic chain из modpack) проходят
- golden diff без расхождений (если golden есть)

## Нормализованная модель

См. [specification.md](specification.md). Кратко:

- `Recipe.energy` — optional `EnergyStack`: `{ minVoltageTier, voltage, amperage }` на min tier рецепта; legacy `euPerTick` нормализуется при сборке. Поле **отсутствует**, если парсер не извлёк.
- `Recipe.circuitConfiguration` — optional GT integrated circuit (не consumable flow).
- `Machine.kind` — optional `singleblock` | `multiblock` (для UI energy hatches).
- Chanced I/O — optional `chance` на потоке (вес GT, 10000 = 100%); в UI — `80% × 16× …`, скорость ≈ `amount/duration × chance/10000` с префиксом `~`

## Структура `tools/parser/`

```
tools/parser/
  snapshots/<tag>/       # snapshot-manifest.json в git; recipes.json — локально/CI
  snapshot/              # KubeJS export script
  scripts/
    generate-tfg-snapshot.*
    bootstrap-snapshot-from-pack.mjs
  src/
    snapshot/            # loadRecipeSnapshot, manifest, recipe-json
    lang/
    pipeline/normalize.ts
    validate/            # schema, smoke-chains, golden-diff
  golden/
  tests/
```

## Удалено (rev. 3)

- `substrate-dumps/`, `generate-gt-dump`
- `gt-vanilla-substrate`, GT JAR scan, KubeJS recipe simulation в `build-pack`
