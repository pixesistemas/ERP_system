# Descarga el backup de la base de producción para verlo con Navicat (SQLite).
#
# Uso:
#   $env:ERP_BACKUP_KEY = "tu-clave-de-backup"
#   .\scripts\descargar-backup.ps1
#
# Después abrí el archivo descargado en Navicat con una conexión SQLite.
param(
  [string]$BaseUrl = $env:ERP_BASE_URL,
  [string]$Key = $env:ERP_BACKUP_KEY,
  [string]$Destino = "$env:USERPROFILE\Documents\erp-produccion.db"
)

if (-not $BaseUrl) { $BaseUrl = "https://erp.pixesistemas.com.ar" }
if (-not $Key) {
  Write-Error "Falta la clave de backup. Definí ERP_BACKUP_KEY (la misma BACKUP_API_KEY del servidor) o pasá -Key."
  exit 1
}

Write-Host "Creando backup en $BaseUrl ..."
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/backup" -Headers @{ "x-backup-key" = $Key } | Out-Null

Write-Host "Descargando backup ..."
Invoke-WebRequest -Uri "$BaseUrl/api/v1/backup/descargar" -Headers @{ "x-backup-key" = $Key } -OutFile $Destino

Write-Host "Listo: $Destino"
Write-Host "Abrilo en Navicat con una conexión SQLite (Connection -> SQLite -> seleccionar el archivo)."
