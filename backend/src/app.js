const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const bootstrapDatabase = require("./db/bootstrap");
const ensureSchemaCompatibility = require("./db/schemaCompatibility");

// Routes
const authRoutes = require("./routes/auth.routes");
const superadminRoutes = require("./routes/superadmin.routes");
const billingRoutes = require("./routes/billing.routes");
const documentoComercialRoutes = require("./routes/documentoComercial.routes");
const facturaConsultaRoutes = require("./routes/facturaConsulta.routes");
const facturasGuardadasRoutes = require("./routes/facturasGuardadas.routes");
const padronRoutes = require("./routes/padron.routes");
const usuarioRoutes = require("./routes/usuario.routes");
const rolRoutes = require("./routes/rol.routes");
const auditRoutes = require("./routes/audit.routes");
const stockRoutes = require("./routes/stock.routes");
const clienteCuentaCorrienteRoutes = require("./routes/clienteCuentaCorriente.routes");
const reciboRoutes = require("./routes/recibo.routes");
const pricingRoutes = require("./routes/pricing.routes");
const comisionRoutes = require("./routes/comision.routes");
const stockReservaRoutes = require("./routes/stockReserva.routes");
const eventStoreRoutes = require("./routes/eventStore.routes");
const businessRuleRoutes = require("./routes/businessRule.routes");
const processRoutes = require("./routes/process.routes");
const whatsappProcessRoutes = require("./routes/whatsappProcess.routes");
const whatsappSearchRoutes = require("./routes/whatsappSearch.routes");
const workspaceRoutes = require("./routes/workspace.routes");
const businessSessionRoutes = require("./routes/businessSession.routes");
const resolverRoutes = require("./routes/resolver.routes");
const conversationRoutes = require("./routes/conversation.routes");
const commercialConversationRoutes = require("./routes/commercialConversation.routes");
const whatsappCommercialConversationRoutes = require("./routes/whatsappCommercialConversation.routes");
const whatsappClienteConversationRoutes = require("./routes/whatsappClienteConversation.routes");
const whatsappClienteAdminRoutes = require("./routes/whatsappClienteAdmin.routes");
const productoRoutes = require("./routes/producto.routes");
const clienteRoutes = require("./routes/cliente.routes");
const companySettingsRoutes = require("./routes/companySettings.routes");
const erpConsolidationRoutes = require("./routes/erpConsolidation.routes");
const pagoRoutes = require("./routes/pago.routes");
const pagoController = require("./controllers/pago.controller");

//Procesos
const registerProcesses = require("./process/registerProcesses");

// Middlewares
const apiKeyMiddleware = require("./middleware/apiKey.middleware");
const jwtMiddleware = require("./middleware/jwt.middleware");
const whatsappAuthMiddleware = require("./middleware/whatsappAuth.middleware");
const whatsappClienteAuthMiddleware = require("./middleware/whatsappClienteAuth.middleware");
const requirePermission = require("./middleware/permission.middleware");
const apiRateLimit = require("./middleware/rateLimit.middleware");

// Listeners
const registerFacturaListeners = require("./events/listeners/factura.listener");
const registerAuditListeners = require("./events/listeners/audit.listener");
const registerN8NListeners = require("./events/listeners/n8n.listener");
const registerEventStoreListeners = require("./events/listeners/eventStore.listener");

const app = express();

bootstrapDatabase();
ensureSchemaCompatibility();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/storage", express.static(path.join(process.cwd(), "storage")));

// Listeners
registerFacturaListeners();
registerAuditListeners();
registerN8NListeners();
registerEventStoreListeners();
registerProcesses();

// Public routes
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    message: "AFIP/ERP API funcionando",
  });
});

/*
 * Webhook público de WhatsApp Cloud (Meta):
 * GET verifica el token de suscripción y POST recibe
 * los mensajes de los clientes (sin autenticación JWT).
 */
const whatsappWebhookController = require("./controllers/whatsappWebhook.controller");
app.get("/api/v1/whatsapp/webhook", whatsappWebhookController.getWebhook);
app.post("/api/v1/whatsapp/webhook", whatsappWebhookController.postWebhook);

/*
 * Webhook público de MercadoPago: confirma el pago de un cobro/QR.
 * Se registra sin JWT porque lo invoca la plataforma.
 */
app.post(
  "/api/v1/pagos/webhook/mercadopago",
  pagoController.webhookMercadoPago,
);

/*
 * Sirve el frontend compilado (frontend/dist) en producción:
 * los archivos estáticos directos y el fallback SPA para la
 * navegación por hash. No interfiere con /api, /storage ni /health.
 * Si no hay dist (modo desarrollo), la raíz responde el health check.
 */
const fs = require("fs");
const frontendDist = path.join(process.cwd(), "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/(api|storage|health)\b).*/, (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/storage") || req.path.startsWith("/health")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  console.log("Frontend estático disponible en " + frontendDist);
} else {
  app.get("/", (req, res) => {
    res.json({
      ok: true,
      message: "AFIP/ERP API funcionando",
    });
  });
}

app.use("/api/v1/auth", authRoutes);

app.use("/api/v1/superadmin", apiRateLimit, superadminRoutes);

