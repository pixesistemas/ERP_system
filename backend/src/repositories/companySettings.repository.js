const db = require("../db/database");

function defaults() {
  return {
    stockPolicy: "WARN",
    stockAlertsEnabled: true,
    stockAlertDashboard: true,
    logoUrl: "",
    reciboDobleCopia: true,
    posAgruparPorCodigo: true,
    remitoRequiereNotaPedido: true,
    tipoInicialVenta: "FACTURA",
    aplicarReglasEn: ["FACTURA", "NOTA_X", "PRESUPUESTO", "NOTA_PEDIDO", "REMITO", "NOTA_CREDITO", "NOTA_DEBITO"],
    autoEliminarNotaXDias: 0,
  };
}

function getSettings(empresaId) {
  const row = db.prepare("SELECT * FROM empresa_configuraciones WHERE empresa_id = ?").get(empresaId);
  if (!row) return defaults();
  let aplicarReglasEn = defaults().aplicarReglasEn;
  if (row.aplicar_reglas_en) {
    try {
      const parsed = JSON.parse(row.aplicar_reglas_en);
      if (Array.isArray(parsed) && parsed.length) aplicarReglasEn = parsed;
    } catch (e) {}
  }
  return {
    stockPolicy: row.stock_policy || "WARN",
    stockAlertsEnabled: Boolean(row.stock_alerts_enabled),
    stockAlertDashboard: Boolean(row.stock_alert_dashboard),
    logoUrl: row.logo_url || "",
    reciboDobleCopia: row.recibo_doble_copia == null ? true : Boolean(row.recibo_doble_copia),
    posAgruparPorCodigo: row.pos_agrupar_por_codigo == null ? true : Boolean(row.pos_agrupar_por_codigo),
    remitoRequiereNotaPedido: row.remito_requiere_nota_pedido == null ? true : Boolean(row.remito_requiere_nota_pedido),
    tipoInicialVenta: ["NOTA_PEDIDO", "PRESUPUESTO", "FACTURA"].includes(row.tipo_inicial_venta) ? row.tipo_inicial_venta : "FACTURA",
    aplicarReglasEn,
    autoEliminarNotaXDias: Number(row.auto_eliminar_notax_dias || 0),
  };
}

function saveSettings(empresaId, input) {
  const current = getSettings(empresaId);
  const next = {
    stockPolicy: String(input.stockPolicy || current.stockPolicy).toUpperCase(),
    stockAlertsEnabled: input.stockAlertsEnabled ?? current.stockAlertsEnabled,
    stockAlertDashboard: input.stockAlertDashboard ?? current.stockAlertDashboard,
    logoUrl: input.logoUrl ?? current.logoUrl,
    reciboDobleCopia: input.reciboDobleCopia ?? current.reciboDobleCopia,
    posAgruparPorCodigo: input.posAgruparPorCodigo ?? current.posAgruparPorCodigo,
    remitoRequiereNotaPedido: input.remitoRequiereNotaPedido ?? current.remitoRequiereNotaPedido,
    tipoInicialVenta: ["NOTA_PEDIDO", "PRESUPUESTO", "FACTURA"].includes(input.tipoInicialVenta) ? input.tipoInicialVenta : current.tipoInicialVenta,
    aplicarReglasEn: Array.isArray(input.aplicarReglasEn) && input.aplicarReglasEn.length ? input.aplicarReglasEn : current.aplicarReglasEn,
    autoEliminarNotaXDias: Math.max(0, Number(input.autoEliminarNotaXDias ?? current.autoEliminarNotaXDias) || 0),
  };
  if (!["BLOCK", "WARN", "IGNORE"].includes(next.stockPolicy)) {
    const error = new Error("Política de stock inválida"); error.statusCode = 400; throw error;
  }
  db.prepare(`
    INSERT INTO empresa_configuraciones (empresa_id, stock_policy, stock_alerts_enabled, stock_alert_dashboard, logo_url, recibo_doble_copia, pos_agrupar_por_codigo, remito_requiere_nota_pedido, tipo_inicial_venta, aplicar_reglas_en, auto_eliminar_notax_dias, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(empresa_id) DO UPDATE SET
      stock_policy = excluded.stock_policy,
      stock_alerts_enabled = excluded.stock_alerts_enabled,
      stock_alert_dashboard = excluded.stock_alert_dashboard,
      logo_url = excluded.logo_url,
      recibo_doble_copia = excluded.recibo_doble_copia,
      pos_agrupar_por_codigo = excluded.pos_agrupar_por_codigo,
      remito_requiere_nota_pedido = excluded.remito_requiere_nota_pedido,
      tipo_inicial_venta = excluded.tipo_inicial_venta,
      aplicar_reglas_en = excluded.aplicar_reglas_en,
      auto_eliminar_notax_dias = excluded.auto_eliminar_notax_dias,
      updated_at = CURRENT_TIMESTAMP
  `).run(empresaId, next.stockPolicy, next.stockAlertsEnabled ? 1 : 0, next.stockAlertDashboard ? 1 : 0, next.logoUrl || null, next.reciboDobleCopia ? 1 : 0, next.posAgruparPorCodigo ? 1 : 0, next.remitoRequiereNotaPedido ? 1 : 0, next.tipoInicialVenta, JSON.stringify(next.aplicarReglasEn), next.autoEliminarNotaXDias);
  return getSettings(empresaId);
}

module.exports = { getSettings, saveSettings };
