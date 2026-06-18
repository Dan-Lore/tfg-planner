# Export effective RecipeManager from a full TFG modpack server load.
param(
  [string]$Tag = "0.12.8",
  [switch]$SkipFetch
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$ParserRoot = Join-Path $RepoRoot "tools\parser"
$CacheDir = Join-Path $RepoRoot ".cache\tfg-snapshot"
$WorkDir = Join-Path $CacheDir $Tag
$OutDir = Join-Path $ParserRoot "snapshots\$Tag"
$ExportScript = Join-Path $ParserRoot "snapshot\kubejs-export-recipes.js"
$ServerTimeoutMin = 120
$MinRecipes = 6000

function Resolve-Java {
  $candidates = @()
  if ($env:JAVA_HOME) { $candidates += (Join-Path $env:JAVA_HOME "bin\java.exe") }
  foreach ($pattern in @(
    "C:\Program Files\Microsoft\jdk-21*",
    "C:\Program Files\Eclipse Adoptium\jdk-21*",
    "C:\Program Files\Microsoft\jdk-17*",
    "C:\Program Files\Eclipse Adoptium\jdk-17*"
  )) {
    $candidates += Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName "bin\java.exe" }
  }
  foreach ($java in $candidates) {
    if (Test-Path $java) { return $java }
  }
  throw "JDK 17+ required. Set JAVA_HOME."
}

function Get-ModpackCacheKey([string]$t) {
  $bytes = [Text.Encoding]::UTF8.GetBytes("TerraFirmaGreg-Team/Modpack-Modern@$t")
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
  return ([BitConverter]::ToString($hash).Replace("-", "").ToLower()).Substring(0, 16)
}

function Get-ModpackRoot {
  $key = Get-ModpackCacheKey $Tag
  $base = Join-Path $RepoRoot ".cache\modpack\$key"
  $root = Join-Path $base "Modpack-Modern-$Tag"
  if (-not (Test-Path $root)) {
    Write-Host "Fetching modpack tag $Tag..."
    node (Join-Path $RepoRoot "tools\parser\scripts\fetch-modpack-tag.mjs") $Tag
  }
  if (-not (Test-Path $root)) { throw "Modpack root missing: $root" }
  return $root
}

Write-Host "TFG snapshot export for tag $Tag"
$Java = Resolve-Java
$ModpackRoot = Get-ModpackRoot
$reuseWorkDir = $SkipFetch -and (Test-Path (Join-Path $WorkDir "mods"))

if (-not $reuseWorkDir) {
  if (Test-Path $WorkDir) {
    try {
      Remove-Item -Recurse -Force $WorkDir -ErrorAction Stop
    } catch {
      $WorkDir = Join-Path $CacheDir "$Tag-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
      Write-Host "WorkDir locked; using $WorkDir"
    }
  }
  New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
  Copy-Item -Path (Join-Path $ModpackRoot "*") -Destination $WorkDir -Recurse -Force
  $kubeExport = Join-Path $WorkDir "kubejs\server_scripts\_tfg_planner_export.js"
  Copy-Item -Path $ExportScript -Destination $kubeExport -Force
} else {
  Write-Host "Reusing workdir $WorkDir (SkipFetch)"
  $serverOverridesSrc = Join-Path $ModpackRoot ".pakku\server-overrides"
  $serverOverridesDst = Join-Path $WorkDir ".pakku\server-overrides"
  Copy-Item -Path (Join-Path $serverOverridesSrc "*") -Destination $serverOverridesDst -Recurse -Force
  $kubeExport = Join-Path $WorkDir "kubejs\server_scripts\_tfg_planner_export.js"
  Copy-Item -Path $ExportScript -Destination $kubeExport -Force
}

node (Join-Path $RepoRoot "tools\parser\scripts\prepare-server-overrides.mjs") $WorkDir

$pakkuJar = Join-Path $WorkDir "pakku.jar"
if (-not (Test-Path $pakkuJar)) {
  throw "pakku.jar missing in modpack root"
}

$hasMods = Test-Path (Join-Path $WorkDir "mods")
if (-not $SkipFetch -or -not $hasMods) {
  Write-Host "pakku fetch..."
  Push-Location $WorkDir
  & $Java -jar $pakkuJar -y fetch
  if ($LASTEXITCODE -ne 0) { throw "pakku fetch failed" }
  Pop-Location
} else {
  Write-Host "Skipping pakku fetch (mods present)"
}

