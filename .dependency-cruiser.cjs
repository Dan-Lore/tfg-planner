/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-calculator-react',
      comment:
        'Calculator must stay framework-agnostic (docs/architecture.md §2.5).',
      severity: 'error',
      from: { path: '^src/calculator' },
      to: {
        path: '^(react|react-dom|react-router-dom|@xyflow/react|zustand|react-i18next)',
      },
    },
    {
      name: 'no-parser-react',
      comment: 'Parser CLI must not depend on the SPA stack.',
      severity: 'error',
      from: { path: '^tools/parser' },
      to: {
        path: '^(react|react-dom|react-router-dom|@xyflow/react|zustand|react-i18next)',
      },
    },
    {
      name: 'no-calculator-canvas',
      comment: 'Calculator must not import canvas UI layer.',
      severity: 'error',
      from: { path: '^src/calculator' },
      to: { path: '^src/canvas' },
    },
    {
      name: 'no-calculator-stores',
      comment: 'Calculator must not import Zustand stores.',
      severity: 'error',
      from: { path: '^src/calculator' },
      to: { path: '^src/stores' },
    },
    {
      name: 'no-calculator-pages',
      comment: 'Calculator must not import page components.',
      severity: 'error',
      from: { path: '^src/calculator' },
      to: { path: '^src/pages' },
    },
    {
      name: 'no-circular-calculator',
      comment: 'No circular dependencies within calculator/.',
      severity: 'error',
      from: { path: '^src/calculator' },
      to: { path: '^src/calculator', circular: true },
    },
    {
      name: 'no-circular-schema',
      comment: 'No circular dependencies within schema/.',
      severity: 'error',
      from: { path: '^src/schema' },
      to: { path: '^src/schema', circular: true },
    },
    {
      name: 'no-circular-lib',
      comment: 'No circular dependencies within lib/.',
      severity: 'error',
      from: { path: '^src/lib' },
      to: { path: '^src/lib', circular: true },
    },
    {
      name: 'no-stores-canvas',
      comment: 'Stores must not import canvas UI layer.',
      severity: 'error',
      from: { path: '^src/stores' },
      to: { path: '^src/canvas' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.app.json' },
    combinedDependencies: true,
    exclude: {
      path: [
        'node_modules',
        'dist',
        '\\.cache',
        'coverage',
        'public/data',
        'tools/parser/snapshots',
        'tools/parser/substrate-dumps',
      ],
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
