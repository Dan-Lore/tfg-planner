import type { Node } from '@babel/types';

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
