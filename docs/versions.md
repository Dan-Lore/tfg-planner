# Версии конфигураций модпака

Реестр версий [TerraFirmaGreg-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern).

## Поддерживаемые версии

| modpack_version | data_version | status | source | notes |
|-----------------|--------------|--------|--------|-------|
| 0.12.8 | 1 | ready | `public/data/packs/0.12.8/pack.json` | K-010 rev.3: **6727** recipes из snapshot; smoke 12/12; `snapshotSha256` в manifest. Полный in-game export: `npm run generate-tfg-snapshot` |
| 0.12.8-sample | 1 | deprecated | `public/data/packs/0.12.8-sample/pack.json` | Демо MVP: 3 рецепта медной линии (ручные данные) |

## Сборка данных

```bash
npm run bootstrap-snapshot -- 0.12.8   # interim, from pack.json
npm run build-pack -- --tag 0.12.8 --strict-snapshot
```

Выход: `public/data/packs/<tag>/pack.json`, `build-report.json`, `manifest.json`.

## Целевые версии (план)

| modpack_version | Приоритет | Комментарий |
|-----------------|-----------|-------------|
| latest (`0.12.x`) | высокий | CI на новый GitHub Release |
| LTS (TBD) | средний | Уточнить у заказчика |
