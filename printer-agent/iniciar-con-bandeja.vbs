' Inicia el agente de impresion CON icono en la bandeja (junto al reloj),
' sin abrir ninguna ventana. El icono permite ver el registro, reiniciar
' o cerrar el agente.
'
' Para que arranque solo con Windows: ejecutá instalar-inicio-automatico.bat
' (o copiá este archivo a la carpeta de Inicio: Win+R -> shell:startup).
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & pasta & "\bandeja.ps1""", 0, False
