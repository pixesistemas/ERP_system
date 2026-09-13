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
    autoReporteDiario: false,
    autoReporteHora: "21:00",
    autoReporteEmail: "",
    autoStockMinimo: false,
    autoStockTelefono: "",
    autoReintentoCae: false,
    autoCobranzas: false,
    autoCobranzasDias: 7,
    autoCobranzasHora: "10:00",
    autoBackup: false,
    autoBackupHora: "03:00",
    autoAvisarReparto: false,
    autoEscalarHumano: false,
    autoEscalarTelefono: "",
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
    autoReporteDiario: Boolean(row.auto_reporte_diario),
    autoReporteHora: row.auto_reporte_hora || "21:00",
    autoReporteEmail: row.auto_reporte_email || "",
    autoStockMinimo: Boolean(row.auto_stock_minimo),
    autoStockTelefono: row.auto_stock_telefono || "",
    autoReintentoCae: Boolean(row.auto_reintento_cae),
    autoCobranzas: Boolean(row.auto_cobranzas),
    autoCobranzasDias: Number(row.auto_cobranzas_dias || 7),
    autoCobranzasHora: row.auto_cobranzas_hora || "10:00",
    autoBackup: Boolean(row.auto_backup),
    autoBackupHora: row.auto_backup_hora || "03:00",
    autoAvisarReparto: Boolean(row.auto_avisar_reparto),
    autoEscalarHumano: Boolean(row.auto_escalar_humano),
    autoEscalarTelefono: row.auto_escalar_telefono || "",
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
    autoReporteDiario: input.autoReporteDiario ?? current.autoReporteDiario,
    autoReporteHora: input.autoReporteHora ?? current.autoReporteHora,
    autoReporteEmail: input.autoReporteEmail ?? current.autoReporteEmail,
    autoStockMinimo: input.autoStockMinimo ?? current.autoStockMinimo,
    autoStockTelefono: input.autoStockTelefono ?? current.autoStockTelefono,
    autoReintentoCae: input.autoReintentoCae ?? current.autoReintentoCae,
    autoCobranzas: input.autoCobranzas ?? current.autoCobranzas,
    autoCobranzasDias: Math.max(0, Number(input.autoCobranzasDias ?? current.autoCobranzasDias) || 0),
    autoCobranzasHora: input.autoCobranzasHora ?? current.autoCobranzasHora,
    autoBackup: input.autoBackup ?? current.autoBackup,
    autoBackupHora: input.autoBackupHora ?? current.autoBackupHora,
    autoAvisarReparto: input.autoAvisarReparto ?? current.autoAvisarReparto,
    autoEscalarHumano: input.autoEscalarHumano ?? current.autoEscalarHumano,
    autoEscalarTelefono: input.autoEscalarTelefono ?? current.autoEscalarTelefono,
  };
  if (!["BLOCK", "WARN", "IGNORE"].includes(next.stockPolicy)) {
    const error = new Error("Política de stock inválida"); error.statusCode = 400; throw error;
  }
  db.prepare(`
    INSERT INTO empresa_configuraciones (empresa_id, stock_policy, stock_alerts_enabled, stock_alert_dashboard, logo_url, recibo_doble_copia, pos_agrupar_por_codigo, remito_requiere_nota_pedido, tipo_inicial_venta, aplicar_reglas_en, auto_eliminar_notax_dias,
      auto_reporte_diario, auto_reporte_hora, auto_reporte_email, auto_stock_minimo, auto_stock_telefono, auto_reintento_cae,
      auto_cobranzas, auto_cobranzas_dias, auto_cobranzas_hora, auto_backup, auto_backup_hora, auto_avisar_reparto, auto_escalar_humano, auto_escalar_telefono, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
      auto_reporte_diario = excluded.auto_reporte_diario,
      auto_reporte_hora = excluded.auto_reporte_hora,
      auto_reporte_email = excluded.auto_reporte_email,
      auto_stock_minimo = excluded.auto_stock_minimo,
      auto_stock_telefono = excluded.auto_stock_telefono,
      auto_reintento_cae = excluded.auto_reintento_cae,
      auto_cobranzas = excluded.auto_cobranzas,
      auto_cobranzas_dias = excluded.auto_cobranzas_dias,
      auto_cobranzas_hora = excluded.auto_cobranzas_hora,
      auto_backup = excluded.auto_backup,
      auto_backup_hora = excluded.auto_backup_hora,
      auto_avisar_reparto = excluded.auto_avisar_reparto,
      auto_escalar_humano = excluded.auto_escalar_humano,
      auto_escalar_telefono = excluded.auto_escalar_telefono,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    empresaId, next.stockPolicy, next.stockAlertsEnabled ? 1 : 0, next.stockAlertDashboard ? 1 : 0, next.logoUrl || null,
    next.reciboDobleCopia ? 1 : 0, next.posAgruparPorCodigo ? 1 : 0, next.remitoRequiereNotaPedido ? 1 : 0, next.tipoInicialVenta,
    JSON.stringify(next.aplicarReglasEn), next.autoEliminarNotaXDias,
    next.autoReporteDiario ? 1 : 0, next.autoReporteHora || null, next.autoReporteEmail || null,
    next.autoStockMinimo ? 1 : 0, next.autoStockTelefono || null, next.autoReintentoCae ? 1 : 0,
    next.autoCobranzas ? 1 : 0, next.autoCobranzasDias, next.autoCobranzasHora || null,
    next.autoBackup ? 1 : 0, next.autoBackupHora || null, next.autoAvisarReparto ? 1 : 0,
    next.autoEscalarHumano ? 1 : 0, next.autoEscalarTelefono || null,
  );
  return getSettings(empresaId);
}

module.exports = { getSettings, saveSettings };
