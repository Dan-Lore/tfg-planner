# Вдохновение и референсы

## Factorio Calculator

Основной ориентир по **логике расчёта** и **ясности представления производственных цепочек**.

| Ресурс | Ссылка |
|--------|--------|
| Главная | [kirkmcdonald.github.io](https://kirkmcdonald.github.io/) |
| Калькулятор (пример) | [Advanced Circuit — граф](https://kirkmcdonald.github.io/calc.html#data=2-0-55&tab=graph&items=advanced-circuit:f:1) |
| Исходники | [github.com/KirkMcDonald/FactorioCalculator](https://github.com/KirkMcDonald/FactorioCalculator) |

### Что берём за образец

- **Граф зависимостей** — от целевого предмета к сырью.
- **Задание целевой скорости** — «производить X в секунду».
- **Модули / бонусы** — аналог overclock и parallel в TFG.
- **Точность расчётов** — рациональная арифметика, без накопления ошибок float.
- **Omit dependencies** — возможность считать участок, когда часть входов «привозится снаружи» (идея для будущего бэклога).

### Чем TFG Planner отличается

| Factorio Calculator | TFG Planner |
|-------------------|-------------|
| Дерево рецептов, автолейаут | **Свободная мнемосхема** на листе |
| Одна игра, фиксированные данные | **Версии модпака**, подгрузка из Modpack-Modern |
| Веб без сохранения layout | **Файл `.tfgp`** с позициями и группами |
| Belts / assemblers | GregTech machines, TFC mechanics, KubeJS-рецепты |

## TerraFirmaGreg-Modern

| Ресурс | Ссылка |
|--------|--------|
| Репозиторий модпака | [github.com/TerraFirmaGreg-Team/Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern) |
| CurseForge | [terrafirmagreg-modern](https://www.curseforge.com/minecraft/modpacks/terrafirmagreg-modern) |

Источник истины для рецептов, машин и баланса.

## Другие возможные референсы (для изучения)

- **GT:NH / GTCEu planning tools** — сообщество GregTech.
- **JAOPCA / EMI / JEI** — отображение рецептов в игре (для сверки данных).
- **Draw.io / Excalidraw** — UX свободного холста (не расчёты).
