# Keep the GPU override on every start; plain compose.yaml selects CPU.
[CmdletBinding()]
param([switch]$SkipBuild, [switch]$Rebuild)

$ErrorActionPreference = 'Stop'
$taskRepoRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRepoRoot
try {
    $taskCompose = @('compose', '-p', 'shrimple', '-f', 'compose.yaml', '-f', 'compose.gpu.yaml')
    # Vietnamese weights are exported locally; never replace them with base.
    $taskExport = Join-Path $PSScriptRoot 'training/runs/phowhisper-base-trial/ggml/ggml-model.bin'
    $taskChecksum = "$taskExport.sha256"
    if (-not (Test-Path -LiteralPath $taskExport) -or -not (Test-Path -LiteralPath $taskChecksum)) {
        throw 'Run training/prepare_phowhisper.py with the research Python environment first.'
    }
    $taskExpected = ((Get-Content -LiteralPath $taskChecksum -Raw).Trim() -split '\s+')[0]
    if ((Get-FileHash -LiteralPath $taskExport -Algorithm SHA256).Hash -ne $taskExpected) {
        throw 'PhoWhisper export checksum mismatch.'
    }
    & docker @taskCompose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'GPU Compose configuration is invalid.' }
    if ($SkipBuild -and $Rebuild) { throw 'Choose either -SkipBuild or -Rebuild.' }
    if (-not $SkipBuild) {
        & docker @taskCompose build whisper
        if ($LASTEXITCODE -ne 0) { throw 'GPU/AI image build failed.' }
    }
    if (-not $SkipBuild) {
        & docker @taskCompose build ai
        if ($LASTEXITCODE -ne 0) { throw 'AI image build failed.' }
    }
    # Both recognizers share the bounded ASR lane; VAD/MT run on CPU.
    & docker @taskCompose up -d --no-deps --wait --wait-timeout 180 whisper phowhisper ai
    if ($LASTEXITCODE -ne 0) { throw 'GPU translation services did not become ready.' }
    Write-Output 'Shrimple: PhoWhisper (vi) + Whisper (en) on GPU; VAD and translation on CPU.'
}
finally {
    Pop-Location
}
