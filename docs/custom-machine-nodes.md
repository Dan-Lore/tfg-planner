# Произвольный процесс (`custom_machine`)

Узел без рецепта из pack data: пользователь задаёт входы/выходы, количества за цикл, `durationTicks`, `machineCount` и `overclock`.

## Тип

| `kind` | Название | Порты | Солвер |
|--------|----------|-------|--------|
| `custom_machine` | Произвольный процесс | `in_*`, `out_*` (любое число) | Синтетический `Recipe` из полей узла |

Энергия и voltage tier **не отображаются** (нет данных в pack).

## Создание

- Кнопка **«Произвольный процесс»** в тулбаре редактора.
- ПКМ по порту → **Произвольный процесс** (upstream/downstream).
- Кнопки **«+ вход»** / **«+ выход»** на карточке.
- Подключение ребра к свободному порту создаёт/расширяет порт и привязывает продукт.

## Схема `.tfgp`

```json
{
  "id": "cm1",
  "kind": "custom_machine",
  "position": { "x": 100, "y": 200 },
  "durationTicks": 20,
  "machineCount": 1,
  "overclock": 1,
  "inputs": [{ "itemId": "gtceu:copper_dust", "amount": 2 }],
  "outputs": [{ "itemId": "gtceu:copper_ingot", "amount": 1 }]
}
```

## Файлы

- [`src/calculator/custom-machine-recipe.ts`](../src/calculator/custom-machine-recipe.ts)
- [`src/canvas/CustomMachineNode.tsx`](../src/canvas/CustomMachineNode.tsx)
- [`src/lib/custom-machine-ports.ts`](../src/lib/custom-machine-ports.ts)
