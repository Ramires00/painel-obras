# Restaura data\db.json a partir de um backup .zip (guarda o arquivo atual antes de substituir).
# Uso: powershell -ExecutionPolicy Bypass -File scripts\restaurar.ps1 -Arquivo backups\db_2026-09-24_101500.zip

param([Parameter(Mandatory = $true)][string]$Arquivo)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$destino = Join-Path $raiz "data\db.json"
$temp = Join-Path $env:TEMP ("restaurar_" + [guid]::NewGuid())

Expand-Archive -Path $Arquivo -DestinationPath $temp
$restaurado = Join-Path $temp "db.json"
Get-Content $restaurado -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null   # valida antes de restaurar

if (Test-Path $destino) { Copy-Item $destino "$destino.antes-da-restauracao" -Force }
Copy-Item $restaurado $destino -Force
Remove-Item $temp -Recurse -Force
Write-Output "Restaurado de $Arquivo (anterior salvo em data\db.json.antes-da-restauracao)"
