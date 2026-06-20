import type { Node } from '@babel/types';
import {
  energyFromTierAndAmperage,
  energyFromVoltageAndAmperage,
  inferEnergyFromFlatEUt,
  tierFromGtValuesMember,
} from '../../energy-parse.js';
import type { EnergyStack } from '../../energy-parse.js';

/** Best-effort static evaluation of simple numeric expressions (20*10, 250). */
export function evalNumeric(node: Node | null | undefined): number | undefined {
  if (!node) return undefined;
  switch (node.type) {
    case 'NumericLiteral':
      return node.value;
    case 'UnaryExpression':
      if (node.operator === '-') {
        const v = evalNumeric(node.argument);
        return v !== undefined ? -v : undefined;
      }
      return undefined;
    case 'BinaryExpression':
      if (node.operator !== '+' && node.operator !== '*' && node.operator !== '-') {
        return undefined;
      }
      const left = evalNumeric(node.left);
      const right = evalNumeric(node.right);
      if (left === undefined || right === undefined) return undefined;
      if (node.operator === '+') return left + right;
      if (node.operator === '-') return left - right;
      return left * right;
    default:
      return undefined;
  }
}

export function stringLiteral(node: Node | null | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((q) => q.value.cooked ?? '').join('');
  }
  return undefined;
}

function tierNameFromProperty(prop: Node): string | undefined {
  if (prop.type === 'MemberExpression' && prop.object.type === 'Identifier' && prop.object.name === 'GTValues') {
    if (prop.property.type === 'Identifier') return prop.property.name;
  }
  if (prop.type === 'Identifier') return prop.name;
  return undefined;
}

/** Parse GTValues.VA[GTValues.TIER], GTValues.V[TIER], or flat EU/t literal. */
export function evalGtEnergy(node: Node | null | undefined): EnergyStack | undefined {
  if (!node) return undefined;

  if (node.type === 'MemberExpression') {
    const obj = node.object;
    const prop = node.property;

    if (
      obj.type === 'MemberExpression' &&
      obj.object.type === 'Identifier' &&
      obj.object.name === 'GTValues' &&
      obj.property.type === 'Identifier' &&
      (obj.property.name === 'VA' || obj.property.name === 'V')
    ) {
      const tierName = tierNameFromProperty(prop);
      const tier = tierName ? tierFromGtValuesMember(tierName) : undefined;
      if (tier) return energyFromTierAndAmperage(tier, 1);
    }
  }

  const n = evalNumeric(node);
  if (n !== undefined) return inferEnergyFromFlatEUt(n);
  return undefined;
}

export function evalGtEnergyEUtArgs(args: Node[]): EnergyStack | undefined {
  const first = evalGtEnergy(args[0]);
  if (!first) return undefined;
  if (args.length < 2) return first;
  const second = evalNumeric(args[1]);
  if (second === undefined) return first;
  return (
    energyFromVoltageAndAmperage(first.voltage, second) ?? {
      ...first,
      amperage: second,
    }
  );
}
