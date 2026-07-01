import { describe, expect, it } from 'vitest';
import type { PackData } from '@/data/types';
import type { SchemeIssue } from '@/scheme-check/check-scheme';
import {
  formatSchemeIssueDetail,
  formatSchemeIssueSummary,
} from '@/scheme-check/format-scheme-issue';

const pack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test',
  dataVersion: 1,
  generatedAt: '',
  machines: [
    {
      id: 'gtceu:large_chemical_reactor',
      category: 'multiblock',
      recipeIds: [],
      names: { ru: 'Большой химический реактор', en: 'Large Chemical Reactor' },
    },
  ],
  items: [
    {
      id: 'gtceu:copper_dust',
      names: { ru: 'Медная пыль', en: 'Copper Dust' },
    },
  ],
  fluids: [],
  recipes: [],
};

const nodes = [
  {
    id: 'node_49',
    machineId: 'gtceu:large_chemical_reactor',
    recipeId: 'tfg:electrolyze_syngas@lcr',
    machineCount: 1,
    overclock: 1,
    parallel: 1,
    voltageTier: 'LV' as const,
    position: { x: 0, y: 0 },
  },
];

const issue: SchemeIssue = {
  severity: 'warning',
  code: 'disconnected_input',
  message: 'fallback',
  nodeId: 'node_49',
  context: {
    machineId: 'gtceu:large_chemical_reactor',
    recipeId: 'tfg:electrolyze_syngas@lcr',
    portId: 'in_0',
    productId: 'gtceu:copper_dust',
  },
};

const t = (key: string, params?: Record<string, string>) => {
  if (key === 'editor.schemeCheck.issues.disconnected_input') {
    return `Не подключён вход: ${params?.product ?? ''}`;
  }
  if (key === 'editor.schemeCheck.detailReason') {
    return 'Основание';
  }
  if (key === 'editor.schemeCheck.issues.disconnected_input_reason') {
    return 'У входного порта рецепта нет входящей связи — материал не поступает на машину.';
  }
  if (key === 'editor.schemeCheck.issues.disconnected_input_detail') {
    return [
      `Узел: ${params?.nodeId ?? ''}`,
      `Машина: ${params?.machineLabel ?? ''}`,
      `Рецепт: ${params?.recipeId ?? ''}`,
      `Входной порт: ${params?.portId ?? ''}`,
      `Продукт: ${params?.productLabel ?? ''}`,
    ].join('\n');
  }
  return key;
};

describe('formatSchemeIssue', () => {
  it('formats disconnected_input summary with product name', () => {
    const summary = formatSchemeIssueSummary(issue, pack, 'ru', nodes, [], t);
    expect(summary).toBe('Не подключён вход: Медная пыль');
  });

  it('formats disconnected_input detail with reason and labeled fields', () => {
    const detail = formatSchemeIssueDetail(issue, pack, 'ru', nodes, [], t);
    expect(detail).toBe(
      [
        'Основание: У входного порта рецепта нет входящей связи — материал не поступает на машину.',
        '',
        'Узел: node_49',
        'Машина: Большой химический реактор (gtceu:large_chemical_reactor)',
        'Рецепт: tfg:electrolyze_syngas@lcr',
        'Входной порт: in_0',
        'Продукт: Медная пыль (gtceu:copper_dust)',
      ].join('\n'),
    );
  });
});
