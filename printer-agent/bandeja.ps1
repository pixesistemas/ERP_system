# Bandeja del sistema para el agente de impresion (Windows).
# Muestra un icono junto al reloj con el estado, los datos de conexion
# (URL + token para copiar), el registro y las opciones de reiniciar/cerrar.
# El agente corre oculto como hijo de este proceso.
#
# Se lanza con iniciar-con-bandeja.vbs (sin ventanas).

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$logPath = Join-Path $pasta "agente.log"
$exe = Join-Path $pasta "pixe-print-agent.exe"
$server = Join-Path $pasta "server.js"

$cfgPath = Join-Path $pasta "config.json"
$primeraVez = -not (Test-Path $cfgPath)

$puerto = 17777
if (Test-Path $cfgPath) {
  try { $puerto = [int](Get-Content $cfgPath -Raw | ConvertFrom-Json).puerto } catch { }
}

# Una sola bandeja por PC.
$mutex = New-Object System.Threading.Mutex($false, "Global\PixePrintAgentBandeja")
if (-not $mutex.WaitOne(0)) { exit }

$script:proceso = $null
$script:token = ""

function Leer-Token {
  if (-not (Test-Path $cfgPath)) { return "" }
  try { return [string](Get-Content $cfgPath -Raw | ConvertFrom-Json).token } catch { return "" }
}

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

function Mostrar-Datos {
  $script:token = Leer-Token
  $form = New-Object System.Windows.Forms.Form
  $form.Text = "PixeSistemas - Agente de impresion"
  $form.Size = New-Object System.Drawing.Size(500, 250)
  $form.StartPosition = "CenterScreen"
  $form.FormBorderStyle = "FixedDialog"
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.TopMost = $true

  $lblUrl = New-Object System.Windows.Forms.Label
  $lblUrl.Text = "URL del agente (va en Puntos de venta):"
  $lblUrl.Location = New-Object System.Drawing.Point(14, 12)
  $lblUrl.AutoSize = $true
  $form.Controls.Add($lblUrl)

  $txtUrl = New-Object System.Windows.Forms.TextBox
  $txtUrl.Text = "http://127.0.0.1:$puerto"
  $txtUrl.ReadOnly = $true
  $txtUrl.Location = New-Object System.Drawing.Point(14, 32)
  $txtUrl.Width = 455
  $form.Controls.Add($txtUrl)

  $lblTok = New-Object System.Windows.Forms.Label
  $lblTok.Text = "Token (copialo y pegalo en Puntos de venta):"
  $lblTok.Location = New-Object System.Drawing.Point(14, 70)
  $lblTok.AutoSize = $true
  $form.Controls.Add($lblTok)

  $txtTok = New-Object System.Windows.Forms.TextBox
  $txtTok.Text = $(if ($script:token) { $script:token } else { "(el agente todavia esta generando el token...)" })
  $txtTok.ReadOnly = $true
  $txtTok.Location = New-Object System.Drawing.Point(14, 90)
  $txtTok.Width = 455
  $form.Controls.Add($txtTok)

  $btnCopiar = New-Object System.Windows.Forms.Button
  $btnCopiar.Text = "Copiar token"
  $btnCopiar.Location = New-Object System.Drawing.Point(14, 130)
  $btnCopiar.Width = 120
  $btnCopiar.Add_Click({
      $script:token = Leer-Token
      if (-not $script:token) {
        [System.Windows.Forms.MessageBox]::Show("El token todavia no esta generado. Espera unos segundos y volve a abrir esta ventana.") | Out-Null
        return
      }
      Set-Clipboard -Value $script:token
      [System.Windows.Forms.MessageBox]::Show("Token copiado al portapapeles.`nPegalo en el ERP: Puntos de venta -> Token del agente.") | Out-Null
    })
  $form.Controls.Add($btnCopiar)

  $btnCopiarUrl = New-Object System.Windows.Forms.Button
  $btnCopiarUrl.Text = "Copiar URL"
  $btnCopiarUrl.Location = New-Object System.Drawing.Point(144, 130)
  $btnCopiarUrl.Width = 100
  $btnCopiarUrl.Add_Click({
      Set-Clipboard -Value "http://127.0.0.1:$puerto"
      [System.Windows.Forms.MessageBox]::Show("URL copiada al portapapeles.") | Out-Null
    })
  $form.Controls.Add($btnCopiarUrl)

  $btnCerrar = New-Object System.Windows.Forms.Button
  $btnCerrar.Text = "Cerrar"
  $btnCerrar.Location = New-Object System.Drawing.Point(369, 130)
  $btnCerrar.Width = 100
  $btnCerrar.Add_Click({ $form.Close() })
  $form.Controls.Add($btnCerrar)

  $form.ShowDialog() | Out-Null
}

function Copiar-Token {
  $script:token = Leer-Token
  if (-not $script:token) {
    [System.Windows.Forms.MessageBox]::Show("El token todavia no esta generado.") | Out-Null
    return
  }
  Set-Clipboard -Value $script:token
  $icono.BalloonTipTitle = "Token copiado"
  $icono.BalloonTipText = "Pegalo en el ERP: Puntos de venta -> Token del agente."
  $icono.ShowBalloonTip(3000)
}

Iniciar-Agente
# Espera a que el agente cree config.json (token) la primera vez.
for ($i = 0; $i -lt 20 -and -not (Test-Path $cfgPath); $i++) { Start-Sleep -Milliseconds 200 }
$script:token = Leer-Token

$icono = New-Object System.Windows.Forms.NotifyIcon
$icono.Icon = [System.Drawing.SystemIcons]::Information
$icono.Text = "PixeSistemas - Agente de impresion (puerto $puerto)"
$icono.Visible = $true
$icono.BalloonTipTitle = "Agente de impresion"
$icono.BalloonTipText = "Activo en el puerto $puerto. Clic derecho para ver el token y las opciones."
$icono.ShowBalloonTip(4000)

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$itemEstado = New-Object System.Windows.Forms.ToolStripMenuItem
$itemEstado.Text = "Estado: $((Estado-Agente))"
$itemEstado.Enabled = $false
$menu.Items.Add($itemEstado) | Out-Null

$menu.Items.Add("-") | Out-Null
$menu.Items.Add("Ver datos de conexion (token)", $null, { Mostrar-Datos }) | Out-Null
$menu.Items.Add("Copiar token al portapapeles", $null, { Copiar-Token }) | Out-Null
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

$icono.add_MouseDoubleClick({ Mostrar-Datos })

# Primera vez: mostramos directamente los datos para copiar el token.
if ($primeraVez) { Mostrar-Datos }

[System.Windows.Forms.Application]::Run()
Detener-Agente
