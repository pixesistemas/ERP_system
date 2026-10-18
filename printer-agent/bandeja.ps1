# Bandeja del sistema para el agente de impresion (Windows).
# Muestra un icono junto al reloj con opciones para ver el registro,
# reiniciar o cerrar el agente. El agente corre oculto como hijo de este
# proceso; si se cierra la bandeja, se cierra el agente.
#
# Se lanza con iniciar-con-bandeja.vbs (sin ventanas).

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$logPath = Join-Path $pasta "agente.log"
$exe = Join-Path $pasta "pixe-print-agent.exe"
$server = Join-Path $pasta "server.js"

$puerto = 17777
$cfgPath = Join-Path $pasta "config.json"
if (Test-Path $cfgPath) {
  try { $puerto = [int](Get-Content $cfgPath -Raw | ConvertFrom-Json).puerto } catch { }
}

# Una sola bandeja por PC.
$mutex = New-Object System.Threading.Mutex($false, "Global\PixePrintAgentBandeja")
if (-not $mutex.WaitOne(0)) { exit }

$script:proceso = $null

function Iniciar-Agente {
  if (Test-Path $exe) {
    $script:proceso = Start-Process -FilePath $exe -WorkingDirectory $pasta -WindowStyle Hidden -PassThru
  } else {
    $script:proceso = Start-Process -FilePath "node" -ArgumentList "`"$server`"" -WorkingDirectory $pasta -WindowStyle Hidden -PassThru
  }
}

function Detener-Agente {
  if ($script:proceso -and -not $script:proceso.HasExited) {
    Stop-Process -Id $script:proceso.Id -Force -ErrorAction SilentlyContinue
  }
  try {
    Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  } catch { }
}

function Estado-Agente {
  try {
    $escuchando = Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue
    if ($escuchando) { return "corriendo" } else { return "detenido" }
  } catch { return "desconocido" }
}

Iniciar-Agente

$icono = New-Object System.Windows.Forms.NotifyIcon
$icono.Icon = [System.Drawing.SystemIcons]::Information
$icono.Text = "PixeSistemas - Agente de impresion (puerto $puerto)"
$icono.Visible = $true
$icono.BalloonTipTitle = "Agente de impresion"
$icono.BalloonTipText = "Activo en el puerto $puerto. Clic derecho en este icono para opciones."
$icono.ShowBalloonTip(4000)

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$itemEstado = New-Object System.Windows.Forms.ToolStripMenuItem
$itemEstado.Text = "Estado: $((Estado-Agente))"
$itemEstado.Enabled = $false
$menu.Items.Add($itemEstado) | Out-Null

$menu.Items.Add("-") | Out-Null
$menu.Items.Add("Ver registro (agente.log)", $null, {
    if (Test-Path $logPath) { Start-Process notepad.exe $logPath }
    else { [System.Windows.Forms.MessageBox]::Show("Todavia no hay registro.") | Out-Null }
  }) | Out-Null
$menu.Items.Add("Abrir carpeta del agente", $null, { Start-Process explorer.exe $pasta }) | Out-Null
$menu.Items.Add("Reiniciar agente", $null, {
    Detener-Agente
    Start-Sleep -Milliseconds 600
    Iniciar-Agente
    [System.Windows.Forms.MessageBox]::Show("Agente reiniciado.") | Out-Null
  }) | Out-Null
$menu.Items.Add("-") | Out-Null
$menu.Items.Add("Detener y salir", $null, {
    Detener-Agente
    $icono.Visible = $false
    [System.Windows.Forms.Application]::Exit()
  }) | Out-Null

$icono.ContextMenuStrip = $menu

$icono.add_MouseClick({
    if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
      $menu.Show([System.Windows.Forms.Cursor]::Position)
    }
  })

$icono.add_MouseDoubleClick({
    $mensaje = "PixeSistemas - Agente de impresion`n`nEstado: $((Estado-Agente))`nPuerto: $puerto`nCarpeta: $pasta"
    [System.Windows.Forms.MessageBox]::Show($mensaje, "Agente de impresion") | Out-Null
  })

[System.Windows.Forms.Application]::Run()
Detener-Agente
