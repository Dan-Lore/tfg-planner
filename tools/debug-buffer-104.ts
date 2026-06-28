import { readFileSync } from 'node:fs';
import { parseTfgp } from '@/schema/tfgp';
import { loadTestPack } from '@/test-fixtures/load-test-pack';
import { normalizeSchemeNodes, runSolver } from '@/stores/editor-utils';

const scheme = parseTfgp(readFileSync('Untitled (30).tfgp', 'utf8'));
const pack = loadTestPack('0.12.8');
const nodes = normalizeSchemeNodes(scheme.nodes, pack);
const result = runSolver(
  { nodes, edges: scheme.edges, targets: scheme.targets, viewport: scheme.viewport },
  pack,
  { preserveManualMachineCounts: true },
);

const inRate = result.nodeInputRates.node_104;
const outRate = result.nodePortOutputRates.node_104?.out_0;
const load = result.nodeLoad.node_104;
const surplus = result.nodeSurplus.node_104;

console.log('input rates:', inRate);
console.log('port out_0:', outRate?.toNumber());
console.log('node load:', load?.toNumber(), `(${(load?.toNumber() ?? 0) * 100}%)`);
console.log('surplus:', surplus);

console.log('\nOutgoing edges from node_104:');
for (const e of scheme.edges.filter((e) => e.source === 'node_104')) {
  console.log(`  ${e.id} -> ${e.target}: ${result.edgeFlows[e.id]?.toNumber().toFixed(4)}/s`);
}
