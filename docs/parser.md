# Парсер TerraFirmaGreg-Modern

Извлечение нормализованных данных (машины, рецепты, предметы, жидкости, энергия) для конкретного релиза [Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern).

**Статус:** snapshot pipeline (K-010, rev. 3) · 2026-06-18

## Цель

На входе — тег релиза модпака (например `0.12.8`).  
На выходе — JSON-бандл `tfg-pack-data` v1 для загрузки в приложение.

**Принцип:** рецепты = то, что зарегистрировано в `RecipeManager` после полной загрузки модпака (mods + KubeJS), а не симуляция GT dump + AST-патчей.

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
        snapshots/<tag>/recipes.json
              ↓
        build-pack → lang bundle → normalize → validate
              ↓
        public/data/packs/<tag>/pack.json
```

### CLI

```bash
# Полный export из игры (тяжёлый, JDK 17+, pakku)
npm run generate-tfg-snapshot -- 0.12.8

# Bootstrap snapshot из существующего pack.json (interim)
npm run bootstrap-snapshot -- 0.12.8

# Сборка pack data
npm run build-pack -- --tag 0.12.8
npm run build-pack -- --tag 0.12.8 --strict-snapshot
```

## Snapshot manifest

`snapshot-manifest.json`:

```json
{
  "schemaVersion": 1,
  "modpackTag": "0.12.8",
  "pakkuLockSha256": "...",
  "recipeCount": 6727,
  "markerRecipeIds": ["gtceu:pyrolyse_oven/log_to_charcoal_byproducts", "..."],
  "snapshotSha256": "..."
}
```

`manifest.json` pack data включает `snapshotSha256` и `pakkuLockSha256`.

## Gates (`--strict-snapshot`)

- snapshot существует для tag
- manifest валиден, marker recipes присутствуют
- `recipeCount` выше порога для tag
- smoke chains (ароматика, pyrolyse, distillation) проходят
- golden diff без расхождений (если golden есть)

## Нормализованная модель

См. [specification.md](specification.md). Кратко:

- `Recipe.energy` — только если есть в snapshot; иначе поле **отсутствует**
- Chanced I/O — не в pack (AGENTS.md)

## Структура `tools/parser/`

```
tools/parser/
  snapshots/<tag>/       # committed или CI artifact
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
