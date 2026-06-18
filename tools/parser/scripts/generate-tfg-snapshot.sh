#!/usr/bin/env bash
# Export effective RecipeManager from a full TFG modpack server load.
set -euo pipefail

TAG="${1:-0.12.8}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PARSER_ROOT="$REPO_ROOT/tools/parser"
CACHE_DIR="$REPO_ROOT/.cache/tfg-snapshot"
WORK_DIR="$CACHE_DIR/$TAG"
OUT_DIR="$PARSER_ROOT/snapshots/$TAG"
EXPORT_SCRIPT="$PARSER_ROOT/snapshot/kubejs-export-recipes.js"
SERVER_TIMEOUT_MIN=120
MIN_RECIPES=6000

if [[ -z "${JAVA_HOME:-}" ]]; then
  echo "JAVA_HOME must point to JDK 17+" >&2
  exit 1
fi
JAVA="$JAVA_HOME/bin/java"

node "$SCRIPT_DIR/fetch-modpack-tag.mjs" "$TAG"
KEY=$(printf 'TerraFirmaGreg-Team/Modpack-Modern@%s' "$TAG" | sha256sum | cut -c1-16)
MODPACK_ROOT="$REPO_ROOT/.cache/modpack/$KEY/Modpack-Modern-$TAG"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
cp -a "$MODPACK_ROOT/." "$WORK_DIR/"
cp "$EXPORT_SCRIPT" "$WORK_DIR/kubejs/server_scripts/_tfg_planner_export.js"
node "$SCRIPT_DIR/prepare-server-overrides.mjs" "$WORK_DIR"

(cd "$WORK_DIR" && "$JAVA" -jar pakku.jar -y fetch && "$JAVA" -jar pakku.jar -y export)

SERVER_ZIP="$(find "$WORK_DIR/build/serverpack" -name '*.zip' | head -n1)"
[[ -n "$SERVER_ZIP" ]] || { echo "No serverpack zip" >&2; exit 1; }

SERVER_RUN="$WORK_DIR/server-run"
mkdir -p "$SERVER_RUN"
unzip -q -o "$SERVER_ZIP" -d "$SERVER_RUN"
mkdir -p "$SERVER_RUN/kubejs/server_scripts"
cp "$EXPORT_SCRIPT" "$SERVER_RUN/kubejs/server_scripts/_tfg_planner_export.js"
echo "eula=true" > "$SERVER_RUN/eula.txt"

EXPORT_FILE="$SERVER_RUN/logs/tfg-planner-recipe-snapshot/recipes.json"
timeout "${SERVER_TIMEOUT_MIN}m" bash -c "cd '$SERVER_RUN' && '$JAVA' -jar minecraft_server.jar -Xmx6024M -Xms1024M nogui" || true

[[ -f "$EXPORT_FILE" ]] || { echo "Export missing: $EXPORT_FILE" >&2; exit 1; }

COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$EXPORT_FILE','utf8')).length)")
[[ "$COUNT" -ge "$MIN_RECIPES" ]] || { echo "Only $COUNT recipes (need $MIN_RECIPES)" >&2; exit 1; }

mkdir -p "$OUT_DIR"
cp "$EXPORT_FILE" "$OUT_DIR/recipes.json"
LOCK_SHA=$(sha256sum "$MODPACK_ROOT/pakku-lock.json" | awk '{print $1}')
RECIPES_SHA=$(sha256sum "$OUT_DIR/recipes.json" | awk '{print $1}')

node -e "
const fs=require('fs');
const recipes=JSON.parse(fs.readFileSync('$OUT_DIR/recipes.json','utf8'));
const markers=[
  'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
  'gtceu:distill_charcoal_byproducts',
  'gtceu:distill_wood_tar'
];
const ids=new Set(recipes.map(r=>r.id));
fs.writeFileSync('$OUT_DIR/snapshot-manifest.json', JSON.stringify({
  schemaVersion: 1,
  modpackTag: '$TAG',
  pakkuLockSha256: '$LOCK_SHA',
  recipeCount: recipes.length,
  exportedAt: new Date().toISOString(),
  markerRecipeIds: markers.filter(m=>ids.has(m)),
  snapshotSha256: '$RECIPES_SHA',
  source: 'generate-tfg-snapshot'
}, null, 2));
"
echo "Snapshot written: $OUT_DIR ($COUNT recipes)"
