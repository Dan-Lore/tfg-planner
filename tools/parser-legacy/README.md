# Parser legacy (KubeJS AST)

The `tools/parser/src/kubejs/` tree is **not** on the production `build-pack --strict-snapshot` path.
Production recipes come from the RecipeManager snapshot (`snapshots/<tag>/recipes.json`).

KubeJS AST extractors remain for:

- dev/validate tooling (`enrich-chances`, apply-removes selectors)
- unit tests under `tools/parser/tests/`

Future cleanup may move this tree here as `tools/parser-legacy/` once chance-enrichment no longer depends on AST parsing.
