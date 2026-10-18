/*
 * PixeSistemas - Agente de impresión para impresoras térmicas.
 *
 * Corre en la PC del local (Windows, Linux o macOS) y escucha SOLO en
 * 127.0.0.1. El ERP le manda el ticket ya armado en ESC/POS (base64) y el
 * agente lo envía a la impresora:
 *
 *   - RED:     abre un socket TCP a la IP/puerto de la impresora (9100).
 *   - SISTEMA: manda los bytes crudos a una impresora instalada en el
 *              sistema (USB u otra). En Windows usa winspool (RAW) vía
 *              PowerShell; en Linux/macOS usa `lp -o raw`.
 *
 * Seguridad: solo escucha en localhost y valida un token (se genera solo
 * la primera vez y queda en config.json).
 */

const http = require("http");
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const VERSION = "1.0.0";
/*
 * Empaquetado como .exe (pkg/SEA): __dirname queda dentro de un snapshot de
 * solo lectura, así que la configuración, el log y el script de Windows se
 * guardan al lado del ejecutable.
 */
const DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = path.join(DIR, "config.json");
const PS1_PATH = path.join(DIR, "imprimir-raw.ps1");
const LOG_PATH = path.join(DIR, "agente.log");
const ES_WINDOWS = process.platform === "win32";

/* Registro en agente.log: es la forma de diagnosticar cuando corre sin ventana. */
function log(...partes) {
  const linea = `[${new Date().toISOString()}] ${partes.join(" ")}`;
  console.log(linea);
  try {
    fs.appendFileSync(LOG_PATH, linea + "\n");
  } catch (error) {
    /* sin permisos de escritura: seguimos solo con consola */
  }
}

function cargarConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      return {
        puerto: Number(cfg.puerto) || 17777,
        token: String(cfg.token || ""),
        espera_impresora_ms: Number(cfg.espera_impresora_ms) || 5000,
      };
    } catch (error) {
      console.error("config.json inválido, se regenera:", error.message);
    }
  }
  const cfg = {
    puerto: 17777,
    token: crypto.randomBytes(16).toString("hex"),
    espera_impresora_ms: 5000,
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
  return cfg;
}

/* ------------------------- impresora por red ------------------------- */

function imprimirRed({ host, puerto }, buffer, esperaMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(puerto) || 9100, host);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`No respondió la impresora ${host}:${puerto} (${esperaMs} ms).`));
    }, esperaMs);
    socket.on("connect", () => {
      socket.write(buffer, () => {
        socket.end();
        clearTimeout(timer);
        resolve();
      });
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`No se pudo conectar a ${host}:${puerto}: ${error.message}`));
    });
  });
}

/* --------------------- impresora instalada (USB) --------------------- */

const PS1 = [
  "param([Parameter(Mandatory=$true)][string]$impresora, [Parameter(Mandatory=$true)][string]$archivo)",
  '$ErrorActionPreference = "Stop"',
  "$codigo = @'",
  "using System;",
  "using System.Runtime.InteropServices;",
  "public class PixeRawPrinter {",
  "  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]",
  "  public class DOCINFOA { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }",
  '  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);',
  '  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);',
  '  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);',
  '  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);',
  '  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);',
  '  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);',
  '  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);',
  "  public static bool Enviar(string impresora, byte[] bytes) {",
  "    IntPtr h;",
  "    if (!OpenPrinter(impresora, out h, IntPtr.Zero)) return false;",
  '    DOCINFOA di = new DOCINFOA(); di.pDocName = "PixeTicket"; di.pDataType = "RAW";',
  "    bool ok = false;",
  "    if (StartDocPrinter(h, 1, di)) {",
  "      if (StartPagePrinter(h)) {",
  "        IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);",
  "        try { Marshal.Copy(bytes, 0, p, bytes.Length); Int32 escritos; ok = WritePrinter(h, p, bytes.Length, out escritos); }",
  "        finally { Marshal.FreeCoTaskMem(p); }",
  "        EndPagePrinter(h);",
  "      }",
  "      EndDocPrinter(h);",
  "    }",
  "    ClosePrinter(h);",
  "    return ok;",
  "  }",
  "}",
  "'@",
  "Add-Type -TypeDefinition $codigo",
  "$bytes = [System.IO.File]::ReadAllBytes($archivo)",
  'if (-not [PixeRawPrinter]::Enviar($impresora, $bytes)) { Write-Error "No se pudo enviar a la impresora $impresora"; exit 1 }',
  "exit 0",
  "",
].join("\n");

function asegurarScriptWindows() {
  if (!ES_WINDOWS) return;
  const actual = fs.existsSync(PS1_PATH) ? fs.readFileSync(PS1_PATH, "utf8") : "";
  if (actual !== PS1) fs.writeFileSync(PS1_PATH, PS1, "utf8");
}

function archivoTemporal(buffer) {
  const ruta = path.join(os.tmpdir(), `pixe-ticket-${Date.now()}-${Math.floor(Math.random() * 1e6)}.bin`);
  fs.writeFileSync(ruta, buffer);
  return ruta;
}

function imprimirSistemaWindows(nombre, buffer) {
  return new Promise((resolve, reject) => {
    asegurarScriptWindows();
    const tmp = archivoTemporal(buffer);
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1_PATH, "-impresora", nombre, "-archivo", tmp],
      { timeout: 30000 },
      (error, stdout, stderr) => {
        fs.rm(tmp, { force: true }, () => {});
        if (error) return reject(new Error(String(stderr || error.message || "").trim() || "No se pudo imprimir en la impresora del sistema."));
        resolve();
      },
    );
  });
}

