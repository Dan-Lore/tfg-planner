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
