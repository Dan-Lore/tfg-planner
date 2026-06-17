# Формат файла схемы `.tfgp`

**TFG Planner Graph** — JSON-файл с расширением `.tfgp` для сохранения производственных мнемосхем.

## Версия формата

| formatVersion | Статус | Изменения |
|---------------|--------|-----------|
| 1 | черновик | Начальная структура |

## Структура (formatVersion: 1)

```json
{
  "$schema": "https://tfg-planner.dev/schema/tfgp-1.json",
  "format": "tfg-planner-graph",
  "formatVersion": 1,
  "meta": {
    "name": "Медная линия",
    "author": "",
    "createdAt": "2026-06-17T12:00:00Z",
    "updatedAt": "2026-06-17T12:00:00Z",
    "description": ""
  },
  "modpack": {
    "version": "0.12.8",
    "dataVersion": 1
  },
  "viewport": {
    "x": 0,
    "y": 0,
    "zoom": 1
  },
  "nodes": [
    {
      "id": "n1",
      "machineId": "gt:electric_blast_furnace",
      "recipeId": "gt:ebf_copper",
      "position": { "x": 100, "y": 200 },
      "overclock": 1,
      "parallel": 1,
      "machineCount": 1,
      "outputMultiplier": 1,
      "label": ""
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "n1",
      "sourcePort": "output_0",
      "target": "n2",
      "targetPort": "input_0",
      "itemId": "gt:copper_ingot"
    }
  ],
  "groups": [
    {
      "id": "g1",
      "name": "Участок плавки",
      "nodeIds": ["n1", "n2"]
    }
  ],
  "targets": [
    {
      "itemId": "gt:copper_plate",
      "ratePerSecond": 1
    }
  ]
}
```

## Поля

### meta

| Поле | Тип | Описание |
|------|-----|----------|
| `name` | string | Название схемы |
| `author` | string | Автор (опционально) |
| `createdAt` | ISO 8601 | Дата создания |
| `updatedAt` | ISO 8601 | Последнее изменение |
| `description` | string | Заметки |

### modpack

Привязка к версии данных. При загрузке схемы с другой версией — предупреждение и попытка миграции id (если возможно).

### nodes

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Уникальный id в схеме |
| `machineId` | string | Ссылка на машину из pack data |
| `recipeId` | string | Активный рецепт |
| `position` | `{x, y}` | Координаты на холсте |
| `overclock` | number | Множитель скорости (если применимо) |
| `parallel` | number | Параллельность (если применимо) |
| `machineCount` | integer | Количество машин, которое представляет узел; **≥ 1**, целое после каждого пересчёта |
| `outputMultiplier` | number | Режим B: дробный множитель выходов (> 0); по умолчанию 1 |

### edges

Направленная связь между портами узлов. `itemId` / `fluidId` — что передаётся по связи.

### groups

Опциональная **визуальная** группировка узлов на холсте (рамка, подпись). Не заменяет режим B: множитель выходов хранится в `node.outputMultiplier`.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Id группы |
| `name` | string | Подпись на холсте |
| `nodeIds` | string[] | Узлы внутри рамки |

### targets

Режим C — **целевой продукт на выходе** (как в Factorio Calculator — «хочу N штук в секунду»).

## MIME-тип

```
application/vnd.tfg-planner.graph+json
```

## Совместимость

- Старые версии формата читаются через цепочку миграций `vN → vN+1`.
- Неизвестные поля в JSON игнорируются (forward compatibility).

## Пример файла

См. [examples/sample-copper-line.tfgp](../examples/sample-copper-line.tfgp) (иллюстративный, id рецептов вымышленные).
