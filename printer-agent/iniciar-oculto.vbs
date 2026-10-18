' Inicia el agente de impresión SIN ventana (para el arranque automático).
' Para que arranque solo con Windows: copiá este archivo a la carpeta de
' Inicio (Win+R → shell:startup). El agente escribe su registro en agente.log.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
exe = pasta & "\pixe-print-agent.exe"
If fso.FileExists(exe) Then
  sh.Run """" & exe & """", 0, False
Else
  sh.Run "node """ & pasta & "\server.js""", 0, False
End If