// Internal API - JWT
/*
 * Nuevo flujo conversacional para usuarios autenticados.
 */
app.use(
  "/api/v1/commercial-conversations",
  jwtMiddleware,
  apiRateLimit,
  commercialConversationRoutes,
);

app.use(
  "/api/v1/conversations",
  jwtMiddleware,
  apiRateLimit,
  conversationRoutes,
);
app.use("/api/v1/sessions", jwtMiddleware, apiRateLimit, businessSessionRoutes);
app.use("/api/v1/workspaces", jwtMiddleware, apiRateLimit, workspaceRoutes);
app.use("/api/v1/resolve", jwtMiddleware, apiRateLimit, resolverRoutes);
app.use(
  "/api/v1/whatsapp/search",
  apiKeyMiddleware,
  whatsappAuthMiddleware,
  apiRateLimit,
  whatsappSearchRoutes,
);
app.use(
  "/api/v1/whatsapp/processes",
  apiKeyMiddleware,
  whatsappAuthMiddleware,
  apiRateLimit,
  whatsappProcessRoutes,
);
app.use("/api/v1/processes", jwtMiddleware, apiRateLimit, processRoutes);
app.use("/api/v1/stock", jwtMiddleware, apiRateLimit, stockRoutes);
app.use("/api/v1/productos", jwtMiddleware, apiRateLimit, productoRoutes);
app.use("/api/v1/clientes", jwtMiddleware, apiRateLimit, clienteRoutes);
app.use("/api/v1/configuracion/empresa", jwtMiddleware, apiRateLimit, companySettingsRoutes);
app.use("/api/v1/erp", jwtMiddleware, apiRateLimit, erpConsolidationRoutes);
app.use("/api/v1/pagos", jwtMiddleware, apiRateLimit, pagoRoutes);
app.use("/api/v1/users", jwtMiddleware, apiRateLimit, usuarioRoutes);
app.use("/api/v1/roles", jwtMiddleware, apiRateLimit, rolRoutes);
app.use(
  "/api/v1/clientes/cc",
  jwtMiddleware,
  apiRateLimit,
  clienteCuentaCorrienteRoutes,
);
app.use("/api/v1/pricing", jwtMiddleware, apiRateLimit, pricingRoutes);
app.use("/api/v1/recibos", jwtMiddleware, apiRateLimit, reciboRoutes);
app.use(
  "/api/v1/stock/reservas",
  jwtMiddleware,
  apiRateLimit,
  stockReservaRoutes,
);
app.use("/api/v1/events", jwtMiddleware, apiRateLimit, eventStoreRoutes);

app.use(
  "/api/v1/audit",
  jwtMiddleware,
  requirePermission("usuarios.gestionar"),
  auditRoutes,
);
app.use("/api/v1/rules", jwtMiddleware, apiRateLimit, businessRuleRoutes);
app.use("/api/v1/billing", jwtMiddleware, apiRateLimit, billingRoutes);

app.use(
  "/api/v1/documentos",
  jwtMiddleware,
  apiRateLimit,
  documentoComercialRoutes,
);
app.use("/api/v1/comisiones", jwtMiddleware, apiRateLimit, comisionRoutes);

app.use(
  "/api/v1/facturas",
  jwtMiddleware,
  requirePermission("facturas.consultar"),
  facturaConsultaRoutes,
);

app.use(
  "/api/v1/historial/facturas",
  jwtMiddleware,
  requirePermission("facturas.consultar"),
  facturasGuardadasRoutes,
);

// WhatsApp / n8n API - API Key + teléfono autorizado
app.use(
  "/api/v1/whatsapp/billing",
  apiKeyMiddleware,
  whatsappAuthMiddleware,
  apiRateLimit,
  billingRoutes,
);
/*
 * Conversación comercial por WhatsApp y n8n.
 *
 * La API Key identifica la empresa y el teléfono
 * autorizado determina quién puede operar.
 */
app.use(
  "/api/v1/whatsapp/conversations",
  apiKeyMiddleware,
  whatsappAuthMiddleware,
  apiRateLimit,
  whatsappCommercialConversationRoutes,
);
/*
 * Pedidos de clientes finales por WhatsApp.
 *
 * La API Key identifica la empresa; a diferencia del canal de operadores,
 * acá cualquier teléfono puede escribir — whatsappClienteAuth.middleware.js
 * se encarga de pedir aprobación de un administrador antes de dejarlo pedir.
 */
app.use(
  "/api/v1/whatsapp/pedidos",
  apiKeyMiddleware,
  whatsappClienteAuthMiddleware,
  apiRateLimit,
  whatsappClienteConversationRoutes,
);
app.use(
  "/api/v1/whatsapp/clientes",
  jwtMiddleware,
  apiRateLimit,
  whatsappClienteAdminRoutes,
);
// Padron protegido con JWT
app.use("/api/v1/padron", jwtMiddleware, padronRoutes);

/*
 * Maneja los errores de toda la API respetando
 * los códigos HTTP definidos por cada módulo.
 */
app.use((err, req, res, next) => {
  console.error(err);

  const status = err.status || err.statusCode || 500;

  res.status(status).json({
    ok: false,
    error: err.message || "Error interno del servidor.",
    details: err.details || null,
  });
});

module.exports = app;
