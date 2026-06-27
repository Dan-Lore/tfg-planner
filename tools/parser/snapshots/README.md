# Recipe snapshots (TFG @ tag)

Effective `RecipeManager` state after full modpack load (mods + KubeJS).

## Layout

```
snapshots/<modpack-tag>/
  recipes.json              # flat RecipeOp[] export
  snapshot-manifest.json      # tag, pakkuLockSha256, recipeCount, markers
```

## Requirements

- **JDK 21** (or 17+) — `JAVA_HOME` must not point to Java 8. F-S-S checks class version ≥ 61.
- **Disk:** ~15 GB for `.cache/tfg-snapshot/` (mods + libraries).
- **Path:** ASCII path recommended (`C:\dev\tfg-planner`). OneDrive + Cyrillic `Документы` can break Forge installer.
- **Time:** pakku fetch ~15 min, export ~2 min, first server boot ~30–60 min.
- **RAM (server JVM):** auto — `min(50% system RAM, RAM − 8 GiB)` + G1GC + `ActiveProcessorCount`; pakku uses up to 35% (cap 16 GiB). See `tools/parser/scripts/server-jvm-args.mjs`.
- **Overrides:** `TFG_SERVER_XMX`, `TFG_PAKKU_XMX`, `TFG_SERVER_CPU_COUNT`, `TFG_SERVER_TIMEOUT_MIN`.

## Generate (full server export)

**Required** for production pack data. Requires JDK 17+, ~10 GB mods, 45–90 min first run.

```bash
npm run generate-tfg-snapshot -- 0.12.8
```

Steps: fetch Modpack-Modern tag → `pakku fetch` + `pakku export` → inject export script → serverpack `minecraft_server.jar` → copy `logs/tfg-planner-recipe-snapshot/recipes.json`.

Export format: **GT JSON** via `ServerEvents.recipes` + `recipe.serialize()` / `JSON.parse(recipe.json.toString())`. Script: `tools/parser/snapshot/kubejs-export-recipes.js` → injected as `kubejs/server_scripts/zzz_tfg_planner_export.js`. Output: batched `kubejs/config/tfg-planner-recipe-snapshot/recipes-*.json` + `manifest.json` under server run directory.

**Verify export:** after server boot, check `.cache/tfg-snapshot/<tag>/server-run/kubejs/config/tfg-planner-recipe-snapshot/manifest.json` exists. Server log should show `Collected N GT JSON recipes` with N ≥ 6000. If manifest is missing but log shows export, try ASCII-only repo path (OneDrive/Cyrillic paths may break JsonIO).

Retry after fetch (skip re-downloading mods):

```bash
npm run generate-tfg-snapshot -- 0.12.8 --skip-fetch
# or only server phase:
npm run resume-tfg-server-export -- 0.12.8
```

## Git

**Не коммитить** `recipes.json` — генерируемый артефакт (~4 MB).

В репозитории держать:

- `public/data/packs/<tag>/pack.json` — runtime data для приложения
- `snapshots/<tag>/snapshot-manifest.json` — метаданные и marker recipes

`recipes.json` создаётся локально или в CI (`generate-tfg-snapshot`). `build-pack` **требует** `recipes.json`; при отсутствии — ошибка с инструкцией.

## Bootstrap (deprecated)

```bash
npm run bootstrap-snapshot -- 0.12.8   # dev-only, не для release
```

Копирует flat RecipeOp из `pack.json` — **теряет GT I/O** (wiremill и др.). Используйте только для отладки pipeline.

## Build pack from snapshot

```bash
npm run build-pack -- --tag 0.12.8 --strict-snapshot
```

`--strict-snapshot` fails if manifest markers or smoke chains are missing (default).
