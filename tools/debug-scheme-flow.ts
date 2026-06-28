import { readFileSync } from 'node:fs';
import { parseTfgp } from '@/schema/tfgp';
import { loadTestPack } from '@/test-fixtures/load-test-pack';
import { normalizeSchemeNodes, runSolver } from '@/stores/editor-utils';
import { checkScheme } from '@/scheme-check/check-scheme';

const schemePath = process.argv[2] ?? 'Untitled (30).tfgp';
const scheme = parseTfgp(readFileSync(schemePath, 'utf8'));
const pack = loadTestPack(scheme.modpack.version);
const nodes = normalizeSchemeNodes(scheme.nodes, pack);
const snap = {
  nodes,
  edges: scheme.edges,
  targets: scheme.targets,
  viewport: scheme.viewport,
};

const recipeIds = new Set(
  nodes.filter((n) => 'recipeId' in n && n.recipeId).map((n) => (n as { recipeId: string }).recipeId),
);
const missing = [...recipeIds].filter((id) => !pack.recipes.some((r) => r.id === id));
console.log('Nodes:', nodes.length, 'Edges:', scheme.edges.length);
console.log('Recipes in scheme:', recipeIds.size, 'missing from pack:', missing);

const result = runSolver(snap, pack, { preserveManualMachineCounts: true });
const check = checkScheme(scheme, pack, { flowResult: result });

console.log('\nMachine outputs (effective out_0):');
for (const node of nodes) {
  if (!('machineId' in node)) {
    const load = result.nodeLoad[node.id];
    console.log(`  ${node.id} [${node.kind}]: load=${load?.toNumber() ?? '?'}`);
    continue;
  }
  const eff = result.nodeEffectivePortOutputRates[node.id]?.out_0;
  const theor = result.nodePortOutputRates[node.id]?.out_0;
  const load = result.nodeLoad[node.id];
  console.log(
    `  ${node.id} (${node.machineId}): theor=${theor?.toNumber().toFixed(4) ?? '?'} eff=${eff?.toNumber().toFixed(4) ?? '?'} load=${load?.toNumber().toFixed(3) ?? '?'}`,
  );
}

console.log('\nEdge flows:');
for (const edge of scheme.edges) {
  const flow = result.edgeFlows[edge.id];
  console.log(`  ${edge.id}: ${flow?.toNumber().toFixed(4) ?? '0'} (${edge.fluidId ?? edge.itemId})`);
}

console.log('\nScheme check:', check.summary.errorCount, 'errors', check.summary.warningCount, 'warnings');
for (const issue of check.issues.slice(0, 10)) {
  console.log(`  [${issue.code}] ${issue.message}`);
}
