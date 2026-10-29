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
if (-not (Test-Path -LiteralPath 'frontend\dist\index.html')) {
    npm.cmd ci --prefix frontend
    if ($LASTEXITCODE -ne 0) { throw 'Frontend install failed.' }
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
