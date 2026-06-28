# Версии конфигураций modpacka

Реестр версий [TerraFirmaGreg-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern).

## Поддерживаемые версии

| modpack_version | data_version | status | source | notes |
|-----------------|--------------|--------|--------|-------|
| 0.12.8 | 1 | ready | `public/data/packs/0.12.8/pack.meta.json` + `recipes/` | Pack v2 sharded: **57 179** recipes, 86 machine shards; smoke 15/15. Meta ~5–8 MiB, recipes lazy-loaded in UI |

## Сборка данных

```bash
npm run generate-tfg-snapshot -- 0.12.8   # in-game export (once per tag)
npm run build-pack -- --tag 0.12.8 --strict-snapshot
```

Выход: `pack.meta.json`, `recipes/*.json`, `build-report.json`, per-pack `manifest.json`.

Конвертация существующего monolith (dev): `node tools/shard-monolith-pack.mjs 0.12.8`.

## Целевые версии (план)

| modpack_version | Приоритет | Комментарий |
|-----------------|-----------|-------------|
| latest (`0.12.x`) | высокий | CI на новый GitHub Release |
| LTS (TBD) | средний | Уточнить у заказчика |