Write-Host "pakku export..."
Push-Location $WorkDir
& $Java -jar $pakkuJar -y export
if ($LASTEXITCODE -ne 0) { throw "pakku export failed" }
Pop-Location

$serverPackDir = Join-Path $WorkDir "build\serverpack"
$serverZip = Get-ChildItem -Path $serverPackDir -Filter "*.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $serverZip) { throw "No serverpack zip in $serverPackDir" }

$serverRunDir = Join-Path $WorkDir "server-run"
New-Item -ItemType Directory -Path $serverRunDir -Force | Out-Null
Expand-Archive -Path $serverZip.FullName -DestinationPath $serverRunDir -Force

# Re-inject export script into extracted server pack (export may omit kubejs timing)
$serverKube = Join-Path $serverRunDir "kubejs\server_scripts"
New-Item -ItemType Directory -Path $serverKube -Force | Out-Null
Copy-Item -Path $ExportScript -Destination (Join-Path $serverKube "_tfg_planner_export.js") -Force

$eula = Join-Path $serverRunDir "eula.txt"
"eula=true" | Set-Content -Path $eula -Encoding ASCII

$starterJar = Join-Path $serverRunDir "minecraft_server.jar"
if (-not (Test-Path $starterJar)) { throw "minecraft_server.jar missing in server pack" }

Write-Host "Starting server (timeout ${ServerTimeoutMin}m)..."
$exportFile = Join-Path $serverRunDir "logs\tfg-planner-recipe-snapshot\recipes.json"
$serverArgs = @("-jar", $starterJar, "-Xmx6024M", "-Xms1024M", "nogui")
$proc = Start-Process -FilePath $Java -ArgumentList $serverArgs -WorkingDirectory $serverRunDir -PassThru -NoNewWindow
$deadline = (Get-Date).AddMinutes($ServerTimeoutMin)

while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 20
  if (Test-Path $exportFile) { break }
  if ($proc.HasExited -and -not (Test-Path $exportFile)) {
    $latestLog = Get-ChildItem (Join-Path $serverRunDir "logs") -Filter "latest.log" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($latestLog) {
      Write-Host "--- latest.log tail ---"
      Get-Content $latestLog.FullName -Tail 30
    }
    throw "Server exited before export. Check logs in $serverRunDir\logs"
  }
}

if (-not (Test-Path $exportFile)) {
  if (-not $proc.HasExited) { $proc.Kill() }
  throw "Export timeout. Expected $exportFile"
}

if (-not $proc.HasExited) {
  Start-Sleep -Seconds 3
  $proc.Kill()
}

$recipes = Get-Content $exportFile -Raw | ConvertFrom-Json
if ($recipes.Count -lt $MinRecipes) {
  throw "Only $($recipes.Count) recipes exported (expected >= $MinRecipes)"
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
Copy-Item -Path $exportFile -Destination (Join-Path $OutDir "recipes.json") -Force

$lockPath = Join-Path $ModpackRoot "pakku-lock.json"
$lockBytes = [IO.File]::ReadAllBytes($lockPath)
$lockSha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($lockBytes)).Replace("-", "").ToLower()

$markerIds = @(
  "gtceu:pyrolyse_oven/log_to_charcoal_byproducts",
  "gtceu:distill_charcoal_byproducts",
  "gtceu:distill_wood_tar"
)
$recipeIds = [System.Collections.Generic.HashSet[string]]::new()
foreach ($r in $recipes) { [void]$recipeIds.Add([string]$r.id) }
$foundMarkers = $markerIds | Where-Object { $recipeIds.Contains($_) }

$recipesPath = Join-Path $OutDir "recipes.json"
$recipesSha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([IO.File]::ReadAllBytes($recipesPath))).Replace("-", "").ToLower()

$manifest = @{
  schemaVersion = 1
  modpackTag = $Tag
  pakkuLockSha256 = $lockSha
  recipeCount = $recipes.Count
  exportedAt = (Get-Date).ToUniversalTime().ToString("o")
  markerRecipeIds = @($foundMarkers)
  snapshotSha256 = $recipesSha
  source = "generate-tfg-snapshot"
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $OutDir "snapshot-manifest.json") -Encoding UTF8

Write-Host "Snapshot written: $OutDir ($($recipes.Count) recipes, markers: $($foundMarkers.Count)/$($markerIds.Count))"
