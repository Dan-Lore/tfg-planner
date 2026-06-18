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

## Generate (full server export)

Requires JDK 17+, ~10 GB mods, 45–90 min first run.

```bash
npm run generate-tfg-snapshot -- 0.12.8
```

Steps: fetch Modpack-Modern tag → `pakku fetch` + `pakku export` → inject export script → serverpack `minecraft_server.jar` → copy `logs/tfg-planner-recipe-snapshot/recipes.json`.

Retry after fetch (skip re-downloading mods):

```bash
npm run generate-tfg-snapshot -- 0.12.8 --skip-fetch
# or only server phase:
npm run resume-tfg-server-export -- 0.12.8
```

## Bootstrap (interim)

Until a full server export exists, bootstrap from a built `pack.json`:

```bash
npm run bootstrap-snapshot -- 0.12.8
```

## Build pack from snapshot

```bash
npm run build-pack -- --tag 0.12.8 --strict-snapshot
```

`--strict-snapshot` fails if manifest markers or smoke chains are missing.
