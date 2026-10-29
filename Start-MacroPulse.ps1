param(
    [switch]$Refresh,
    [switch]$RunExperiment,
    [switch]$NoTimesFM,
    [int]$Port = 8000
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$researchCli = Join-Path $PSScriptRoot '.venv\Scripts\macropulse.exe'
if (-not (Test-Path -LiteralPath $researchCli)) {
    throw 'Create the .venv environment and install MacroPulse using README.md first.'
}
$builtIndex = Join-Path $PSScriptRoot 'frontend\dist\index.html'
$buildInputs = @(Get-ChildItem -LiteralPath 'frontend\src' -Recurse -File)
$buildInputs += Get-Item -LiteralPath 'frontend\package.json','frontend\package-lock.json','frontend\vite.config.ts','frontend\index.html'
$needsBuild = -not (Test-Path -LiteralPath $builtIndex)
if (-not $needsBuild) {
    $lastBuild = (Get-Item -LiteralPath $builtIndex).LastWriteTimeUtc
    $needsBuild = @($buildInputs | Where-Object { $_.LastWriteTimeUtc -gt $lastBuild }).Count -gt 0
}
if ($needsBuild) {
    $installedLock = 'frontend\node_modules\.package-lock.json'
    $needsInstall = -not (Test-Path -LiteralPath $installedLock)
    if (-not $needsInstall) {
        $needsInstall = (Get-Item -LiteralPath 'frontend\package-lock.json').LastWriteTimeUtc -gt (Get-Item -LiteralPath $installedLock).LastWriteTimeUtc
    }
    if ($needsInstall) {
        npm.cmd ci --prefix frontend
        if ($LASTEXITCODE -ne 0) { throw 'Frontend install failed.' }
    }
    npm.cmd run build --prefix frontend
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
}
if ($Refresh -or -not (Test-Path -LiteralPath 'data\processed\spy.parquet')) {
    & $researchCli refresh
    if ($LASTEXITCODE -ne 0) { throw 'Market data refresh failed.' }
}
$researchPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$hasExperiment = & $researchPython -c "from macropulse.config import settings; from macropulse.storage import ResearchStore; print(int(ResearchStore(settings.database).latest() is not None))"
if ($RunExperiment -or $hasExperiment -ne '1') {
    if ($NoTimesFM) { & $researchCli experiment --no-timesfm }
    else { & $researchCli experiment }
    if ($LASTEXITCODE -ne 0) { throw 'Experiment failed.' }
}
Write-Host "MacroPulse: http://127.0.0.1:$Port (Ctrl+C to stop)"
& $researchCli serve --port $Port
