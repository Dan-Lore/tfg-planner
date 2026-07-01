import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  ru: {
    translation: {
      appName: 'TFG Planner',
      nav: {
        home: 'Главная',
        editor: 'Редактор',
        versions: 'Версии',
      },
      home: {
        title: 'Планировщик производственных линий',
        subtitle:
          'Мнемосхемы для модпака TerraFirmaGreg-Modern. Собирайте цепочки, масштабируйте производство, сохраняйте схемы в .tfgp.',
        openEditor: 'Открыть редактор',
        openEditorLoading: 'Загрузка pack…',
        openEditorNeedPack: 'Сначала выберите версию modpack',
        openEditorRestoring: 'Восстановление данных modpack…',
        selectVersionHint: 'Выберите версию modpack — данные рецептов и машин подгрузятся для редактора.',
        selectVersion: 'Выбрать версию модпака',
        modpackLink: 'Репозиторий Modpack-Modern',
        inspiration: 'Вдохновение: Factorio Calculator',
      },
      versions: {
        title: 'Версии модпака',
        select: 'Загрузить',
        active: 'Активна',
        status: 'Статус',
        noPacks: 'Нет доступных версий',
        loadingMeta: 'Загрузка meta…',
        recipesLazy: 'рецепты по запросу',
        restoringPack: 'восстановление из кэша…',
      },
      editor: {
        title: 'Редактор схемы',
        schemeEditor: 'Редактор мнемосхемы',
        elementEditor: 'Редактор элементов',
        schemeName: 'Название',
        schemeNamePlaceholder: 'Без названия',
        activePack: 'Активная версия modpack',
        selectPackOnHome: 'Выбрать версию на главной',
        addMachine: 'Добавить машину',
        targetRate: 'Целевая скорость',
        duplicate: 'Дублировать',
        undo: 'Отменить',
        redo: 'Повторить',
        export: 'Сохранить .tfgp',
        import: 'Загрузить .tfgp',
        importFailed: 'Не удалось загрузить .tfgp',
        dropScheme: 'Отпустите файл .tfgp для открытия',
        clearScheme: 'Очистить схему',
        clearSchemeConfirm:
          'Удалить все узлы, связи и цели? Действие нельзя отменить.',
        noPack: 'Версия modpack не выбрана. Сначала выберите её на главной странице.',
        restoringPack: 'Восстановление данных modpack {{version}}',
        machineCount: 'Машин',
        overclock: 'Разгон',
        machinesMeta: 'Машин x{{count}}',
        overclockMeta: 'Разгон {{value}}',
        tierMeta: 'Tier {{value}}',
        circuitMeta: 'C:{{value}}',
        hatchesMeta: 'Люки x{{count}}',
        energyMeta: '{{value}}',
        totalEuMeta: '{{value}} за рецепт',
        nodeLoadMeta: 'Загрузка {{value}}',
        nodeLoadTitle:
          'Загрузка {{load}} — min(входы по связям, использование выхода)',
        maxLoadMeta: 'Макс {{value}}',
        maxLoadTitle:
          'Максимальная загрузка {{load}} — min(подключённые входы): потолок скорости при текущих поставках',
        currentLoadMeta: 'Работа {{value}}',
        currentLoadTitle:
          'Текущая загрузка {{load}} — min(утилизация выходов относительно максимальной загрузки)',
        recipeThroughputTitle:
          'Текущая {{load}} — фактическая скорость относительно полного рецепта',
        loadUtilizationMeta: 'Загруженность: {{current}} / {{max}}',
        portInputMaxLoadTitle: '{{load}} · {{received}} из {{demand}} (вклад в макс. загрузку)',
        portRecipeLoad: 'Рец {{value}}',
        portCapacityLoad: 'Ёмк {{value}}',
        portOutRecipeLoadTitle:
          'Рецепт {{load}} · {{sent}} из {{produced}} (от полной скорости рецепта)',
        portOutCapacityLoadTitle:
          'Ёмкость {{load}} · {{sent}} из {{maxOutput}} (от доступного при макс. загрузке)',
        nodeOutputLoadMeta: 'Использование {{value}}',
        nodeOutputLoadTitle:
          'Использование выхода {{load}} — сколько продукции уходит по связям',
        portLoadTitle: '{{load}} · {{received}} из {{demand}}',
        portLoadOpenTitle: '{{load}} · порт не подключён, требуется {{demand}}',
        portOutConsumerLoadTitle:
          '{{load}} · {{sent}} из {{demand}} (потребность потребителей на порту)',
        portOutConsumerDemandTitle:
          'Обеспечивает {{load}} потребности потребителей на порту · {{sent}} из {{demand}}',
        portOutLoadOpenTitle: '{{load}} · порт не подключён, производится {{produced}}',
        voltageTier: 'Tier',
        energyHatchCount: 'Energy hatches',
        parallel: 'Параллель',
        apply: 'Применить',
        ratePrompt: 'Скорость в секунду',
        rateInvalid: 'Введите положительное число',
        flowNonConverged:
          'Потоки не сошлись за 50 итераций — значения могут быть неточными.',
        selectNode: 'Выберите узел на схеме',
        recipe: 'Рецепт',
        recipeIn: 'Вход',
        recipeOut: 'Выход',
        pickMachine: 'Машина',
        searchMachine: 'Поиск машины…',
        searchRecipe: 'Поиск рецепта…',
        noMatches: 'Ничего не найдено',
        deleteHint: 'Del — удалить узел или связь',
        flowComputing: 'Пересчёт…',
        flowStale: 'Ожидание пересчёта…',
        portMenu: {
          buffers: 'Буферы',
          addDownstream: 'Добавить потребителя',
          addUpstream: 'Добавить производителя',
          addStartBuffer: 'Стартовый буфер',
          addIntermediateBuffer: 'Промежуточный буфер',
          addEndBuffer: 'Конечный буфер',
          noRecipes: 'Нет подходящих рецептов',
        },
        schemeCheck: {
          title: 'Проверка схемы',
          ok: 'Замечаний нет',
          hint: 'Клик по строке — выделить узлы и связь на холсте. Красное — ошибка, оранжевое — предупреждение.',
          focusHint: 'Показать на схеме',
          expandList: 'Показать список замечаний',
          collapseList: 'Свернуть список замечаний',
          errors: '{{count}} ошибок',
          warnings: '{{count}} предупр.',
          errorGroup: 'Ошибки',
          warningGroup: 'Предупреждения',
          detailReason: 'Основание',
          issues: {
            disconnected_input: 'Не подключён вход: {{product}}',
            disconnected_input_reason:
              'У входного порта рецепта нет входящей связи — материал не поступает на машину.',
            disconnected_input_detail:
              'Узел: {{nodeId}}\nМашина: {{machineLabel}}\nРецепт: {{recipeId}}\nВходной порт: {{portId}}\nПродукт: {{productLabel}}',
            stalled_machine: 'Машина не работает: нет нагрузки на выходе',
            stalled_machine_reason:
              'Теоретический выход > 0, но эффективная нагрузка и фактический поток на выходе ≈ 0: нет спроса downstream или не хватает входов.',
            stalled_machine_detail:
              'Узел: {{nodeId}}\nМашина: {{machineLabel}}\nРецепт: {{recipeId}}\nТеоретический выход: {{theoreticalRate}}/s\nЭффективная нагрузка: 0%',
            missing_node: 'Узел схемы не найден',
            missing_node_reason:
              'Связь ссылается на nodeId, которого нет в scheme.nodes.',
            missing_node_detail:
              'Связь: {{edgeId}}\nМаршрут: {{edgeRoute}}\nОтсутствующий узел: {{productId}}',
            missing_recipe: 'Рецепт не найден в данных модпака',
            missing_recipe_reason:
              'recipeId узла отсутствует в pack data текущей версии модпака — расчёт потоков невозможен.',
            missing_recipe_detail:
              'Узел: {{nodeId}}\nМашина: {{machineLabel}}\nРецепт: {{recipeId}}',
            invalid_source_port: 'Неверный выходной порт: {{portId}}',
            invalid_source_port_reason:
              'sourcePort не соответствует выходу рецепта (out_0 … out_N−1) или продукт на порту не определён.',
            invalid_source_port_detail:
              'Связь: {{edgeId}}\nМаршрут: {{edgeRoute}}\nУзел-источник: {{nodeId}}\nМашина: {{machineLabel}}\nВыходной порт: {{portId}}\nВыходов у рецепта: {{outputCount}}',
            invalid_target_port: 'Неверный входной порт: {{portId}}',
            invalid_target_port_reason:
              'targetPort не соответствует входу рецепта (in_0 … in_N−1). Такая связь обнуляет выход upstream в расчёте потоков.',
            invalid_target_port_detail:
              'Связь: {{edgeId}}\nМаршрут: {{edgeRoute}}\nУзел-приёмник: {{nodeId}}\nМашина: {{machineLabel}}\nВходной порт: {{portId}}\nВходов у рецепта: {{inputCount}}',
            product_mismatch: 'Несовместимые продукты: {{srcProduct}} → {{tgtProduct}}',
            product_mismatch_reason:
              'Продукт на выходе источника не совместим с продуктом на входе приёмника (portsMatch = false).',
            product_mismatch_detail:
              'Связь: {{edgeId}}\nМаршрут: {{edgeRoute}}\nПорты: {{portId}}\nНа выходе: {{srcProductLabel}}\nНа входе: {{tgtProductLabel}}',
            buffer_port_direction: 'Неверное направление порта буфера: {{portId}}',
            buffer_port_direction_reason:
              'Буфер отдаёт материал только через out-порт, принимает только через in-порт.',
            buffer_port_direction_detail:
              'Связь: {{edgeId}}\nМаршрут: {{edgeRoute}}\nУзел буфера: {{nodeId}}\nПорт: {{portId}}',
            edge_source_product_mismatch:
              'Продукт на связи не совпадает с выходом: {{edgeProduct}}',
            edge_source_product_mismatch_reason:
              'edge.productId не совпадает с продуктом рецепта на sourcePort (без совместимости по тегу).',
            edge_source_product_mismatch_detail:
              'Связь: {{edgeId}}\nМаршрут: {{edgeRoute}}\nПорт: {{portId}}\nВыход рецепта: {{srcProductLabel}}\nНа связи указано: {{edgeProductLabel}}',
            tag_input_unverified: 'Вход по тегу не проверен: {{tgtProduct}}',
            tag_input_unverified_reason:
              'Вход рецепта задан тегом (#…); pack data не проверяет, что продукт на связи входит в этот тег.',
            tag_input_unverified_detail:
              'Связь: {{edgeId}}\nМаршрут: {{edgeRoute}}\nПорт: {{portId}}\nВход (тег): {{tgtProductLabel}}\nНа связи: {{edgeProductLabel}}',
            target_missing_node: 'Цель производства указывает на отсутствующий узел',
            target_missing_node_reason:
              'Цель производства (targets[]) ссылается на nodeId, отсутствующий в схеме.',
            target_missing_node_detail: 'Отсутствующий узел: {{productId}}',
            target_on_buffer: 'Цель на буфере не учитывается расчётом',
            target_on_buffer_reason:
              'Солвер учитывает цели только на машинах; цель на буфере игнорируется.',
            target_on_buffer_detail:
              'Узел: {{nodeId}}\nМашина: {{machineLabel}}\nРецепт: {{recipeId}}',
            pack_version_missing: 'Версия модпака не найдена',
            pack_version_missing_reason:
              'scheme.meta.modpackVersion не найдена среди загруженных pack data.',
            pack_version_missing_detail: 'См. scheme.meta.modpackVersion в файле схемы.',
          },
        },
        buffer: {
          kind: {
            start_buffer: 'Стартовый буфер',
            intermediate_buffer: 'Промежуточный буфер',
            end_buffer: 'Конечный буфер',
          },
          capacity: 'Вместимость',
          supplyMode: 'Режим подачи',
          supplyModeRate: 'Постоянная скорость',
          supplyModeStock: 'Начальный запас',
          supplyRate: 'Скорость, /с',
          initialStock: 'Запас',
          autoRate: 'авто',
          unknownProduct: 'Ресурс',
          sidebarHint: 'Параметры редактируются на узле схемы.',
        },
        inspector: {
          selectElement: 'Выберите узел или связь на схеме',
          multiSelect: 'Выбрано элементов: {{count}}',
          settings: 'Настройки',
          calculation: 'Расчёт',
          balance: 'Баланс',
          ports: 'Порты',
          duration: 'Длительность',
          product: 'Продукт',
          portIn: 'Вход',
          portOut: 'Выход',
          portOpen: 'не подключён',
          edgeTitle: 'Связь',
          source: 'Источник',
          target: 'Цель',
          flowSource: 'Поток (источник)',
          flowTarget: 'Поток (приёмник)',
          noFlow: 'Нет потока',
          port: 'Порт',
        },
      },
      theme: {
        dark: 'Тёмная тема',
        light: 'Светлая тема',
        switchToLight: 'Включить светлую тему',
        switchToDark: 'Включить тёмную тему',
      },
    },
  },
  en: {
    translation: {
      appName: 'TFG Planner',
      nav: {
        home: 'Home',
        editor: 'Editor',
        versions: 'Versions',
      },
      home: {
        title: 'Production line planner',
        subtitle:
          'Flowcharts for TerraFirmaGreg-Modern. Build chains, scale production, save schemes as .tfgp.',
        openEditor: 'Open editor',
        openEditorLoading: 'Loading pack…',
        openEditorNeedPack: 'Select a modpack version first',
        openEditorRestoring: 'Restoring modpack data…',
        selectVersionHint: 'Pick a modpack version — recipe and machine data will load for the editor.',
        selectVersion: 'Select modpack version',
        modpackLink: 'Modpack-Modern repository',
        inspiration: 'Inspired by: Factorio Calculator',
      },
      versions: {
        title: 'Modpack versions',
        select: 'Load',
        active: 'Active',
        status: 'Status',
        noPacks: 'No versions available',
        loadingMeta: 'Loading meta…',
        recipesLazy: 'recipes on demand',
        restoringPack: 'restoring from cache…',
      },
      editor: {
        title: 'Scheme editor',
        schemeEditor: 'Flowchart editor',
        elementEditor: 'Element editor',
        schemeName: 'Name',
        schemeNamePlaceholder: 'Untitled',
        activePack: 'Active modpack version',
        selectPackOnHome: 'Select version on home',
        addMachine: 'Add machine',
        targetRate: 'Target rate',
        duplicate: 'Duplicate',
        undo: 'Undo',
        redo: 'Redo',
        export: 'Save .tfgp',
        import: 'Load .tfgp',
        importFailed: 'Failed to load .tfgp',
        dropScheme: 'Drop a .tfgp file to open',
        clearScheme: 'Clear scheme',
        clearSchemeConfirm:
          'Remove all nodes, edges, and targets? This cannot be undone.',
        noPack: 'No modpack version selected. Choose one on the home page first.',
        restoringPack: 'Restoring modpack {{version}}',
        machineCount: 'Machines',
        overclock: 'Overclock',
        machinesMeta: 'Machines x{{count}}',
        overclockMeta: 'Overclock {{value}}',
        voltageTier: 'Tier',
        energyHatchCount: 'Energy hatches',
        tierMeta: 'Tier {{value}}',
        circuitMeta: 'C:{{value}}',
        hatchesMeta: 'Hatches x{{count}}',
        energyMeta: '{{value}}',
        totalEuMeta: '{{value}} total',
        nodeLoadMeta: 'Load {{value}}',
        nodeLoadTitle:
          'Load {{load}} — min(connected inputs, output use)',
        maxLoadMeta: 'Max {{value}}',
        maxLoadTitle:
          'Max load {{load}} — min(connected inputs): speed ceiling at current supply',
        currentLoadMeta: 'Run {{value}}',
        currentLoadTitle:
          'Current load {{load}} — min(output use vs max-load capacity)',
        recipeThroughputTitle:
          'Current {{load}} — actual rate vs full recipe',
        loadUtilizationMeta: 'Load: {{current}} / {{max}}',
        portInputMaxLoadTitle: '{{load}} · {{received}} of {{demand}} (max load contribution)',
        portRecipeLoad: 'Rec {{value}}',
        portCapacityLoad: 'Cap {{value}}',
        portOutRecipeLoadTitle:
          'Recipe {{load}} · {{sent}} of {{produced}} (vs full recipe rate)',
        portOutCapacityLoadTitle:
          'Capacity {{load}} · {{sent}} of {{maxOutput}} (vs available at max load)',
        nodeOutputLoadMeta: 'Output use {{value}}',
        nodeOutputLoadTitle:
          'Output use {{load}} — share of production sent on edges',
        portLoadTitle: '{{load}} · {{received}} of {{demand}}',
        portLoadOpenTitle: '{{load}} · port open, requires {{demand}}',
        portOutConsumerLoadTitle:
          '{{load}} · {{sent}} of {{demand}} (downstream demand on this port)',
        portOutConsumerDemandTitle:
          'Supplies {{load}} of downstream port demand · {{sent}} of {{demand}}',
        portOutLoadOpenTitle: '{{load}} · port open, produces {{produced}}',
        parallel: 'Parallel',
        apply: 'Apply',
        ratePrompt: 'Rate per second',
        rateInvalid: 'Enter a positive number',
        flowNonConverged:
          'Flows did not converge within 50 iterations — values may be inaccurate.',
        selectNode: 'Select a node on the canvas',
        recipe: 'Recipe',
        recipeIn: 'In',
        recipeOut: 'Out',
        pickMachine: 'Machine',
        searchMachine: 'Search machines…',
        searchRecipe: 'Search recipes…',
        noMatches: 'No matches',
        deleteHint: 'Del — delete node or edge',
        flowComputing: 'Computing…',
        flowStale: 'Recalc pending…',
        portMenu: {
          buffers: 'Buffers',
          addDownstream: 'Add consumer',
          addUpstream: 'Add producer',
          addStartBuffer: 'Start buffer',
          addIntermediateBuffer: 'Intermediate buffer',
          addEndBuffer: 'End buffer',
          noRecipes: 'No matching recipes',
        },
        schemeCheck: {
          title: 'Scheme check',
          ok: 'No issues found',
          hint: 'Click a row to select nodes and edge on canvas. Red — error, amber — warning.',
          focusHint: 'Show on canvas',
          expandList: 'Show issue list',
          collapseList: 'Collapse issue list',
          errors: '{{count}} errors',
          warnings: '{{count}} warnings',
          errorGroup: 'Errors',
          warningGroup: 'Warnings',
          detailReason: 'Reason',
          issues: {
            disconnected_input: 'Input not connected: {{product}}',
            disconnected_input_reason:
              'The recipe input port has no incoming edge — material does not reach the machine.',
            disconnected_input_detail:
              'Node: {{nodeId}}\nMachine: {{machineLabel}}\nRecipe: {{recipeId}}\nInput port: {{portId}}\nProduct: {{productLabel}}',
            stalled_machine: 'Machine stalled: no output load',
            stalled_machine_reason:
              'Theoretical output > 0, but effective load and actual output flow ≈ 0: no downstream demand or insufficient inputs.',
            stalled_machine_detail:
              'Node: {{nodeId}}\nMachine: {{machineLabel}}\nRecipe: {{recipeId}}\nTheoretical output: {{theoreticalRate}}/s\nEffective load: 0%',
            missing_node: 'Scheme node not found',
            missing_node_reason:
              'The edge references a nodeId that is not present in scheme.nodes.',
            missing_node_detail:
              'Edge: {{edgeId}}\nRoute: {{edgeRoute}}\nMissing node: {{productId}}',
            missing_recipe: 'Recipe not found in modpack data',
            missing_recipe_reason:
              'The node recipeId is missing from pack data for the current modpack version — flow calculation is impossible.',
            missing_recipe_detail:
              'Node: {{nodeId}}\nMachine: {{machineLabel}}\nRecipe: {{recipeId}}',
            invalid_source_port: 'Invalid output port: {{portId}}',
            invalid_source_port_reason:
              'sourcePort does not match a recipe output (out_0 … out_N−1) or the port product is undefined.',
            invalid_source_port_detail:
              'Edge: {{edgeId}}\nRoute: {{edgeRoute}}\nSource node: {{nodeId}}\nMachine: {{machineLabel}}\nOutput port: {{portId}}\nRecipe outputs: {{outputCount}}',
            invalid_target_port: 'Invalid input port: {{portId}}',
            invalid_target_port_reason:
              'targetPort does not match a recipe input (in_0 … in_N−1). Such an edge zeroes upstream output in flow calculation.',
            invalid_target_port_detail:
              'Edge: {{edgeId}}\nRoute: {{edgeRoute}}\nTarget node: {{nodeId}}\nMachine: {{machineLabel}}\nInput port: {{portId}}\nRecipe inputs: {{inputCount}}',
            product_mismatch: 'Incompatible products: {{srcProduct}} → {{tgtProduct}}',
            product_mismatch_reason:
              'The source output product is not compatible with the target input product (portsMatch = false).',
            product_mismatch_detail:
              'Edge: {{edgeId}}\nRoute: {{edgeRoute}}\nPorts: {{portId}}\nOutput side: {{srcProductLabel}}\nInput side: {{tgtProductLabel}}',
            buffer_port_direction: 'Wrong buffer port direction: {{portId}}',
            buffer_port_direction_reason:
              'A buffer outputs only via an out port and accepts only via an in port.',
            buffer_port_direction_detail:
              'Edge: {{edgeId}}\nRoute: {{edgeRoute}}\nBuffer node: {{nodeId}}\nPort: {{portId}}',
            edge_source_product_mismatch:
              'Edge product does not match output: {{edgeProduct}}',
            edge_source_product_mismatch_reason:
              'edge.productId does not match the recipe product on sourcePort (no tag compatibility).',
            edge_source_product_mismatch_detail:
              'Edge: {{edgeId}}\nRoute: {{edgeRoute}}\nPort: {{portId}}\nRecipe output: {{srcProductLabel}}\nEdge product: {{edgeProductLabel}}',
            tag_input_unverified: 'Tag input not verified: {{tgtProduct}}',
            tag_input_unverified_reason:
              'The recipe input is a tag (#…); pack data does not verify that the edge product belongs to that tag.',
            tag_input_unverified_detail:
              'Edge: {{edgeId}}\nRoute: {{edgeRoute}}\nPort: {{portId}}\nInput (tag): {{tgtProductLabel}}\nOn edge: {{edgeProductLabel}}',
            target_missing_node: 'Production target points to a missing node',
            target_missing_node_reason:
              'A production target (targets[]) references a nodeId that is not in the scheme.',
            target_missing_node_detail: 'Missing node: {{productId}}',
            target_on_buffer: 'Target on buffer is ignored by the solver',
            target_on_buffer_reason:
              'The solver only applies targets on machines; a target on a buffer is ignored.',
            target_on_buffer_detail:
              'Node: {{nodeId}}\nMachine: {{machineLabel}}\nRecipe: {{recipeId}}',
            pack_version_missing: 'Modpack version not found',
            pack_version_missing_reason:
              'scheme.meta.modpackVersion was not found among loaded pack data.',
            pack_version_missing_detail: 'See scheme.meta.modpackVersion in the scheme file.',
          },
        },
        buffer: {
          kind: {
            start_buffer: 'Start buffer',
            intermediate_buffer: 'Intermediate buffer',
            end_buffer: 'End buffer',
          },
          capacity: 'Capacity',
          supplyMode: 'Supply mode',
          supplyModeRate: 'Constant rate',
          supplyModeStock: 'Initial stock',
          supplyRate: 'Rate, /s',
          initialStock: 'Stock',
          autoRate: 'auto',
          unknownProduct: 'Resource',
          sidebarHint: 'Edit parameters on the canvas node.',
        },
        inspector: {
          selectElement: 'Select a node or edge on the canvas',
          multiSelect: '{{count}} elements selected',
          settings: 'Settings',
          calculation: 'Calculation',
          balance: 'Balance',
          ports: 'Ports',
          duration: 'Duration',
          product: 'Product',
          portIn: 'In',
          portOut: 'Out',
          portOpen: 'not connected',
          edgeTitle: 'Edge',
          source: 'Source',
          target: 'Target',
          flowSource: 'Flow (source)',
          flowTarget: 'Flow (target)',
          noFlow: 'No flow',
          port: 'Port',
        },
      },
      theme: {
        dark: 'Dark theme',
        light: 'Light theme',
        switchToLight: 'Switch to light theme',
        switchToDark: 'Switch to dark theme',
      },
    },
  },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: 'ru',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
