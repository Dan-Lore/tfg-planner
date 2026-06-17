# Документация TFG Planner

## О проекте

**TFG Planner** — планировщик производственных линий для модпака [TerraFirmaGreg-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern): GregTech + TerraFirmaCraft на Minecraft 1.20.x.

Цель — дать игроку инструмент, похожий по духу на [Factorio Calculator](https://kirkmcdonald.github.io/) Кирка Макдональда, но адаптированный под механизмы, рецепты и логику TerraFirmaGreg.

## Навигация

| Раздел | Файл | Описание |
|--------|------|----------|
| Спецификация | [specification.md](specification.md) | Что должен уметь продукт; живой документ |
| Архитектура | [architecture.md](architecture.md) | Модули, данные, потоки |
| Парсер TFG | [parser.md](parser.md) | Извлечение pack data из Modpack-Modern |
| Kanban | [kanban.md](kanban.md) | Недоделки **без заглушек в коде** |
| Дорожная карта | [roadmap.md](roadmap.md) | MVP → облако → сообщество |
| Версии модпака | [versions.md](versions.md) | Какие релизы TFG поддерживаются |
| Формат схем | [schema-format.md](schema-format.md) | Файл `.tfgp` — сохранение и загрузка |
| Вдохновение | [inspiration.md](inspiration.md) | Референсы, в т.ч. Factorio Calculator |
| Глоссарий | [glossary.md](glossary.md) | Термины TFG и проекта |
| Открытые вопросы | [open-questions.md](open-questions.md) | Неясности для уточнения с заказчиком |

## Связанные ресурсы

- **Модпак (исходники):** [TerraFirmaGreg-Team/Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern)
- **CurseForge:** [TerraFirmaGreg Modern](https://www.curseforge.com/minecraft/modpacks/terrafirmagreg-modern)
- **Вдохновение:** [Factorio Calculator](https://kirkmcdonald.github.io/) · [пример расчёта](https://kirkmcdonald.github.io/calc.html#data=2-0-55&tab=graph&items=advanced-circuit:f:1)

## Как дополнять спецификацию

1. Новые хотелки — в [specification.md](specification.md), раздел «Бэклог» или соответствующий функциональный блок.
2. Решения по архитектуре — в [architecture.md](architecture.md).
3. Поддержка новой версии модпака — запись в [versions.md](versions.md) + пункт в [CHANGELOG.md](../CHANGELOG.md).
4. Ответы на вопросы — закрывать пункты в [open-questions.md](open-questions.md).
