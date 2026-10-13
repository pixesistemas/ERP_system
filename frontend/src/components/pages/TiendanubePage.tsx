import { useEffect, useState } from "react";
import { CloudDownload, CloudUpload, Check, Plug, RefreshCw, Save, ShoppingBag } from "lucide-react";
import { erpApi } from "../../services/api";
import { fmtFechaHora } from "../../utils/fecha";

/*
 * Conexión con Tiendanube (módulo opcional).
 *
 * Diseñado para consumir lo mínimo posible: nada corre solo, todo se
 * ejecuta cuando el usuario toca un botón y de a lotes pequeños.
 */
export function TiendanubePage() {
  const [cfg, setCfg] = useState<any>({ storeId: "", token: "", activo: false, configurado: false, tokenCargado: false, ultimaSync: null });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState<string[]>([]);

  function agregarLog(linea: string) {
    setLog((prev) => [`${new Date().toLocaleTimeString("es-AR")} · ${linea}`, ...prev].slice(0, 12));
  }

  async function cargar() {
    try {
      const r = await erpApi.getTiendanube();
      setCfg({ ...r, token: "" });
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function guardar() {
    setBusy("guardar");
    setError("");
    setNotice("");
    try {
      const r = await erpApi.saveTiendanube({ storeId: cfg.storeId, token: cfg.token || undefined, activo: cfg.activo });
      setCfg({ ...r, token: "" });
      setNotice("Datos de conexión guardados.");
      agregarLog("Configuración guardada.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function probar() {
    setBusy("probar");
    setError("");
    setNotice("");
    try {
      const r = await erpApi.probarTiendanube();
      setNotice(r.mensaje || "Conexión correcta.");
      agregarLog(`Conexión OK con la tienda ${cfg.storeId}.`);
    } catch (e: any) {
      setError(e.message);
      agregarLog(`Error de conexión: ${e.message}`);
    } finally {
      setBusy("");
    }
  }

  async function exportarProductos() {
    setBusy("productos");
    setError("");
    setNotice("");
    try {
      const r = await erpApi.exportarProductosTiendanube(30);
      setNotice(`Productos enviados a Tiendanube: ${r.enviados}.${r.restantes ? ` Quedan ${r.restantes} para la próxima.` : " No queda ninguno pendiente."}`);
      (r.errores || []).forEach((x: string) => agregarLog(`Error: ${x}`));
      if (!r.errores?.length) agregarLog(`Productos enviados: ${r.enviados}.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function exportarStock() {
    setBusy("stock");
    setError("");
    setNotice("");
    try {
      const r = await erpApi.exportarStockTiendanube(30);
      setNotice(`Stock actualizado en Tiendanube: ${r.actualizados} de ${r.vinculados} productos vinculados.`);
      agregarLog(`Stock sincronizado: ${r.actualizados}.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function importarPedidos() {
    setBusy("pedidos");
    setError("");
    setNotice("");
    try {
      const r = await erpApi.importarPedidosTiendanube(20);
      setNotice(`Pedidos importados: ${r.importados}.${r.sinMapear ? ` Ojo: hay productos sin SKU coincidente (ej.: ${r.sinMapear}); cargalos en el catálogo con el mismo código.` : ""}`);
      agregarLog(`Pedidos importados: ${r.importados} (último id ${r.ultimoPedidoId}).`);
      (r.errores || []).forEach((x: string) => agregarLog(`Error: ${x}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Conexión con Tiendanube</h3><p>Vinculá tu tienda para exportar productos y stock e importar los pedidos como notas de pedido. Todo se ejecuta a demanda: no hay procesos en segundo plano.</p></div>
      <div className="inline-actions">
        <button className="secondary-action" onClick={cargar}><RefreshCw size={16} /> Actualizar</button>
      </div>
    </div>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}

    <div className="products-card">
      <div className="settings-head" style={{ padding: "0 0 10px" }}><Plug size={18} /><div><h4>Datos de conexión</h4><p>Los saca de Tiendanube en Configuración → Aplicaciones → API (ID de tienda y token de acceso). El token queda guardado en tu servidor, nunca en internet.</p></div></div>
      <div className="form-grid">
        <label>ID de tienda<input value={cfg.storeId} onChange={(e) => setCfg({ ...cfg, storeId: e.target.value })} placeholder="Ej.: 1234567" /></label>
        <label>Token de acceso{cfg.tokenCargado ? " (ya cargado)" : ""}<input type="password" value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} placeholder={cfg.tokenCargado ? "Dejar vacío para no cambiarlo" : "Pegá el token de Tiendanube"} /></label>
        <label className="toggle-row" style={{ borderTop: 0 }}><div><strong>Habilitado</strong><span>Si está apagado, los botones de sincronización avisan pero no envían nada.</span></div><input type="checkbox" checked={Boolean(cfg.activo)} onChange={(e) => setCfg({ ...cfg, activo: e.target.checked })} /></label>
      </div>
      <div className="modal-actions" style={{ padding: "10px 0 0" }}>
        <button className="secondary-action" disabled={busy === "probar" || !cfg.storeId || (!cfg.tokenCargado && !cfg.token)} onClick={probar}><Check size={16} /> {busy === "probar" ? "Probando..." : "Probar conexión"}</button>
        <button className="primary-action" disabled={busy === "guardar"} onClick={guardar}><Save size={16} /> Guardar conexión</button>
      </div>
      {cfg.ultimaSync && <p className="report-sub" style={{ marginTop: 8 }}>Última sincronización: {fmtFechaHora(cfg.ultimaSync)}</p>}
    </div>

    <div className="products-card">
      <div className="settings-head" style={{ padding: "0 0 10px" }}><ShoppingBag size={18} /><div><h4>Sincronización</h4><p>Cada botón trabaja con un lote chico (30 productos / 20 pedidos) para no recargar el servidor. Si queda algo pendiente, volvé a tocar el botón.</p></div></div>
      <div className="modal-actions" style={{ padding: 0, flexWrap: "wrap" }}>
        <button className="secondary-action" disabled={Boolean(busy)} onClick={exportarProductos}><CloudUpload size={16} /> {busy === "productos" ? "Enviando..." : "Exportar productos a Tiendanube"}</button>
        <button className="secondary-action" disabled={Boolean(busy)} onClick={exportarStock}><RefreshCw size={16} /> {busy === "stock" ? "Actualizando..." : "Actualizar stock en Tiendanube"}</button>
        <button className="primary-action" disabled={Boolean(busy)} onClick={importarPedidos}><CloudDownload size={16} /> {busy === "pedidos" ? "Importando..." : "Importar pedidos de Tiendanube"}</button>
      </div>
      {log.length > 0 && <div className="order-historial" style={{ marginTop: 12 }}>
        <h4>Últimos movimientos</h4>
        {log.map((l, i) => <div key={i} className="order-historial-linea"><small>{l}</small></div>)}
      </div>}
    </div>
  </div>;
}
