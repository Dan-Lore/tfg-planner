# Версии конфигураций модпака

Реестр версий [TerraFirmaGreg-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern).

## Поддерживаемые версии

| modpack_version | data_version | status | source | notes |
|-----------------|--------------|--------|--------|-------|
| 0.12.8 | 1 | ready | `public/data/packs/0.12.8/pack.json` | Парсер KubeJS-effective: 2436 рецептов из тега `0.12.8`. Сборка: `npm run build-pack -- --tag 0.12.8` |
| 0.12.8-sample | 1 | deprecated | `public/data/packs/0.12.8-sample/pack.json` | Демо MVP: 3 рецепта медной линии (ручные данные) |

## Сборка данных

```bash
npm run build-pack -- --tag 0.12.8
```

Выход: `public/data/packs/<tag>/pack.json`, `build-report.json`, `manifest.json`.

## Целевые версии (план)

| modpack_version | Приоритет | Комментарий |
|-----------------|-----------|-------------|
| latest (`0.12.x`) | высокий | CI на новый GitHub Release |
| LTS (TBD) | средний | Уточнить у заказчика |
