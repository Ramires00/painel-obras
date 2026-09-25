# Backup do banco de dados do Painel de Obras (regra 3-2-1):
#   copia 1 = data\db.json (original)
#   copia 2 = .zip com data/hora em backups\ (mesmo disco)
#   copia 3 = mesmo .zip em outro destino (pendrive, HD externo ou pasta do OneDrive/Google Drive)
# Mantém só os N backups mais recentes em cada destino e registra tudo em backups\backup.log.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 [-DestinoExterno "D:\Backups"] [-Manter 14]

param(
    [string]$DestinoExterno = "",
    [int]$Manter = 14
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$origem = Join-Path $raiz "data\db.json"
$pastaLocal = Join-Path $raiz "backups"
$log = Join-Path $pastaLocal "backup.log"

function Registrar($mensagem) {
    $linha = "{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $mensagem
    Add-Content -Path $log -Value $linha -Encoding UTF8
    Write-Output $linha
}

function Limpar($pasta) {
    Get-ChildItem -Path $pasta -Filter "db_*.zip" |
        Sort-Object Name -Descending |
        Select-Object -Skip $Manter |
        ForEach-Object { Remove-Item $_.FullName; Registrar "Removido backup antigo: $($_.Name)" }
}

New-Item -ItemType Directory -Force -Path $pastaLocal | Out-Null

try {
    if (-not (Test-Path $origem)) { throw "Arquivo de origem não encontrado: $origem" }

    # Confere se o JSON está íntegro antes de fazer backup dele
    Get-Content $origem -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null

    $nome = "db_{0:yyyy-MM-dd_HHmmss}.zip" -f (Get-Date)
    $zipLocal = Join-Path $pastaLocal $nome
    Compress-Archive -Path $origem -DestinationPath $zipLocal
    $hash = (Get-FileHash $zipLocal -Algorithm SHA256).Hash
    Registrar "Backup local criado: $nome (SHA256 $hash)"
    Limpar $pastaLocal

    if ($DestinoExterno) {
        New-Item -ItemType Directory -Force -Path $DestinoExterno | Out-Null
        $zipExterno = Join-Path $DestinoExterno $nome
        Copy-Item $zipLocal $zipExterno
        # Verifica se a cópia externa é idêntica à local
        if ((Get-FileHash $zipExterno -Algorithm SHA256).Hash -ne $hash) { throw "Cópia externa corrompida: $zipExterno" }
        Registrar "Cópia externa verificada: $zipExterno"
        Limpar $DestinoExterno
    } else {
        Registrar "AVISO: sem destino externo (-DestinoExterno); regra 3-2-1 incompleta"
    }
    exit 0
}
catch {
    Registrar "ERRO: $($_.Exception.Message)"
    exit 1
}
