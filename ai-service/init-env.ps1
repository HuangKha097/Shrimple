[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '.env')
)

$ErrorActionPreference = 'Stop'
$targetPath = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $targetPath) {
    Write-Output 'Translation env already exists; no changes made.'
    return
}

$keyBytes = New-Object byte[] 32
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $generator.GetBytes($keyBytes)
} finally {
    $generator.Dispose()
}
$content = "TRANSLATION_AI_KEY=$([Convert]::ToBase64String($keyBytes))`n"
$encoded = [System.Text.UTF8Encoding]::new($false).GetBytes($content)
# CreateNew also prevents overwriting a file created by another process.
$file = [System.IO.File]::Open($targetPath, [System.IO.FileMode]::CreateNew)
try {
    $file.Write($encoded, 0, $encoded.Length)
} finally {
    $file.Dispose()
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)
}
Write-Output 'Created translation env with a random key. Compose shares it with backend and AI.'
