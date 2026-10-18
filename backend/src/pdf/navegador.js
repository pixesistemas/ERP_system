const puppeteer = require("puppeteer");

/*
 * Chrome headless para generar PDFs.
 *
 * Un solo lugar para lanzarlo con los argumentos que necesitan los
 * servidores Docker: sin sandbox (corre como root) y con
 * --disable-dev-shm-usage, porque el /dev/shm chico de Docker hace que
 * printToPDF falle con "Protocol error (Page.printToPDF): Printing failed".
 *
 * Además serializa las generaciones y reintenta una vez: cada Chrome
 * consume mucha memoria y en servidores chicos dos en paralelo se matan
 * entre sí.
 */

const ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--font-render-hinting=none",
];

function lanzar() {
  return puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ARGS,
  });
}

let cola = Promise.resolve();

function conNavegador(tarea) {
  const correr = async () => {
    let ultimoError = null;
    for (let intento = 1; intento <= 2; intento++) {
      const browser = await lanzar();
      try {
        return await tarea(browser);
      } catch (error) {
        ultimoError = error;
      } finally {
        await browser.close().catch(() => {});
      }
    }
    throw ultimoError;
  };
  const resultado = cola.then(correr, correr);
  cola = resultado.then(
    () => {},
    () => {},
  );
  return resultado;
}

module.exports = { conNavegador };
