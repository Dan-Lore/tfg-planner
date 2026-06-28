# Буферные узлы

Три типа узлов для моделирования внешних источников, промежуточного хранения и стоков на мнемосхеме.

## Типы

| `kind` | Название | Порты | Солвер |
|--------|----------|-------|--------|
| `start_buffer` | Стартовый буфер | `out_0` | Источник: rate (авто = спрос) или stock (`initialStock / 3600` items/s) |
| `intermediate_buffer` | Промежуточный буфер | `in_0`, `out_0` | Pass-through: `out ≤ min(in, demand)` |
| `end_buffer` | Конечный буфер | `in_0` | Sink: неограниченный приём; `capacity` только в UI |

`capacity` у промежуточного буфера сохраняется при создании (`round(flow × 3600)`) и отображается в UI; **на скорость потоков пока не влияет** (задел под моделирование запаса).

Горизонт планирования: **3600 с** (`BUFFER_HORIZON_SEC`).

## Создание

ПКМ по порту машины или буфера:

- **Входной порт:** стартовый / промежуточный буфер (upstream)
- **Выходной порт:** промежуточный / конечный буфер (downstream)

При создании: `capacity = round(flowPerSec × 3600)`.

## Схема `.tfgp`

```json
{
  "id": "buf_1",
  "kind": "intermediate_buffer",
  "position": { "x": 100, "y": 200 },
  "itemId": "minecraft:charcoal",
  "capacity": 3600
}
```

Узлы без `kind` — машины (обратная совместимость).

## Файлы

- [`src/calculator/buffer-solver.ts`](../src/calculator/buffer-solver.ts)
- [`src/canvas/BufferNode.tsx`](../src/canvas/BufferNode.tsx)
- [`src/schema/tfgp.ts`](../src/schema/tfgp.ts)
