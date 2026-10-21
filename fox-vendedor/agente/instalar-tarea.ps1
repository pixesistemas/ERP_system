$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "sincronizar.bat"
$accion = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$script`""
$disparador = New-ScheduledTaskTrigger -Daily -At "08:00"
Register-ScheduledTask -TaskName "Fox Vendedor - Sincronizacion diaria" -Action $accion -Trigger $disparador -Description "Sincroniza articulos y presupuestos entre FoxPro y Fox Vendedor" -Force | Out-Null
Write-Host "Tarea creada: todos los dias a las 08:00."
Write-Host "Podes cambiarla desde el Programador de tareas de Windows."
