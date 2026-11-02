# Keep the GPU override on every start; plain compose.yaml selects CPU.
[CmdletBinding()]
param([switch]$SkipBuild, [switch]$Rebuild)

$ErrorActionPreference = 'Stop'
$taskRepoRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRepoRoot
try {
    $taskCompose = @('compose', '-p', 'shrimple', '-f', 'compose.yaml', '-f', 'compose.gpu.yaml')
    & docker @taskCompose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'GPU Compose configuration is invalid.' }
    if ($SkipBuild -and $Rebuild) { throw 'Choose either -SkipBuild or -Rebuild.' }
    & docker image inspect shrimple-whisper-cuda --format '{{.Id}}' *> $null
    $taskWhisperMissing = $LASTEXITCODE -ne 0
    if (-not $SkipBuild -and ($taskWhisperMissing -or $Rebuild)) {
        & docker @taskCompose build whisper
        if ($LASTEXITCODE -ne 0) { throw 'GPU/AI image build failed.' }
    }
    if (-not $SkipBuild) {
        & docker @taskCompose build ai
        if ($LASTEXITCODE -ne 0) { throw 'AI image build failed.' }
    }
    # Reconfigure both services together: Whisper uses CUDA; AI schedules CPU VAD/MT.
    & docker @taskCompose up -d --no-deps --wait --wait-timeout 180 whisper ai
    if ($LASTEXITCODE -ne 0) { throw 'GPU translation services did not become ready.' }
    Write-Output 'Shrimple: Whisper ASR on GPU; VAD and text translation on CPU.'
}
finally {
    Pop-Location
}