function imprimirSistemaPosix(nombre, buffer) {
  return new Promise((resolve, reject) => {
    const tmp = archivoTemporal(buffer);
    execFile("lp", ["-d", nombre, "-o", "raw", tmp], { timeout: 30000 }, (error, stdout, stderr) => {
      fs.rm(tmp, { force: true }, () => {});
      if (error) return reject(new Error(String(stderr || error.message || "").trim() || "No se pudo enviar a la impresora."));
      resolve();
    });
  });
}

function imprimirSistema(nombre, buffer) {
  return ES_WINDOWS ? imprimirSistemaWindows(nombre, buffer) : imprimirSistemaPosix(nombre, buffer);
}

function listarImpresoras() {
  return new Promise((resolve) => {
    if (ES_WINDOWS) {
      execFile(
        "powershell",
        ["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"],
        { timeout: 15000 },
        (error, stdout) => {
          if (error) return resolve([]);
          resolve(String(stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
        },
      );
    } else {
      execFile("lpstat", ["-a"], { timeout: 15000 }, (error, stdout) => {
        if (error) return resolve([]);
        resolve(String(stdout || "").split(/\r?\n/).map((l) => l.split(/\s+/)[0]).filter(Boolean));
      });
    }
  });
}

/* --------------------------- servidor HTTP --------------------------- */

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Token");
  /* Chrome exige esta cabecera para que una web pública hable con localhost. */
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function json(res, codigo, obj) {
  res.writeHead(codigo, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function leerCuerpo(req, limite = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > limite) {
        reject(new Error("El pedido es demasiado grande."));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(partes)));
    req.on("error", reject);
  });
}

function crearServidor(cfg) {
  const config = cfg || cargarConfig();
  return http.createServer(async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    const url = String(req.url || "");
    try {
      if (req.method === "GET" && url.startsWith("/salud")) {
        return json(res, 200, { ok: true, agente: "pixe-print-agent", version: VERSION, plataforma: process.platform });
      }
      if (req.method === "GET" && url.startsWith("/impresoras")) {
        const impresoras = await listarImpresoras();
        return json(res, 200, { ok: true, impresoras });
      }
      if (req.method === "POST" && url.startsWith("/imprimir")) {
        const body = JSON.parse((await leerCuerpo(req)).toString("utf8") || "{}");
        if (config.token && String(body.token || req.headers["x-token"] || "") !== config.token) {
          log("RECHAZADO: token incorrecto");
          return json(res, 401, { ok: false, error: "Token incorrecto. Copiá el token del agente en la configuración del punto de venta." });
        }
        const datos = Buffer.from(String(body.datos_base64 || ""), "base64");
        if (!datos.length) return json(res, 400, { ok: false, error: "No se recibieron datos para imprimir." });
        const impresora = body.impresora || {};
        const tipo = String(impresora.tipo || "RED").toUpperCase();
        if (tipo === "SISTEMA") {
          const nombre = String(impresora.nombre || "").trim();
          if (!nombre) return json(res, 400, { ok: false, error: "Falta el nombre de la impresora instalada." });
          await imprimirSistema(nombre, datos);
          log(`IMPRESO ${datos.length} bytes en impresora del sistema "${nombre}"${body.descripcion ? " (" + body.descripcion + ")" : ""}`);
        } else {
          const host = String(impresora.host || "").trim();
          if (!host) return json(res, 400, { ok: false, error: "Falta la IP de la impresora." });
          await imprimirRed({ host, puerto: Number(impresora.puerto || 9100) || 9100 }, datos, config.espera_impresora_ms);
          log(`IMPRESO ${datos.length} bytes en ${host}:${Number(impresora.puerto || 9100) || 9100}${body.descripcion ? " (" + body.descripcion + ")" : ""}`);
        }
        return json(res, 200, { ok: true, bytes: datos.length });
      }
      return json(res, 404, { ok: false, error: "Ruta no encontrada." });
    } catch (error) {
      log("ERROR:", error.message);
      return json(res, 500, { ok: false, error: String(error.message || error) });
    }
  });
}

if (require.main === module) {
  const cfg = cargarConfig();
  asegurarScriptWindows();
  try {
    /* El log no crece sin control: si pasa 1 MB se reinicia al arrancar. */
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > 1024 * 1024) fs.writeFileSync(LOG_PATH, "");
  } catch (error) {
    /* si no se puede rotar, no pasa nada */
  }
  const server = crearServidor(cfg);
  server.listen(cfg.puerto, "127.0.0.1", async () => {
    log(`Agente v${VERSION} iniciado en http://127.0.0.1:${cfg.puerto} (${process.platform})`);
    console.log("==============================================");
    console.log("  PixeSistemas - Agente de impresion  v" + VERSION);
    console.log("==============================================");
    console.log("  Escuchando en : http://127.0.0.1:" + cfg.puerto);
    console.log("  Token         : " + (cfg.token || "(sin token)"));
    console.log("  Plataforma    : " + process.platform);
    try {
      const impresoras = await listarImpresoras();
      console.log("  Impresoras    : " + (impresoras.length ? impresoras.join(" | ") : "(ninguna detectada)"));
    } catch (error) {
      /* la lista es informativa */
    }
    console.log("");
    console.log("  Dejá esta ventana abierta mientras usás el punto de venta.");
    console.log("  Copiá el Token y la IP/puerto en Puntos de venta del ERP.");
    console.log("==============================================");
  });
  server.on("error", (error) => {
    log("ERROR al iniciar:", error.message);
    console.error("No se pudo iniciar el agente:", error.message);
    console.error("¿Ya hay otro agente corriendo en el puerto " + cfg.puerto + "?");
    process.exit(1);
  });
}

module.exports = { crearServidor, cargarConfig, imprimirRed, listarImpresoras, VERSION };
