const CommercialParser = require("../commercial-parser");

const CommercialCommandContext = require("./commercialCommandContext");

const States = require("./commercialConversationStates");

const ResponseBuilder = require("./commercialConversationResponseBuilder");

const CommercialWorkspaceMapper = require("./commercialWorkspaceMapper");

const WorkspaceEngine = require("../../workspace/workspaceEngine");

const WorkspaceConfirmationEngine = require("../../workspace/workspaceConfirmationEngine");

const { buscarProductos } = require("../../repositories/producto.repository");

const { getStock, getDepositoPrincipal } = require("../../repositories/stock.repository");

const { crearReserva } = require("../../repositories/stockReserva.repository");
const { emitirNotaCredito } = require("../../services/notaCredito.service");
const { normalizeSaleCondition } = require("../../repositories/documentoComercial.repository");
const { generarPDFDocumento } = require("../../services/documentoPdf.service");
const { crearCobro, generarImagenQR } = require("../../services/paymentGateway.service");
const { guardarLink } = require("../../repositories/paymentLink.repository");
const db = require("../../db/database");

const ResolverEngine = require("../../resolver/resolverEngine");

const AI = require("../../services/aiConversation.service");

const ArgentinoNormalizer = require("./argentinoNormalizer");

/*
 * CommercialConversationEngine
 *
 * Administra una conversación comercial completa.
 *
 * Interpreta los mensajes mediante CommercialParser,
 * mantiene el contexto de conversación, utiliza workspaces
 * para construir la operación y finalmente confirma
 * el documento mediante WorkspaceConfirmationEngine.
 */
class CommercialConversationEngine {
  /*
   * Inicia un contexto comercial nuevo
   * a partir de un mensaje recibido.
   */
  start({ message, channel = "API" }) {
    return CommercialCommandContext.fromMessage({
      message,
      channel,
    });
  }

  /*
   * Procesa el contexto comercial desde su estado actual.
   */
  async execute({ context, empresaId, usuarioId, empresaNombre = "", autorizado = false }) {
    this.assertContext(context);

    /*
     * El primer mensaje de una conversación nueva se procesa
     * con la capa IA (DeepSeek) para admitir frases naturales
     * completas. Se consume una sola vez para evitar bucles.
     */
    if (context.metadata?.mensajeInicial) {
      const textoInicial = context.metadata.mensajeInicial;
      delete context.metadata.mensajeInicial;
      const aiInicial = await this.interpretarConIA({
        context,
        text: textoInicial,
        empresaId,
        usuarioId,
        empresaNombre,
        autorizado,
      });
      if (aiInicial) return aiInicial;
    }

    /*
     * Cuando todavía no se reconoció una operación,
     * solicita el tipo de documento.
     */
    if (context.state === States.WAITING_OPERATION) {
      return ResponseBuilder.askOperation(context);
    }

    /*
     * Las operaciones basadas en documentos origen
     * se procesan mediante el flujo de conversión.
     */
    if (context.command.sourceDocument) {
      return this.prepareDocumentConversion({
        context,
        empresaId,
        usuarioId,
        empresaNombre,
      });
    }

    /*
     * Crea o recupera el workspace y sincroniza
     * los datos comerciales interpretados.
     */
    const workspace = this.ensureWorkspace({
      context,
      empresaId,
      usuarioId,
    });

    /*
     * Solicita el cliente cuando todavía
     * no fue informado.
     */
    if (!context.command.hasCustomer()) {
      context.changeState(States.WAITING_CUSTOMER);

      return ResponseBuilder.askCustomer(context);
    }

    /*
     * Busca y asigna el cliente al workspace.
     */
    const customerResponse = this.resolveCustomer({
      context,
      workspace,
      empresaId,
      usuarioId,
    });

    if (customerResponse) {
      return customerResponse;
    }

    /*
     * Solicita artículos cuando todavía
     * no se informó ningún producto.
     */
    if (!context.command.hasProducts()) {
      context.changeState(States.WAITING_PRODUCT);

      return ResponseBuilder.askProduct(context);
    }

    /*
     * Busca y agrega todos los productos
     * pendientes al workspace.
     */
    const productResponse = this.resolvePendingProducts({
      context,
      workspace: WorkspaceEngine.load(context.workspaceId),
      empresaId,
      usuarioId,
    });

    if (productResponse) {
      return productResponse;
    }

    /*
     * Sincroniza nuevamente los datos comerciales.
     *
     * Esto permite guardar datos incorporados en mensajes
     * posteriores, como descuento o condición de venta.
     */
    this.synchronizeWorkspaceCommercialData({
      context,
      empresaId,
      usuarioId,
    });

    /*
     * Cuando todo está resuelto, muestra
     * el resumen previo a la confirmación.
     */
    return this.prepareConfirmation({
      context,
      empresaNombre,
    });
  }

  /*
   * Continúa una conversación existente
   * utilizando un mensaje nuevo.
   */
  async continue({
    context,
    message,
    empresaId,
    usuarioId,
    empresaNombre = "",
    autorizado = false,
  }) {
    this.assertContext(context);

    /*
     * Normaliza primero el lenguaje coloquial argentino (tipos y
     * sinónimos de acción) de forma local, sin consumir tokens de IA.
     * Esto limpia el mensaje antes de pasarlo al parser o a la IA.
     */
    const text = ArgentinoNormalizer.normalizar(String(message || "").trim());

    /*
     * Cuando llega un mensaje vacío, devuelve
     * la respuesta correspondiente al estado actual.
     */
    if (!text) {
      return this.responseForCurrentState({
        context,
        empresaNombre,
      });
    }

    /*
     * Detección local (sin IA) de condición de venta: "cuenta corriente",
     * "cta cte", "al contado", "efectivo". Corre ANTES de la IA para que
     * la regla determinística gane y no se confunda con producto/dirección.
     */
    const condicionDetectada = this.detectarCondicionVenta(text);
    if (
      condicionDetectada &&
      [States.WAITING_PRODUCT, States.WAITING_CONFIRMATION].includes(context.state)
    ) {
      context.command.condicionVenta = condicionDetectada;
      context.command.payment = { type: condicionDetectada };
      return ResponseBuilder.build({
        type: "CONDICION_VENTA_INFO",
        message: `Listo, dejo el pedido en ${condicionDetectada === "CUENTA_CORRIENTE" ? "cuenta corriente" : "contado"}.`,
        context,
      });
    }

    /*
     * Detección local (sin IA) de envío de comprobantes: "enviame la
     * factura", "mandame el remito", "pasame el presupuesto", "reenviame
     * la factura", "no me mandes la factura", etc. Corre antes de la IA.
     * Se aplica cuando ya hay un pedido/cliente activo (o recién terminó).
     */
    const envioDetectado = this.detectarEnvioDocumento(text);
    if (
      envioDetectado &&
      (context.workspaceId ||
        context.command?.operation ||
        context.command?.customer?.id ||
        context.command?.products?.length)
    ) {
      return this.aiEnviarDocumento({
        context,
        det: envioDetectado,
        empresaId,
        usuarioId,
        empresaNombre,
      });
    }

    /*
     * Detección local (sin IA) de cobro con pasarela: "link de pago",
     * "cobro con mercado pago", "qr para pagar", "mandame el link", etc.
     * Corre antes de la IA para que el flujo determinístico genere el QR.
     */
    const linkDetectado = this.detectarLinkPago(text);
    if (
      linkDetectado &&
      (context.workspaceId ||
        context.command?.operation ||
        context.command?.customer?.id ||
        context.command?.products?.length ||
        context.metadata?.documentosGenerados)
    ) {
      return this.aiEnviarLinkPago({
        context,
        empresaId,
        usuarioId,
        empresaNombre,
      });
    }

    /*
     * Capa IA opcional (DeepSeek): interpreta el lenguaje natural y
     * habilita correcciones que el parser por reglas no cubre
     * (quitar, reemplazar, saldo, repetir, etc.). Se activa en las
     * fases de producto y confirmación (donde ocurren las correcciones
     * naturales) y en operación (nuevo pedido / cancelar). Se omite al
     * identificar cliente y durante la selección numérica de opciones,
     * para no confundir nombres de cliente con órdenes.
     */
    const esSeleccionNumerica = /^\s*\d+\s*$/.test(text);
    const estadoConIA = [
      States.WAITING_PRODUCT,
      States.WAITING_CONFIRMATION,
      States.WAITING_OPERATION,
    ].includes(context.state);
    /*
     * Los comandos cortos de control ya los resuelve el flujo
     * clásico (omitir, sí, no, confirmar, cancelar, dale, etc.).
     * Se excluyen de la IA para evitar malas clasificaciones
     * de frases tan breves.
     */
    const esComandoClasico = /^(omit|omitir|omitilo|si|sí|no|confirm|confirmar|confirmá|cancel|cancelar|cancelá|dale|cerrar|listo|terminamos|ya esta)/i.test(
      text.trim(),
    );
    if (!esSeleccionNumerica && estadoConIA && !esComandoClasico) {
      const aiHandled = await this.interpretarConIA({
        context,
        text,
        empresaId,
        usuarioId,
        empresaNombre,
        autorizado,
      });
      if (aiHandled) return aiHandled;
    }

    /*
     * La cancelación se procesa antes
     * que cualquier otro comando.
     */
    if (this.isCancelMessage(text)) {
      context.changeState(States.CANCELLED);

      return ResponseBuilder.cancelled(context);
    }

    /*
     * Procesa el mensaje según el estado
     * actual de la conversación.
     */
    switch (context.state) {
      case States.WAITING_OPERATION:
        return this.handleOperationMessage({
          context,
          message: text,
          empresaId,
          usuarioId,
          empresaNombre,
        });

      case States.WAITING_CUSTOMER:
        return this.handleCustomerMessage({
          context,
          message: text,
          empresaId,
          usuarioId,
          empresaNombre,
        });

      case States.WAITING_CUSTOMER_SELECTION:
        return this.handleCustomerSelection({
          context,
          message: text,
          empresaId,
          usuarioId,
          empresaNombre,
        });

      case States.WAITING_PRODUCT:
        return this.handleProductMessage({
          context,
          message: text,
          empresaId,
          usuarioId,
          empresaNombre,
        });

      case States.WAITING_PRODUCT_SELECTION:
        return this.handleProductSelection({
          context,
          message: text,
          empresaId,
          usuarioId,
          empresaNombre,
        });

      case States.WAITING_CONFIRMATION:
        return this.handleConfirmation({
          context,
          message: text,
          empresaId,
          usuarioId,
          empresaNombre,
        });

      case States.PROCESSING:
        return {
          ok: true,

          response: {
            type: "OPERATION_PROCESSING",

            message: "La operación se está procesando.",
          },

          context: context.toPlainObject(),
        };

      case States.COMPLETED:
        return {
          ok: true,

          response: {
            type: "CONVERSATION_COMPLETED",

            message:
              "La operación ya fue completada. Iniciá una nueva conversación para crear otro documento.",
          },

          context: context.toPlainObject(),
        };

      case States.CANCELLED:
        return ResponseBuilder.cancelled(context);

      default:
        return this.responseForCurrentState({
          context,
          empresaNombre,
        });
    }
  }

  /*
   * Capa IA: DeepSeek interpreta el mensaje y devuelve una
   * respuesta del motor cuando la intención es una corrección
   * natural o una acción que el parser clásico no resuelve.
   * Devuelve null para dejar que el flujo clásico continúe.
   */
  async interpretarConIA({ context, text, empresaId, usuarioId, empresaNombre, autorizado = false }) {
    if (!AI.enabled()) return null;

    let intent;
    try {
      intent = await AI.interpretarPedido({
        message: text,
        contexto: {
          state: context.state,
          operation: context.command.operation || null,
          productos: (context.command.products || []).map((p) => p.description || p.descripcion),
          cliente: context.command.customer?.text || null,
        },
      });
    } catch (e) {
      return null;
    }
    if (!intent || !intent.intencion) return null;

    const tipo = this.normalizarIntencion(intent.intencion);
    const sinProductos = !Array.isArray(intent.items) || intent.items.length === 0;

    /*
     * La condición de venta (contado / cuenta corriente) se aplica siempre
     * que la IA la detecte, sin importar la intención clasificada.
     */
    if (intent.condicionVenta) {
      context.command.condicionVenta = normalizeSaleCondition(intent.condicionVenta);
    }

    /*
     * Estas acciones son solo para empleados autorizados en WhatsApp.
     * Si quien escribe no está habilitado, se rechazan sin ejecutarlas.
     */
    const INTENCIONES_PRIVILEGIADAS = ["facturar", "nota_credito", "reservar_stock"];
    if (INTENCIONES_PRIVILEGIADAS.includes(tipo) && !autorizado) {
      return ResponseBuilder.build({
        type: "NO_AUTORIZADO",
        message:
          "Esa acción es solo para empleados autorizados. Si sos parte del equipo, escribime desde tu número habilitado.",
        context,
      });
    }

    switch (tipo) {
      case "agregar":
      case "agregar_productos":
        if (sinProductos) return null;
        return this.aiAgregar({ context, intent, empresaId, usuarioId, empresaNombre });

      case "quitar":
        return this.aiQuitar({ context, intent, empresaId, usuarioId, empresaNombre });

      case "reemplazar":
        return this.aiReemplazar({ context, intent, empresaId, usuarioId, empresaNombre });

      case "cambiar_cantidad":
        return this.aiCambiarCantidad({ context, intent, empresaId, usuarioId, empresaNombre });

      case "saldo":
        return this.aiSaldo({ context, empresaId });

      case "repetir_ultimo":
        return this.aiRepetirUltimo({ context, empresaId, usuarioId, empresaNombre });

      case "resumen":
        return this.aiResumen({ context, empresaId, usuarioId, empresaNombre });

      case "direccion":
        if (intent.direccion) {
          context.metadata.direccionEntrega = intent.direccion;
          if (!context.command.notes) context.command.notes = [];
          context.command.notes.push(`Entrega: ${intent.direccion}`);
        }
        return ResponseBuilder.build({
          type: "DIRECCION_REGISTRADA",
          message: `¡Perfecto! Lo anoto para entregar en “${intent.direccion}”. ¿Seguimos?`,
          context,
        });

      case "confirmar":
      case "cerrar":
        return this.handleConfirmation({ context, message: "SI", empresaId, usuarioId, empresaNombre });

      case "cancelar":
        context.changeState(States.CANCELLED);
        return ResponseBuilder.cancelled(context);

      case "nuevo_pedido":
        context.command.products = [];
        context.command.customer = null;
        context.command.operation = null;
        this.refreshContextValidation(context);
        context.changeState(States.WAITING_OPERATION);
        return ResponseBuilder.askOperation(context);

      case "consultar_precio":
        return this.aiConsultarPrecio({ context, intent, empresaId });

      case "consultar_stock":
        return this.aiConsultarStock({ context, intent, empresaId });

      case "aplicar_descuento":
        return this.aiAplicarDescuento({ context, intent, empresaId, usuarioId, empresaNombre });

      case "facturar":
        return this.aiFacturar({ context, empresaId, usuarioId, empresaNombre });

      case "nota_credito":
        return this.aiNotaCredito({ context, intent, empresaId, usuarioId, empresaNombre });

      case "condicion_venta":
        return this.aiCondicionVenta({ context, intent, empresaId, usuarioId, empresaNombre });

      case "link_pago":
        return this.aiEnviarLinkPago({ context, empresaId, usuarioId, empresaNombre });

      case "reservar_stock":
        return this.aiReservarStock({ context, empresaId, usuarioId });

      case "ayuda":
        return ResponseBuilder.build({
          type: "AYUDA",
          message:
            "Te ayudo con tu pedido. Podés: agregar productos (cargame 10 cemento), sacarlos (sacame la cal), cambiar cantidad (poneme 5), consultar precio (cuánto sale el cemento), consultar stock (hay stock de cal), pedir tu saldo, repetir un pedido anterior, hacer un descuento o confirmar cuando esté listo.",
          context,
        });

      case "omitir":
        if (context.pendingProduct) {
          context.removeProductAt(Number(context.pendingProduct.productIndex)).clearMissingProduct();
        }
        context.changeState(States.WAITING_PRODUCT);
        return ResponseBuilder.askProduct(context);

      default:
        return null;
    }
  }

  /*
   * Agrega productos interpretados por la IA al comando.
   */
  async aiAgregar({ context, intent, empresaId, usuarioId, empresaNombre }) {
    if (!context.command.operation || context.command.operation === "UNKNOWN") {
      context.command.operation = "PEDIDO";
      context.changeState(States.WAITING_PRODUCT);
    }
    for (const it of intent.items) {
      const desc = String(it.descripcion || "").trim();
      const qty = Number(it.cantidad || 1);
      if (!desc) continue;
      context.command.products.push({
        description: desc,
        busquedaOriginal: desc,
        quantity: Math.max(0.001, qty),
        discount: 0,
        resolved: false,
      });
    }
    this.refreshContextValidation(context);
    return this.execute({ context, empresaId, usuarioId, empresaNombre });
  }

  /*
   * Busca un ítem en el workspace actual por descripción normalizada.
   */
  buscarItemWorkspace(context, empresaId, descripcionNorm) {
    if (!context.workspaceId) return null;
    try {
      const ws = WorkspaceEngine.load(context.workspaceId);
      return (
        ws.items.find((it) => {
          const p = String(it.descripcion || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "");
          return p.includes(descripcionNorm) || descripcionNorm.includes(p);
        }) || null
      );
    } catch (e) {
      return null;
    }
  }

  /*
   * Unifica sinónimos de intención devueltos por la IA.
   */
  normalizarIntencion(valor) {
    const t = String(valor || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    const mapa = {
      agregar: "agregar",
      add: "agregar",
      agregar_productos: "agregar",
      quitar: "quitar",
      sacar: "quitar",
      eliminar: "quitar",
      remover: "quitar",
      borrar: "quitar",
      reemplazar: "reemplazar",
      cambiar: "reemplazar",
      sustituir: "reemplazar",
      cambiar_cantidad: "cambiar_cantidad",
      modificar_cantidad: "cambiar_cantidad",
      saldo: "saldo",
      consultar_saldo: "saldo",
      resumen: "resumen",
      ver_pedido: "resumen",
      direccion: "direccion",
      dirección: "direccion",
      entrega: "direccion",
      repetir_ultimo: "repetir_ultimo",
      repetir: "repetir_ultimo",
      confirmar: "confirmar",
      cerrar: "confirmar",
      confirmar_pedido: "confirmar",
      cancelar: "cancelar",
      nuevo_pedido: "nuevo_pedido",
      omitir: "omitir",
      omitilo: "omitir",
      omitir_producto: "omitir",
      consultar_precio: "consultar_precio",
      consultarprecio: "consultar_precio",
      precio: "consultar_precio",
      cotizar: "consultar_precio",
      cotizar_precio: "consultar_precio",
      consultar_stock: "consultar_stock",
      stock: "consultar_stock",
      consultarstock: "consultar_stock",
      aplicar_descuento: "aplicar_descuento",
      descuento: "aplicar_descuento",
      facturar: "facturar",
      emitir_factura: "facturar",
      nota_credito: "nota_credito",
      nota_de_credito: "nota_credito",
      reservar_stock: "reservar_stock",
      reservarstock: "reservar_stock",
      condicion_venta: "condicion_venta",
      cuentacorriente: "condicion_venta",
      cta_cte: "condicion_venta",
      link_pago: "link_pago",
      linkdepago: "link_pago",
      cobro: "link_pago",
      cobrar: "link_pago",
      mercadopago: "link_pago",
      linkmercadopago: "link_pago",
      qrparapagar: "link_pago",
      pagarqr: "link_pago",
      ayuda: "ayuda",
      si: "si",
      sí: "si",
      no: "no",
    };
    return mapa[t] || t;
  }

  /*
   * Normaliza texto para comparación de productos.
   */
  normalizarTexto(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  /*
   * Detecta frases de condición de venta sin consumir IA.
   * Devuelve "CUENTA_CORRIENTE", "CONTADO" o null.
   */
  detectarCondicionVenta(text) {
    const t = this.normalizarTexto(text);
    if (/(cuenta\s*corriente|cta\s*cte|ctacte|cuenta\s*cte)/.test(t)) {
      return "CUENTA_CORRIENTE";
    }
    if (/(contado|efectivo|al\s*contado|en\s*efectivo)/.test(t)) {
      return "CONTADO";
    }
    return null;
  }

  /*
   * Detecta intenciones de envío de comprobantes sin consumir IA.
   * Devuelve { intencion, tipo } o null.
   */
  detectarEnvioDocumento(text) {
    const t = this.normalizarTexto(text);
    const tieneDoc =
      /(factura|remito|presupuesto|cotizacion|recibo|nota\s*de\s*credito|nota\s*de\s*debito|pdf|comprobante|documento)/.test(
        t,
      );
    const verboEnvio =
      /(envia|manda|pasa|reenvia|vuelve|mandalo|enviamelo|pasamelo|mandame|enviame|por\s+aca|por\s+whatsapp|por\s+mail|por\s+correo)/.test(
        t,
      );
    const cancelar =
      /(no\s+me\s+mandes|no\s+envies|no\s+lo\s+envies|cancel[aá]|dej[aá]|no\s+hace\s+falta|solo\s+dejalo|solo\s+cargalo|no\s+necesito\s+copia)/.test(
        t,
      );
    const reenviar =
      /(reenvia|vuelve|de\s+nuevo|nuevamente|no\s+me\s+llego|no\s+recibi|otra\s+vez)/.test(
        t,
      );
    if (!((tieneDoc && verboEnvio) || cancelar || reenviar)) {
      return null;
    }
    let tipo = "DOCUMENTO";
    if (/factura/.test(t)) tipo = "FACTURA";
    else if (/remito/.test(t)) tipo = "REMITO";
    else if (/(presupuesto|cotizacion)/.test(t)) tipo = "PRESUPUESTO";
    else if (/nota\s*de\s*credito|nota\s*de\s*debito/.test(t)) tipo = "NOTA_CREDITO";
    else if (/recibo/.test(t)) tipo = "RECIBO";
    let intencion = "ENVIAR_DOCUMENTO";
    if (cancelar) intencion = "CANCELAR_ENVIO_DOCUMENTO";
    else if (reenviar) intencion = "REENVIAR_DOCUMENTO";
    else if (tipo !== "DOCUMENTO") intencion = `ENVIAR_${tipo}`;
    return { intencion, tipo };
  }

  /*
   * Detecta frases de cobro con pasarela (MercadoPago / QR dinámico)
   * sin consumir IA. Devuelve true o null.
   */
  detectarLinkPago(text) {
    const t = this.normalizarTexto(text);
    const patron =
      /(mercado\s*pago|mercadopago|link\s*de\s*pago|link\s*para\s*pagar|link\s*de\s*cobro|link\s*de\s*mercado|qr\s*para\s*pagar|pagar\s*por\s*qr|cobrar\s*con\s*qr|mandame\s*(el|un)\s*link|enviame\s*(el|un)\s*link|generame\s*(el|un)\s*link|pasame\s*(el|un)\s*link|quiero\s*pagar|pagame|forma\s*de\s*pagar|codigo\s*para\s*pagar|cobro\s*qr)/;
    return patron.test(t) ? true : null;
  }

  normalizarTipoDocumento(tipo) {
    const t = String(tipo || "").trim().toUpperCase();
    if (t.startsWith("FACTURA")) return "FACTURA";
    if (t.startsWith("REMITO")) return "REMITO";
    if (t.startsWith("PRESUPUESTO")) return "PRESUPUESTO";
    if (t.includes("NOTA DE CREDITO")) return "NOTA_CREDITO";
    if (t.includes("NOTA DE DEBITO")) return "NOTA_DEBITO";
    if (t.startsWith("RECIBO")) return "RECIBO";
    return "DOCUMENTO";
  }

  etiquetaDocumento(tipo) {
    const mapa = {
      FACTURA: "la factura",
      REMITO: "el remito",
      PRESUPUESTO: "el presupuesto",
      NOTA_CREDITO: "la nota de crédito",
      NOTA_DEBITO: "la nota de débito",
      RECIBO: "el recibo",
    };
    return mapa[tipo] || "el comprobante";
  }

  /*
   * Resuelve el id del documento a enviar: primero los generados en
   * esta conversación y, si no, el último del cliente para ese tipo.
   */
  resolverDocumentoEnvio({ context, empresaId, tipo }) {
    const clienteId = context.command?.customer?.id;
    const tipos =
      tipo === "DOCUMENTO"
        ? ["FACTURA", "REMITO", "PRESUPUESTO", "NOTA_CREDITO"]
        : [tipo];
    const capturados = context.metadata?.documentosGenerados || {};
    for (const tp of tipos) {
      if (capturados[tp]) return capturados[tp];
    }
    if (clienteId) {
      const placeholders = tipos.map(() => "?").join(",");
      const row = db
        .prepare(
          `SELECT id FROM documentos_comerciales WHERE empresa_id=? AND cliente_id=? AND tipo IN (${placeholders}) ORDER BY id DESC LIMIT 1`,
        )
        .get(empresaId, clienteId, ...tipos);
      if (row) return row.id;
    }
    return null;
  }

  /*
   * Captura el documento recién generado y, si hay un envío pendiente
   * para ese tipo, genera el PDF y lo adjunta al resultado para que el
   * canal (WhatsApp) lo envíe automáticamente.
   */
  async capturarDocumentoYResolverEnvio({ context, empresaId, result }) {
    const doc =
      result?.documento ||
      result?.resultado?.documento ||
      result?.result?.documento ||
      null;
    if (doc?.id) {
      if (!context.metadata) context.metadata = {};
      if (!context.metadata.documentosGenerados) {
        context.metadata.documentosGenerados = {};
      }
      context.metadata.documentosGenerados[
        this.normalizarTipoDocumento(doc.tipo)
      ] = doc.id;
    }
    const pendiente = context.metadata?.envioPendiente;
    if (pendiente && doc?.id) {
      const tipoGen = this.normalizarTipoDocumento(doc.tipo);
      if (pendiente.tipo === "DOCUMENTO" || pendiente.tipo === tipoGen) {
        try {
          const { pdf } = await generarPDFDocumento({
            empresa: { id: empresaId },
            documentoId: doc.id,
          });
          result.pdf = pdf;
          if (result.resultado) result.resultado.pdf = pdf;
          if (result.result) result.result.pdf = pdf;
          context.metadata.envioPendiente = null;
        } catch (e) {
          // Si falla el PDF, el pedido igual quedó cargado.
        }
      }
    }
    const cobroPendiente = context.metadata?.cobroPendiente;
    if (cobroPendiente && doc?.id && this.normalizarTipoDocumento(doc.tipo) === "FACTURA") {
      try {
        const cobro = await this.crearCobroParaDocumento(context, empresaId, doc.id);
        if (cobro?.result?.imagen) {
          result.imagen = cobro.result.imagen;
          if (result.resultado) result.resultado.imagen = cobro.result.imagen;
          if (result.result) result.result.imagen = cobro.result.imagen;
          context.metadata.cobroPendiente = null;
        }
      } catch (e) {
        // Si falla el cobro, la factura igual quedó emitida.
      }
    }
  }

  /*
   * Devuelve el índice del producto del carrito que coincide con el
   * texto dado, comparando descripción resuelta y búsqueda original.
   */
  indiceProductoPorTexto(context, texto) {
    const nd = this.normalizarTexto(texto);
    const prods = context.command.products || [];
    for (let i = 0; i < prods.length; i++) {
      const p = this.normalizarTexto(prods[i].description || "");
      const o = this.normalizarTexto(prods[i].busquedaOriginal || "");
      if (p.includes(nd) || nd.includes(p) || o.includes(nd) || nd.includes(o)) {
        return i;
      }
    }
    return -1;
  }

  /*
   * Quita (o descuenta) un producto del carrito.
   */
  aiQuitar({ context, intent, empresaId, usuarioId, empresaNombre }) {
    const desc = String(intent.items?.[0]?.descripcion || intent.descripcion || "").trim();
    if (!desc) return ResponseBuilder.askProduct(context);

    const nd = this.normalizarTexto(desc);
    const prods = context.command.products || [];
    const idx = this.indiceProductoPorTexto(context, desc);
    if (idx === -1) {
      return ResponseBuilder.build({
        type: "PRODUCT_NOT_IN_CART",
        message: `No tengo “${desc}” en el pedido.`,
        context,
      });
    }
    const qtyQuitar = Number(intent.items?.[0]?.cantidad || 0);
    const actual = prods[idx];

    if (context.workspaceId) {
      const wsItem = this.buscarItemWorkspace(context, empresaId, nd);
      if (wsItem) {
        try {
          if (qtyQuitar > 0 && Number(actual.quantity) > qtyQuitar) {
            WorkspaceEngine.updateItem({
              workspaceId: context.workspaceId,
              empresaId,
              itemId: wsItem.id,
              cantidad: Number(actual.quantity) - qtyQuitar,
              usuarioId,
            });
          } else {
            WorkspaceEngine.removeItem({
              workspaceId: context.workspaceId,
              empresaId,
              itemId: wsItem.id,
              usuarioId,
            });
          }
        } catch (e) {
          /* el workspace se reintenta al reejecutar */
        }
      }
    }

    if (qtyQuitar > 0 && Number(actual.quantity) > qtyQuitar) {
      actual.quantity = Number(actual.quantity) - qtyQuitar;
      this.refreshContextValidation(context);
      return ResponseBuilder.build({
        type: "PRODUCT_UPDATED",
        message: `Te dejo ${actual.quantity} de ${actual.description}.`,
        context,
      });
    }
    context.removeProductAt(idx);
    if ((context.command.products || []).length === 0) {
      context.changeState(States.WAITING_PRODUCT);
      return ResponseBuilder.askProduct(context);
    }
    return this.execute({ context, empresaId, usuarioId, empresaNombre });
  }

  /*
   * Reemplaza un producto del carrito por otro.
   */
  async aiReemplazar({ context, intent, empresaId, usuarioId, empresaNombre }) {
    const original = String(intent.descripcionOriginal || intent.items?.[0]?.descripcion || "").trim();
    const nuevo = String(intent.descripcionNueva || intent.items?.[1]?.descripcion || "").trim();
    if (!original || !nuevo) return null;

    const no = this.normalizarTexto(original);
    const prods = context.command.products || [];
    const idx = this.indiceProductoPorTexto(context, original);
    if (idx === -1) {
      return ResponseBuilder.build({
        type: "PRODUCT_NOT_IN_CART",
        message: `No tengo “${original}” en el pedido.`,
        context,
      });
    }
    const cantidad = Number(prods[idx].quantity) || 1;
    const resolution = ResolverEngine.resolveProduct({ empresaId, texto: nuevo, limit: 8 });
    const options = resolution.opciones || [];
    if (!Array.isArray(options) || options.length === 0) {
      return ResponseBuilder.build({
        type: "PRODUCT_NOT_FOUND",
        message: `No encontré “${nuevo}” en el catálogo.`,
        context,
      });
    }
    if (resolution.estado === "RESUELTO" || options.length === 1) {
      const sel = resolution.seleccionado || options[0];
      if (context.workspaceId) {
        const wsItem = this.buscarItemWorkspace(context, empresaId, no);
        if (wsItem) {
          try {
            WorkspaceEngine.removeItem({
              workspaceId: context.workspaceId,
              empresaId,
              itemId: wsItem.id,
              usuarioId,
            });
          } catch (e) {
            /* se reintenta al reejecutar */
          }
        }
        try {
          WorkspaceEngine.addProduct({
            workspaceId: context.workspaceId,
            empresaId,
            productoId: sel.id,
            cantidad,
            descuento: 0,
            usuarioId,
          });
        } catch (e) {
          /* se reintenta al reejecutar */
        }
      }
      context.command.products[idx] = {
        description: sel.descripcion || sel.nombre,
        quantity: cantidad,
        discount: 0,
        resolved: true,
        id: sel.id,
      };
      this.refreshContextValidation(context);
      return this.execute({ context, empresaId, usuarioId, empresaNombre });
    }
    context.setProductOptions(options, {
      productIndex: idx,
      quantity: cantidad,
      description: nuevo,
      discount: 0,
    });
    return ResponseBuilder.selectProduct(context, options, { searchText: nuevo, quantity: cantidad });
  }

  /*
   * Cambia la cantidad de un producto del carrito.
   */
  aiCambiarCantidad({ context, intent, empresaId, usuarioId, empresaNombre }) {
    const qty = Number(intent.cantidad);
    const desc = String(intent.items?.[0]?.descripcion || "").trim();
    const prods = context.command.products || [];
    let idx = desc ? this.indiceProductoPorTexto(context, desc) : -1;
    if (idx === -1 && prods.length > 0) idx = prods.length - 1;
    if (idx === -1) return ResponseBuilder.askProduct(context);
    if (!Number.isFinite(qty) || qty <= 0) {
      return ResponseBuilder.build({
        type: "PRODUCT_UPDATED",
        message: "¿A cuánto lo dejamos?",
        context,
      });
    }
    prods[idx].quantity = qty;
    if (context.workspaceId) {
      const nd = this.normalizarTexto(desc || prods[idx].description);
      const wsItem = this.buscarItemWorkspace(context, empresaId, nd);
      if (wsItem) {
        try {
          WorkspaceEngine.updateItem({
            workspaceId: context.workspaceId,
            empresaId,
            itemId: wsItem.id,
            cantidad: qty,
            usuarioId,
          });
        } catch (e) {
          /* se reintenta al reejecutar */
        }
      }
    }
    this.refreshContextValidation(context);
    return ResponseBuilder.build({
      type: "PRODUCT_UPDATED",
      message: `Dale, dejamos ${qty} de ${prods[idx].description}.`,
      context,
    });
  }

  /*
   * Consulta el saldo en cuenta corriente del cliente resuelto.
   */
  aiSaldo({ context, empresaId }) {
    const clienteId = context.command.customer?.id || null;
    if (!clienteId) {
      return ResponseBuilder.build({
        type: "SALDO_INFO",
        message: "Primero necesito saber de qué cliente para consultar su saldo.",
        context,
      });
    }
    const db = require("../../db/database");
    let saldo = 0;
    try {
      const row = db
        .prepare(
          "SELECT IFNULL(SUM(debe),0)-IFNULL(SUM(haber),0) AS saldo FROM cuenta_corriente WHERE empresa_id=? AND cliente_id=?",
        )
        .get(empresaId, clienteId);
      saldo = row ? Number(row.saldo) : 0;
    } catch (e) {
      saldo = 0;
    }
    return ResponseBuilder.build({
      type: "SALDO_INFO",
      message: `Tu saldo en cuenta corriente es de $ ${saldo.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}.`,
      context,
    });
  }

  /*
   * Copia el último pedido del cliente al borrador actual.
   */
  async aiRepetirUltimo({ context, empresaId, usuarioId, empresaNombre }) {
    const clienteId = context.command.customer?.id || null;
    if (!clienteId) {
      return ResponseBuilder.build({
        type: "REPETIR_INFO",
        message: "Necesito primero el cliente para buscar su último pedido.",
        context,
      });
    }
    const db = require("../../db/database");
    let doc = null;
    try {
      doc = db
        .prepare(
          "SELECT id, tipo, numero, punto_venta FROM documentos WHERE empresa_id=? AND cliente_id=? AND tipo IN ('PEDIDO','NOTA_PEDIDO','PRESUPUESTO') ORDER BY fecha DESC LIMIT 1",
        )
        .get(empresaId, clienteId);
    } catch (e) {
      doc = null;
    }
    if (!doc) {
      return ResponseBuilder.build({
        type: "REPETIR_INFO",
        message: "No encontré pedidos anteriores para este cliente.",
        context,
      });
    }
    let items = [];
    try {
      items = db.prepare("SELECT descripcion, cantidad FROM documento_items WHERE documento_id=?").all(doc.id);
    } catch (e) {
      items = [];
    }
    if (!items.length) {
      return ResponseBuilder.build({
        type: "REPETIR_INFO",
        message: "El último pedido no tiene ítems.",
        context,
      });
    }
    if (!context.command.operation) context.command.operation = "PEDIDO";
    context.command.products = items.map((it) => ({
      description: it.descripcion,
      quantity: Number(it.cantidad || 1),
      discount: 0,
      resolved: false,
    }));
    this.refreshContextValidation(context);
    return ResponseBuilder.build({
      type: "REPETIR_INFO",
      message: `¡Listo! Copié tu último ${doc.tipo} (#${doc.numero}), tiene ${items.length} productos. ¿Lo modificamos o lo confirmamos?`,
      context,
    });
  }

  /*
   * Responde el precio de un producto consultado por la IA.
   */
  async aiConsultarPrecio({ context, intent, empresaId }) {
    const desc = String(
      intent.items?.[0]?.descripcion || intent.descripcionOriginal || intent.textoOriginal || "",
    ).trim();
    if (!desc) {
      return ResponseBuilder.build({
        type: "CONSULTA_PRECIO",
        message: "¿De qué producto querés saber el precio?",
        context,
      });
    }
    const coincidencias = buscarProductos({ empresaId, texto: desc, limit: 5 });
    if (!coincidencias.length) {
      return ResponseBuilder.build({
        type: "CONSULTA_PRECIO",
        message: `No encontré "${desc}" en el catálogo. ¿Me das el nombre exacto?`,
        context,
      });
    }
    const p = coincidencias[0];
    const nombre = p.descripcion || desc;
    const precio = Number(p.precio || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const extra =
      coincidencias.length > 1
        ? ` (También hallé ${coincidencias.length - 1} más, decime cuál si querés).`
        : "";
    return ResponseBuilder.build({
      type: "CONSULTA_PRECIO",
      message: `El ${nombre} sale $ ${precio}.${extra}`,
      context,
    });
  }

  /*
   * Responde el stock disponible de un producto consultado por la IA.
   */
  async aiConsultarStock({ context, intent, empresaId }) {
    const desc = String(
      intent.items?.[0]?.descripcion || intent.descripcionOriginal || intent.textoOriginal || "",
    ).trim();
    if (!desc) {
      return ResponseBuilder.build({
        type: "CONSULTA_STOCK",
        message: "¿De qué producto querés saber el stock?",
        context,
      });
    }
    const coincidencias = buscarProductos({ empresaId, texto: desc, limit: 5 });
    if (!coincidencias.length) {
      return ResponseBuilder.build({
        type: "CONSULTA_STOCK",
        message: `No encontré "${desc}" en el catálogo.`,
        context,
      });
    }
    const p = coincidencias[0];
    const nombre = p.descripcion || desc;
    const deposito = getDepositoPrincipal(empresaId);
    let cantidad = 0;
    if (deposito) {
      const st = getStock({ empresaId, depositoId: deposito.id, productoId: p.id });
      cantidad = Number(st?.cantidad || 0);
    }
    const msg =
      cantidad > 0
        ? `De ${nombre} tengo ${cantidad} en stock.`
        : `De ${nombre} no me figura stock cargado en este momento.`;
    return ResponseBuilder.build({ type: "CONSULTA_STOCK", message: msg, context });
  }

  /*
   * Aplica un descuento general al pedido (porcentaje) desde la IA.
   */
  async aiAplicarDescuento({ context, intent, empresaId }) {
    const pct = Number(intent.descuento || intent.cantidad || 0);
    if (!pct || pct <= 0) {
      return ResponseBuilder.build({
        type: "DESCUENTO_INFO",
        message: "¿Cuánto de descuento le hago? Pasame el porcentaje (por ejemplo: 10).",
        context,
      });
    }
    const valor = Math.min(100, Math.max(0, pct));
    context.command.discount = { percentage: valor };
    this.refreshContextValidation(context);
    return ResponseBuilder.build({
      type: "DESCUENTO_INFO",
      message: `¡Listo! Aplico ${valor}% de descuento al pedido.`,
      context,
    });
  }

  /*
   * Factura el pedido en curso (solo empleados autorizados).
   * Reutiliza el pipeline de confirmación con operación FACTURA.
   */
  async aiFacturar({ context, empresaId, usuarioId, empresaNombre }) {
    if (!context.workspaceId || !context.command.products?.length) {
      return ResponseBuilder.build({
        type: "FACTURAR_INFO",
        message: "Para facturar necesito primero el cliente y los productos del pedido.",
        context,
      });
    }
    if (!context.command.customer?.id) {
      return ResponseBuilder.build({
        type: "FACTURAR_INFO",
        message: "Confirmame el cliente y armá el pedido, después lo facturo.",
        context,
      });
    }
    context.command.operation = "FACTURA";
    this.refreshContextValidation(context);
    return this.handleConfirmation({
      context,
      message: "SI",
      empresaId,
      usuarioId,
      empresaNombre,
    });
  }

  /*
   * Cambia la condición de venta del pedido en curso
   * (contado / cuenta corriente). No requiere autorización.
   */
  async aiCondicionVenta({ context, intent, empresaId, usuarioId, empresaNombre }) {
    const condicion = normalizeSaleCondition(intent.condicionVenta) || context.command.condicionVenta || "CONTADO";
    context.command.condicionVenta = condicion;
    context.command.payment = { type: condicion };
    const texto = condicion === "CUENTA_CORRIENTE" ? "cuenta corriente" : condicion;
    return ResponseBuilder.build({
      type: "CONDICION_VENTA_INFO",
      message: `Listo, dejo el pedido en ${texto}.`,
      context,
    });
  }

  /*
   * Envía (o agenda el envío de) un comprobante por el WhatsApp actual.
   * Si el documento ya existe, genera el PDF y lo adjunta; si todavía
   * no se generó, guarda la preferencia y lo envía al crearse.
   */
  async aiEnviarDocumento({ context, det, empresaId, usuarioId, empresaNombre }) {
    const { intencion, tipo } = det;
    const etiqueta = this.etiquetaDocumento(tipo);

    if (intencion === "CANCELAR_ENVIO_DOCUMENTO") {
      if (context.metadata) context.metadata.envioPendiente = null;
      return ResponseBuilder.build({
        type: "ENVIO_CANCELADO",
        message: "Listo, no te lo mando. Queda cargado en el sistema igual.",
        context,
      });
    }

    const docId = this.resolverDocumentoEnvio({ context, empresaId, tipo });
    if (docId) {
      try {
        const { pdf, documento } = await generarPDFDocumento({
          empresa: { id: empresaId },
          documentoId: docId,
        });
        return ResponseBuilder.build({
          type: "ENVIO_DOCUMENTO",
          message: `¡Dale! Te mando ${etiqueta} por este WhatsApp.`,
          result: { pdf, documento },
          context,
        });
      } catch (e) {
        return ResponseBuilder.build({
          type: "ENVIO_DOCUMENTO",
          message: "No pude generar el PDF ahora. Intentalo de nuevo en un momento.",
          context,
        });
      }
    }

    if (!context.metadata) context.metadata = {};
    context.metadata.envioPendiente = { tipo, canal: "WHATSAPP_ACTUAL" };
    return ResponseBuilder.build({
      type: "ENVIO_PENDIENTE",
      message: `Dale, en cuanto genere ${etiqueta} te lo mando por este WhatsApp.`,
      context,
    });
  }

  /*
   * Genera un cobro con pasarela (MercadoPago QR dinámico) para un
   * documento ya existente y devuelve la imagen del QR para enviar.
   */
  async crearCobroParaDocumento(context, empresaId, docId) {
    const doc = db
      .prepare(
        "SELECT id, importe_total AS total, cliente_id, tipo FROM documentos_comerciales WHERE id=?",
      )
      .get(docId);
    if (!doc) {
      return ResponseBuilder.build({
        type: "COBRO_INFO",
        message: "No encontré el comprobante para generar el cobro.",
        context,
      });
    }
    const clienteId = doc.cliente_id || context.command?.customer?.id || null;
    const importe = Number(doc.total || 0);
    try {
      const cobro = await crearCobro({
        empresaId,
        cliente: { id: clienteId },
        importe,
        documentoRef: doc.id,
      });
      const imagen = await generarImagenQR(cobro.qrData, empresaId, doc.id);
      guardarLink({
        empresaId,
        clienteId,
        documentoId: doc.id,
        proveedor: cobro.proveedor,
        importe,
        url: cobro.url,
        qrData: cobro.qrData,
        externalId: cobro.externalId,
        estado: "PENDIENTE",
      });
      const monto = importe.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const modo = cobro.mock
        ? " (modo demo: configurá MERCADOPAGO_ACCESS_TOKEN para cobro real)"
        : "";
      return ResponseBuilder.build({
        type: "COBRO_QR",
        message: `Escaneá este QR de MercadoPago para pagar $${monto}.${modo}`,
        result: { imagen },
        context,
      });
    } catch (e) {
      return ResponseBuilder.build({
        type: "COBRO_INFO",
        message: `No pude generar el cobro con MercadoPago: ${e.message || "intentá de nuevo."}`,
        context,
      });
    }
  }

  /*
   * Envía (o agenda el envío del) QR de cobro de MercadoPago por el
   * WhatsApp actual. Si el documento ya existe, genera el cobro y la
   * imagen; si todavía no se generó, lo deja pendiente y se resuelve al
   * facturar.
   */
  async aiEnviarLinkPago({ context, empresaId, usuarioId, empresaNombre }) {
    const docId = this.resolverDocumentoEnvio({
      context,
      empresaId,
      tipo: "FACTURA",
    });
    if (docId) {
      return await this.crearCobroParaDocumento(context, empresaId, docId);
    }
    if (!context.metadata) context.metadata = {};
    context.metadata.cobroPendiente = { tipo: "FACTURA" };
    return ResponseBuilder.build({
      type: "COBRO_PENDIENTE",
      message:
        "Dale, en cuanto facture la venta te mando el QR de MercadoPago para cobrar.",
      context,
    });
  }

  /*
   * Emite una nota de crédito para el pedido en curso
   * (solo empleados autorizados). Reutiliza el emisor fiscal.
   */
  async aiNotaCredito({ context, intent, empresaId, usuarioId, empresaNombre }) {
    const clienteId = context.command?.customer?.id;
    if (!clienteId) {
      return ResponseBuilder.build({
        type: "NOTA_CREDITO_INFO",
        message: "Para emitir la nota de crédito necesito primero el cliente del pedido.",
        context,
      });
    }
    const numero = intent?.factura || null;
    try {
      const nc = await emitirNotaCredito({
        empresaId,
        clienteId,
        numero,
        condicionVenta: context.command?.condicionVenta || "CONTADO",
        usuarioId,
      });
      return ResponseBuilder.build({
        type: "NOTA_CREDITO_FISCAL",
        message: `Listo. Nota de crédito ${String(nc.puntoVenta).padStart(4, "0")}-${String(nc.numero).padStart(8, "0")} autorizada por AFIP (CAE ${nc.cae}). Total $${Number(nc.total || 0).toFixed(2)}.`,
        context,
        datos: nc,
      });
    } catch (error) {
      const estado = error.afipEstado === "RECHAZADO" ? " AFIP la rechazó." : "";
      return ResponseBuilder.build({
        type: "NOTA_CREDITO_INFO",
        message: `No pude emitir la nota de crédito fiscal.${estado} ${error.message || "Intentá de nuevo."}`,
        context,
      });
    }
  }

  /*
   * Reserva el stock de los ítems resueltos del pedido en curso
   * (solo empleados autorizados).
   */
  async aiReservarStock({ context, empresaId, usuarioId }) {
    if (!context.workspaceId) {
      return ResponseBuilder.build({
        type: "RESERVA_STOCK",
        message: "No hay un pedido en curso para reservar stock.",
        context,
      });
    }
    const ws = WorkspaceEngine.load(context.workspaceId);
    const items = (ws.items || []).filter(
      (it) => it.producto_id && Number(it.cantidad) > 0,
    );
    if (!items.length) {
      return ResponseBuilder.build({
        type: "RESERVA_STOCK",
        message: "El pedido no tiene productos resueltos para reservar.",
        context,
      });
    }
    const deposito = getDepositoPrincipal(empresaId);
    if (!deposito) {
      return ResponseBuilder.build({
        type: "RESERVA_STOCK",
        message: "No encontré un depósito principal para reservar el stock.",
        context,
      });
    }
    const reservados = [];
    for (const it of items) {
      crearReserva({
        empresaId,
        depositoId: deposito.id,
        productoId: it.producto_id,
        cantidad: Number(it.cantidad),
        documentoTipo: "PEDIDO_CHAT",
        documentoId: context.workspaceId,
        observaciones: "Reserva por chat (empleado autorizado)",
        usuarioId,
      });
      reservados.push(`${it.cantidad} x ${it.descripcion}`);
    }
    return ResponseBuilder.build({
      type: "RESERVA_STOCK",
      message: `¡Listo! Reservé stock para: ${reservados.join(", ")}.`,
      context,
    });
  }

  /*
   * Muestra el resumen actual del carrito.
   */
  aiResumen({ context, empresaId, usuarioId, empresaNombre }) {
    if (context.workspaceId) {
      return this.prepareConfirmation({ context, empresaNombre });
    }
    if ((context.command.products || []).length > 0) {
      const lines = ["Llevás estos productos:"];
      context.command.products.forEach((p) => lines.push(`- ${p.quantity} × ${p.description}`));
      return ResponseBuilder.build({ type: "RESUMEN", message: lines.join("\n"), context });
    }
    return ResponseBuilder.askProduct(context);
  }

  /*
   * Incorpora una operación informada
   * en un mensaje posterior.
   */
  async handleOperationMessage({
    context,
    message,
    empresaId,
    usuarioId,
    empresaNombre,
  }) {
    /*
     * Evita interpretar una confirmación
     * como una operación comercial.
     */
    if (this.isConfirmMessage(message)) {
      return ResponseBuilder.askOperation(context);
    }

    const parsed = CommercialParser.Parser.parse({
      message,

      channel: context.command.channel,
    });

    if (!parsed.hasOperation()) {
      return ResponseBuilder.askOperation(context);
    }

    /*
     * Incorpora todos los datos encontrados
     * por el parser en el mismo mensaje.
     */
    this.mergeParsedCommand({
      target: context.command,

      source: parsed,
    });

    this.refreshContextValidation(context);

    context.changeState(
      CommercialCommandContext.determineInitialState(context.command),
    );

    return this.execute({
      context,
      empresaId,
      usuarioId,
      empresaNombre,
    });
  }

  /*
   * Incorpora un cliente informado
   * en un mensaje posterior.
   */
  async handleCustomerMessage({
    context,
    message,
    empresaId,
    usuarioId,
    empresaNombre,
  }) {
    /*
     * Evita buscar clientes llamados
     * Confirmar, Sí, Dale, etc.
     */
    if (this.isConfirmMessage(message)) {
      return ResponseBuilder.askCustomer(context);
    }

    const receivedText = String(message || "").trim();

    if (!receivedText) {
      return ResponseBuilder.askCustomer(context);
    }

    /*
     * Intenta interpretar el mensaje porque
     * podría ser una orden comercial completa.
     */
    const parsed = CommercialParser.Parser.parse({
      message: receivedText,

      channel: context.command.channel,
    });

    /*
     * Usa el cliente detectado por el parser.
     *
     * Cuando el parser no detecta ninguno,
     * solamente acepta el mensaje como cliente
     * si parece una respuesta corta.
     *
     * Nunca utiliza una orden completa como
     * nombre de cliente.
     */
    let customerText = parsed.customer?.text
      ? String(parsed.customer.text).trim()
      : null;

    if (!customerText) {
      if (this.looksLikeCommercialOrder(receivedText)) {
        return ResponseBuilder.askCustomer(context);
      }

      customerText = this.cleanCustomerReply(receivedText);
    }

    if (!customerText) {
      return ResponseBuilder.askCustomer(context);
    }

    context.command.customer = {
      id: null,

      text: customerText,
    };

    /*
     * Incorpora productos, pago, descuento
     * y fecha encontrados en el mismo mensaje.
     */
    this.mergeParsedCommand({
      target: context.command,

      source: parsed,

      preserveOperation: true,

      preserveCustomer: true,
    });

    this.refreshContextValidation(context);

    context.changeState(States.WAITING_CUSTOMER);

    return this.execute({
      context,
      empresaId,
      usuarioId,
      empresaNombre,
    });
  }

  /*
   * Incorpora productos informados
   * en un mensaje posterior.
   */
  async handleProductMessage({
    context,
    message,
    empresaId,
    usuarioId,
    empresaNombre,
  }) {
    /*
     * Evita interpretar una confirmación
     * como descripción de producto.
     */
    if (this.isConfirmMessage(message)) {
      /*
       * Si ya hay productos válidos, "confirmar" significa que el usuario
       * terminó de agregar artículos. Reejecutamos el flujo para resolver
       * pendientes y mostrar el resumen final. Si todavía no hay artículos,
       * mantenemos la solicitud de producto.
       */
      if (context.command.hasProducts()) {
        return this.execute({
          context,
          empresaId,
          usuarioId,
          empresaNombre,
        });
      }

      return ResponseBuilder.askProduct(context);
    }

    const pendingMissing = context.metadata?.lastMissingProduct || null;

    // Una frase genérica como "quiero agregar otro producto" no debe volver a
    // intentar resolver el artículo anterior. Limpia el pendiente y solicita
    // directamente el nuevo artículo, igual para web, n8n y WhatsApp.
    if (/^\s*(quiero\s+)?(agregar|agregá|agrega|sumar|cargar)\s+(otro|un)\s+producto\s*$/i.test(message)) {
      if (pendingMissing) {
        context.removeProductAt(Number(pendingMissing.productIndex)).clearMissingProduct();
      }
      context.changeState(States.WAITING_PRODUCT);
      return ResponseBuilder.askProduct(context);
    }

    if (pendingMissing && this.isOmitProductMessage(message)) {
      context.removeProductAt(Number(pendingMissing.productIndex)).clearMissingProduct();
      context.changeState(States.WAITING_PRODUCT);
      return {
        ...ResponseBuilder.askProduct(context),
        response: {
          ...ResponseBuilder.askProduct(context).response,
          type: "PRODUCT_OMITTED",
          message: `Listo, omití "${pendingMissing.description}". ¿Querés agregar otro producto o confirmar lo que ya tenemos?`,
          actions: ["AGREGAR_OTRO", "CONFIRMAR"],
        },
      };
    }

    let normalizedMessage = this.normalizeFlexibleProductPhrase(message);
    if (pendingMissing && /^\s*(reemplazalo|reemplazar|cambialo|cambiarlo)\s+por\s+/i.test(normalizedMessage)) {
      normalizedMessage = message.replace(/^\s*(reemplazalo|reemplazar|cambialo|cambiarlo)\s+por\s+/i, "");
    }

    const parsed = CommercialParser.Parser.parse({
      message: normalizedMessage,
      channel: context.command.channel,
    });

    if (!Array.isArray(parsed.products) || parsed.products.length === 0) {
      /*
       * Permite buscar productos con mensajes breves como "cemento",
       * "arena" o "6 cemento". El parser clásico suele requerir una
       * oración más completa; para una conversación natural consultamos
       * directamente el catálogo y ofrecemos las coincidencias.
       */
      const catalogResult = this.resolveCatalogSearchMessage({
        context,
        message: normalizedMessage,
        empresaId,
        replaceProductIndex: pendingMissing ? Number(pendingMissing.productIndex) : null,
      });

      if (catalogResult) {
        return catalogResult;
      }

      return pendingMissing ? ResponseBuilder.productNotFound(context, pendingMissing.description) : ResponseBuilder.askProduct(context);
    }

    if (pendingMissing) {
      context.removeProductAt(Number(pendingMissing.productIndex)).clearMissingProduct();
    }

    /* Agrega todos los productos detectados. */
    context.command.products.push(...parsed.products);

    /*
     * Incorpora condición de venta, descuento,
     * lista de precios y fecha de entrega.
     */
    this.mergeParsedCommercialData({
      target: context.command,

      source: parsed,
    });

    this.refreshContextValidation(context);

    return this.execute({
      context,
      empresaId,
      usuarioId,
      empresaNombre,
    });
  }

  /*
   * Busca directamente en el catálogo cuando el usuario escribe solamente
   * una palabra o frase corta. Si hay varias coincidencias, conserva la
   * cantidad y muestra opciones seleccionables para web, n8n y WhatsApp.
   */
  resolveCatalogSearchMessage({ context, message, empresaId, replaceProductIndex = null }) {
    const raw = String(message || "").trim();
    if (!raw) return null;

    if (this.isConfirmMessage(raw) || this.isCancelMessage(raw) || this.isOmitProductMessage(raw)) {
      return null;
    }

    const quantityMatch = raw.match(/(?:^|\s)(\d+(?:[.,]\d+)?)(?:\s|$)/);
    const quantity = quantityMatch
      ? Math.max(0.001, Number(quantityMatch[1].replace(",", ".")))
      : 1;

    const searchText = raw
      .replace(/^(agrega(?:r)?|agregá|agregame|agrégame|sumá|suma|poné|pone|quiero(?: agregar)?|necesito)\s+/i, "")
      .replace(/(?:^|\s)\d+(?:[.,]\d+)?(?:\s|$)/, " ")
      .replace(/\b(unidades?|unidad|bolsas?|cajas?|paquetes?|metros?|kg|kilos?)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (searchText.length < 2) return null;

    let options = buscarProductos({
      empresaId,
      texto: searchText,
      limit: 12,
    });

    /*
     * Textos largos y naturales ("5 hierros del 6", "cemento gris 25 kg")
     * pueden no matchear el catálogo con la frase entera. Si no hay
     * coincidencias, probamos con la palabra clave más fuerte del texto
     * ("hierro", "cemento"). Vale igual para web, n8n y WhatsApp.
     */
    if (!Array.isArray(options) || options.length === 0) {
      const palabras = String(searchText)
        .split(/\s+/)
        .filter((w) => w.length > 2);
      if (palabras.length > 1) {
        const clave = [...palabras].sort((a, b) => b.length - a.length)[0];
        options = buscarProductos({ empresaId, texto: clave, limit: 12 });
      }
    }

    if (!Array.isArray(options) || options.length === 0) {
      return null;
    }

    if (Number.isInteger(replaceProductIndex) && replaceProductIndex >= 0) {
      context.command.products.splice(replaceProductIndex, 1);
      context.clearMissingProduct();
    }

    const productIndex = context.command.products.length;
    context.command.products.push({
      description: searchText,
      quantity,
      discount: 0,
      resolved: false,
    });

    context.setProductOptions(options, {
      productIndex,
      quantity,
      description: searchText,
      discount: 0,
    });

    return ResponseBuilder.selectProduct(context, options, {
      searchText,
      quantity,
    });
  }

  /*
   * Busca el cliente y lo asigna al workspace
   * cuando existe una coincidencia única.
   */
  resolveCustomer({ context, workspace, empresaId, usuarioId }) {
    /*
     * No vuelve a resolver un cliente
     * que ya tiene identificador.
     */
    if (context.command.customer?.id) {
      /*
       * Aunque el comando ya traiga el cliente resuelto (por ejemplo, un
       * número de WhatsApp vinculado), el workspace tiene que tenerlo
       * asignado para poder confirmar y generar el documento.
       */
      try {
        WorkspaceEngine.setCustomer({
          workspaceId: workspace.id,
          empresaId,
          clienteId: context.command.customer.id,
          usuarioId,
        });
      } catch (err) {
        /* cliente ya asignado: no romper el flujo */
      }
      return null;
    }

    const customerText = String(context.command.customer?.text || "").trim();

    if (!customerText) {
      context.changeState(States.WAITING_CUSTOMER);

      return ResponseBuilder.askCustomer(context);
    }

    const result = WorkspaceEngine.resolveAndSetCustomer({
      workspaceId: workspace.id,

      empresaId,

      texto: customerText,

      usuarioId,
    });

    const resolution = result.resolucion;

    /*
     * No se encontró ningún cliente.
     */
    if (resolution.estado === "NO_ENCONTRADO") {
      context.changeState(States.WAITING_CUSTOMER);

      return ResponseBuilder.customerNotFound(context, customerText);
    }

    /*
     * Existen varias coincidencias
     * y el usuario debe elegir una.
     */
    if (resolution.estado === "REQUIERE_SELECCION") {
      context.setCustomerOptions(resolution.opciones);

      return ResponseBuilder.selectCustomer(context, resolution.opciones);
    }

    /*
     * Guarda el cliente resuelto
     * dentro del comando.
     */
    /* Una coincidencia única también se confirma para evitar elegir al cliente equivocado. */
    context.setCustomerOptions([resolution.seleccionado]);
    context.changeState(States.WAITING_CUSTOMER_SELECTION);
    return {
      ...ResponseBuilder.selectCustomer(context, [resolution.seleccionado]),
      response: {
        ...ResponseBuilder.selectCustomer(context, [resolution.seleccionado]).response,
        message: `Encontré a ${resolution.seleccionado.razonSocial || resolution.seleccionado.razon_social || resolution.seleccionado.nombre}. ¿Es este cliente? Respondé sí o elegí otra búsqueda.`,
        actions: ["CONFIRMAR", "CAMBIAR_CLIENTE"],
      },
    };
  }

  /*
   * Procesa la selección numérica
   * de una opción de cliente.
   */
  async handleCustomerSelection({
    context,
    message,
    empresaId,
    usuarioId,
    empresaNombre,
  }) {
    /*
     * Una confirmación no puede utilizarse
     * como número de cliente.
     */
    if (this.isConfirmMessage(message)) {
      if (Array.isArray(context.customerOptions) && context.customerOptions.length === 1) {
        message = "1";
      } else {
        return ResponseBuilder.selectCustomer(context, context.customerOptions);
      }
    }

    /* Permite cambiar la búsqueda sin cancelar toda la operación. */
    if (/^(cambiar|otro|no es|buscar otro|cambiar cliente)/i.test(String(message || "").trim())) {
      context.clearCustomerOptions();
      context.command.customer = null;
      context.changeState(States.WAITING_CUSTOMER);
      return ResponseBuilder.askCustomer(context);
    }

    const selected = this.selectOption(context.customerOptions, message);

    if (!selected) {
      return ResponseBuilder.selectCustomer(context, context.customerOptions);
    }

    const clienteId = selected.id || selected.idcliente || selected.clienteId;

    if (!clienteId) {
      const error = new Error(
        "La opción seleccionada no contiene un cliente válido.",
      );

      error.statusCode = 400;

      throw error;
    }

    WorkspaceEngine.setCustomer({
      workspaceId: context.workspaceId,

      empresaId,

      clienteId,

      usuarioId,
    });

    context.setResolvedCustomer(selected).clearCustomerOptions();

    this.refreshContextValidation(context);

    return this.execute({
      context,
      empresaId,
      usuarioId,
      empresaNombre,
    });
  }

  /*
   * Resuelve todos los productos pendientes
   * y los agrega al workspace.
   */
  resolvePendingProducts({ context, workspace, empresaId, usuarioId }) {
    const unresolved = context.getUnresolvedProducts();

    if (unresolved.length === 0) {
      return null;
    }

    for (const entry of unresolved) {
      const itemDiscount = Number(
        entry.product.discount ?? entry.product.descuento ?? 0,
      );

      const result = WorkspaceEngine.resolveAndAddProduct({
        workspaceId: workspace.id,

        empresaId,

        texto: entry.product.description,

        cantidad: entry.product.quantity,

        descuento: itemDiscount,

        usuarioId,
      });

      const resolution = result.resolucion;

      /*
       * No se encontró el producto.
       */
      if (resolution.estado === "NO_ENCONTRADO") {
        context.setMissingProduct(entry.index, entry.product.description);
        context.changeState(States.WAITING_PRODUCT);
        return ResponseBuilder.productNotFound(context, entry.product.description);
      }

      /*
       * Existen varias coincidencias
       * y el usuario debe elegir una.
       */
      if (resolution.estado === "REQUIERE_SELECCION") {
        context.setProductOptions(resolution.opciones, {
          productIndex: entry.index,

          quantity: entry.product.quantity,

          description: entry.product.description,

          discount: itemDiscount,
        });

        return ResponseBuilder.selectProduct(context, resolution.opciones);
      }

      /*
       * Marca el producto como resuelto
       * dentro del comando.
       */
      context.setResolvedProduct({
        productIndex: entry.index,

        product: resolution.seleccionado,
      });
    }

    this.refreshContextValidation(context);

    return null;
  }

  /*
   * Procesa la selección numérica
   * de una opción de producto.
   */
  async handleProductSelection({
    context,
    message,
    empresaId,
    usuarioId,
    empresaNombre,
  }) {
    /*
     * Una confirmación no reemplaza
     * una selección numérica.
     */
    if (this.isConfirmMessage(message)) {
      if (Array.isArray(context.productOptions) && context.productOptions.length === 1) {
        message = "1";
      } else {
        return ResponseBuilder.selectProduct(context, context.productOptions);
      }
    }

    const selected = this.selectOption(context.productOptions, message);

    if (!selected) {
      return ResponseBuilder.selectProduct(context, context.productOptions);
    }

    const pending = context.pendingProduct;

    if (!pending) {
      context.changeState(States.WAITING_PRODUCT);

      return ResponseBuilder.askProduct(context);
    }

    const productoId = selected.id || selected.idart || selected.productoId;

    if (!productoId) {
      const error = new Error(
        "La opción seleccionada no contiene un producto válido.",
      );

      error.statusCode = 400;

      throw error;
    }

    WorkspaceEngine.addProduct({
      workspaceId: context.workspaceId,

      empresaId,

      productoId,

      cantidad: pending.quantity,

      descuento: pending.discount || 0,

      usuarioId,
    });

    context
      .setResolvedProduct({
        productIndex: pending.productIndex,

        product: selected,
      })
      .clearProductOptions();

    this.refreshContextValidation(context);

    /*
     * Sincroniza nuevamente la condición de venta,
     * descuento general y demás datos comerciales.
     */
    this.synchronizeWorkspaceCommercialData({
      context,
      empresaId,
      usuarioId,
    });

    context.changeState(States.WAITING_PRODUCT);
    return {
      ok: true,
      response: {
        type: "PRODUCT_ADDED",
        message: `Agregué ${pending.quantity} x ${selected.descripcion || selected.nombre || "producto"}. ¿Querés agregar otro producto o continuar con el resumen?`,
        actions: ["AGREGAR_OTRO", "CONFIRMAR"],
      },
      context: context.toPlainObject(),
    };
  }

  /*
   * Prepara el resumen final
   * antes de confirmar la operación.
   */
  prepareConfirmation({ context, empresaNombre }) {
    context.changeState(States.WAITING_CONFIRMATION);

    const workspace = WorkspaceEngine.load(context.workspaceId);

    const summary = this.buildSummary({
      context,
      workspace,
      empresaNombre,
    });

    return ResponseBuilder.askConfirmation(context, summary);
  }

  /*
   * Confirma o rechaza
   * la operación comercial.
   */
  async handleConfirmation({
    context,
    message,
    empresaId,
    usuarioId,
    empresaNombre,
  }) {
    /*
     * Cuando el mensaje no es una confirmación,
     * vuelve a mostrar el resumen.
     */
    if (!this.isConfirmMessage(message)) {
      return this.prepareConfirmation({
        context,
        empresaNombre,
      });
    }

    /*
     * Sincroniza los datos comerciales
     * inmediatamente antes de confirmar.
     */
    if (!context.command.sourceDocument) {
      this.synchronizeWorkspaceCommercialData({
        context,
        empresaId,
        usuarioId,
      });
    }

    context.changeState(States.PROCESSING);

    /*
     * Confirma una conversión
     * desde un documento existente.
     */
    if (context.command.sourceDocument) {
      const result = await this.confirmDocumentConversion({
        context,
        empresaId,
        usuarioId,
        empresaNombre,
      });

      await this.capturarDocumentoYResolverEnvio({ context, empresaId, result });

      context.changeState(States.COMPLETED);

      return ResponseBuilder.completed(context, result);
    }

    /*
     * Confirma un workspace comercial normal.
     */
    const result = await WorkspaceConfirmationEngine.confirm({
      workspaceId: context.workspaceId,

      empresa: empresaNombre,

      empresaNombre,

      empresaId,

      usuarioId,
    });

    await this.capturarDocumentoYResolverEnvio({ context, empresaId, result });

    context.changeState(States.COMPLETED);

    return ResponseBuilder.completed(context, result);
  }

  /*
   * Prepara una conversión
   * desde otro documento comercial.
   */
  prepareDocumentConversion({ context, empresaNombre }) {
    context.changeState(States.WAITING_CONFIRMATION);

    const source = context.command.sourceDocument;

    const number = source.formattedNumber || source.number;

    const summary = [
      "Resumen de la operación",
      "",
      `Empresa: ${empresaNombre || "Empresa actual"}`,
      `Operación: ${context.command.operation}`,
      `Documento origen: ${source.type} ${number}`,
    ].join("\n");

    return ResponseBuilder.askConfirmation(context, summary);
  }

  /*
   * Ejecuta una conversión
   * mediante WorkspaceConfirmationEngine.
   */
  async confirmDocumentConversion({
    context,
    empresaId,
    usuarioId,
    empresaNombre,
  }) {
    if (
      typeof WorkspaceConfirmationEngine.confirmDocumentConversion !==
      "function"
    ) {
      const error = new Error(
        "La conversión de documentos todavía no está implementada.",
      );

      error.statusCode = 501;

      throw error;
    }

    const source = context.command.sourceDocument;

    return WorkspaceConfirmationEngine.confirmDocumentConversion({
      empresaId,

      usuarioId,

      empresa: empresaNombre,

      empresaNombre,

      operation: context.command.operation,

      sourceDocument: {
        type: source.type,

        pointOfSale: source.pointOfSale,

        number: source.number,
      },
    });
  }

  /*
   * Crea o recupera el workspace.
   *
   * También sincroniza condición de venta, descuento,
   * observaciones, fecha de entrega, canal y teléfono.
   */
  ensureWorkspace({ context, empresaId, usuarioId }) {
    let workspace;

    const commercialData = CommercialWorkspaceMapper.map({
      command: context.command,

      channel: context.command.channel,

      telefonoOrigen: context.telefonoOrigen || null,
    });

    /*
     * Recupera el workspace existente.
     */
    if (context.workspaceId) {
      workspace = WorkspaceEngine.load(context.workspaceId);

      /*
       * Verifica que el workspace corresponda
       * a la empresa actual.
       */
      if (Number(workspace.empresaId) !== Number(empresaId)) {
        const error = new Error(
          "El workspace no pertenece a la empresa actual.",
        );

        error.statusCode = 403;

        throw error;
      }
    } else {
      /*
       * Crea el workspace con todos los datos comerciales
       * disponibles en el mensaje inicial.
       */
      workspace = WorkspaceEngine.create({
        empresaId,

        usuarioId,

        canal: commercialData.canal,

        telefonoOrigen: commercialData.telefonoOrigen,

        tipoOperacion: context.command.operation,

        condicionVenta: commercialData.condicionVenta,

        listaPrecio: commercialData.listaPrecio,

        descuentoGeneral: commercialData.descuentoGeneral,

        observaciones: commercialData.observaciones,

        fechaEntrega: commercialData.fechaEntrega,
      });

      context.setWorkspace(workspace.id);
    }

    /*
     * Mantiene sincronizados los datos comerciales
     * cuando fueron agregados en mensajes posteriores.
     */
    workspace = WorkspaceEngine.updateCommercialData({
      workspaceId: workspace.id,

      empresaId,

      usuarioId,

      ...commercialData,
    });

    return WorkspaceEngine.load(workspace.id);
  }

  /*
   * Sincroniza los datos del comando
   * con el workspace existente.
   */
  synchronizeWorkspaceCommercialData({ context, empresaId, usuarioId }) {
    if (!context.workspaceId) {
      return null;
    }

    const commercialData = CommercialWorkspaceMapper.map({
      command: context.command,

      channel: context.command.channel,

      telefonoOrigen: context.telefonoOrigen || null,
    });

    return WorkspaceEngine.updateCommercialData({
      workspaceId: context.workspaceId,

      empresaId,

      usuarioId,

      ...commercialData,
    });
  }

  /*
   * Construye el resumen
   * que se muestra antes de confirmar.
   */
  buildSummary({ context, workspace, empresaNombre }) {
    /*
     * Utiliza el resumen del dominio Workspace
     * cuando el método se encuentra disponible.
     */
    if (typeof workspace.getConfirmationSummary === "function") {
      const workspaceSummary = workspace.getConfirmationSummary();

      return {
        empresa: empresaNombre || "Empresa actual",

        clienteNombre:
          context.command.customer?.text ||
          context.command.customer?.nombre ||
          null,

        ...workspaceSummary,
      };
    }

    /*
     * Resumen alternativo para mantener
     * compatibilidad con implementaciones antiguas.
     */
    const customer = context.command.customer?.text || "Sin cliente";

    const lines = [
      "Resumen de la operación",
      "",
      `Empresa: ${empresaNombre || "Empresa actual"}`,
      `Operación: ${context.command.operation}`,
      `Cliente: ${customer}`,
      "",
      "Productos:",
    ];

    context.command.products.forEach((product) => {
      lines.push(`- ${product.quantity} x ${product.description}`);
    });

    if (context.command.payment) {
      lines.push("", `Condición: ${context.command.payment.type}`);
    }

    if (context.command.discount) {
      lines.push(`Descuento: ${context.command.discount.value}%`);
    }

    if (context.command.deliveryDate) {
      lines.push(
        `Entrega: ${
          context.command.deliveryDate.date ||
          context.command.deliveryDate.value ||
          context.command.deliveryDate.rawText ||
          "Pendiente"
        }`,
      );
    }

    return lines.join("\n");
  }

  /*
   * Devuelve una respuesta de acuerdo
   * con el estado actual.
   */
  responseForCurrentState({ context, empresaNombre = "" }) {
    switch (context.state) {
      case States.WAITING_OPERATION:
        return ResponseBuilder.askOperation(context);

      case States.WAITING_CUSTOMER:
        return ResponseBuilder.askCustomer(context);

      case States.WAITING_CUSTOMER_SELECTION:
        return ResponseBuilder.selectCustomer(context, context.customerOptions);

      case States.WAITING_PRODUCT:
        return ResponseBuilder.askProduct(context);

      case States.WAITING_PRODUCT_SELECTION:
        return ResponseBuilder.selectProduct(context, context.productOptions);

      case States.WAITING_CONFIRMATION:
        return this.prepareConfirmation({
          context,
          empresaNombre,
        });

      case States.PROCESSING:
        return {
          ok: true,

          response: {
            type: "OPERATION_PROCESSING",

            message: "La operación se está procesando.",
          },

          context: context.toPlainObject(),
        };

      case States.COMPLETED:
        return {
          ok: true,

          response: {
            type: "CONVERSATION_COMPLETED",

            message: "La operación ya fue completada.",
          },

          context: context.toPlainObject(),
        };

      case States.CANCELLED:
        return ResponseBuilder.cancelled(context);

      default:
        return {
          ok: true,

          response: {
            type: "CONVERSATION_STATE",

            message: `Estado actual: ${context.state}`,
          },

          context: context.toPlainObject(),
        };
    }
  }

  /*
   * Incorpora todos los datos encontrados
   * por CommercialParser en el comando actual.
   */
  mergeParsedCommand({
    target,
    source,
    preserveOperation = false,
    preserveCustomer = false,
  }) {
    const sourceHasOperation =
      typeof source.hasOperation === "function"
        ? source.hasOperation()
        : Boolean(source.operation);

    if (!preserveOperation && sourceHasOperation) {
      target.operation = source.operation;
    }

    if (!preserveCustomer && source.customer?.text && !target.hasCustomer()) {
      target.customer = {
        ...source.customer,
      };
    }

    /*
     * Evita agregar dos veces los mismos productos
     * cuando el comando ya tenía artículos.
     */
    if (
      Array.isArray(source.products) &&
      source.products.length > 0 &&
      !target.hasProducts()
    ) {
      target.products.push(...source.products);
    }

    this.mergeParsedCommercialData({
      target,
      source,
    });

    if (source.sourceDocument && !target.sourceDocument) {
      target.sourceDocument = source.sourceDocument;
    }

    return target;
  }

  /*
   * Incorpora únicamente datos comerciales
   * adicionales al comando existente.
   */
  mergeParsedCommercialData({ target, source }) {
    if (source.payment) {
      target.payment = source.payment;
    }

    if (source.discount) {
      target.discount = source.discount;
    }

    if (source.seller) {
      target.seller = source.seller;
    }

    if (source.priceList) {
      target.priceList = source.priceList;
    }

    if (source.deliveryDate) {
      target.deliveryDate = source.deliveryDate;
    }

    if (Array.isArray(source.notes) && source.notes.length > 0) {
      const existingNotes = Array.isArray(target.notes) ? target.notes : [];

      target.notes = [...existingNotes, ...source.notes];
    }

    return target;
  }

  /*
   * Recalcula las validaciones del contexto
   * cuando el método está disponible.
   */
  refreshContextValidation(context) {
    if (typeof context.refreshValidation === "function") {
      context.refreshValidation();
    }

    return context;
  }

  /*
   * Selecciona una opción utilizando
   * un índice humano que comienza en uno.
   */
  selectOption(options, value) {
    const safeOptions = Array.isArray(options) ? options : [];

    const index = Number.parseInt(String(value || "").trim(), 10) - 1;

    if (!Number.isInteger(index) || index < 0 || index >= safeOptions.length) {
      return null;
    }

    return safeOptions[index];
  }

  /*
   * Indica si un mensaje parece una orden
   * comercial completa y no solo un cliente.
   */
  looksLikeCommercialOrder(value) {
    const text = this.normalizeCommandText(value);

    const hasOperation =
      /\b(PRESUPUESTO|REMITO|PEDIDO|FACTURA|FACTURAR|NOTA DE PEDIDO)\b/.test(
        text,
      );

    const hasProducts = /\b(POR|CON|LLEVA)\s+\d+(?:[.,]\d+)?\s+\S+/.test(text);

    return hasOperation || hasProducts;
  }

  /*
   * Limpia una respuesta corta utilizada
   * para identificar al cliente.
   *
   * Ejemplos:
   * "cliente Cliente Prueba" -> "Cliente Prueba"
   * "razón social Ferretería Norte" -> "Ferretería Norte"
   */
  cleanCustomerReply(value) {
    return String(value || "")
      .trim()
      .replace(/^(?:PARA\s+)?(?:EL\s+CLIENTE|LA\s+CLIENTE|CLIENTE)\s+/i, "")
      .replace(/^(?:RAZON\s+SOCIAL|RAZÓN\s+SOCIAL)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }


  normalizeFlexibleProductPhrase(value) {
    let text = String(value || "").trim();
    /* Acepta frases naturales como "cemento cantidad 6 y cal cantidad 10". */
    text = text.replace(/([a-záéíóúñ0-9 _-]+?)\s+cantidad\s+([0-9]+(?:[.,][0-9]+)?)/gi, (_, product, qty) => `${qty} ${String(product).trim()}`);
    text = text.replace(/\bcantidad\s+([0-9]+(?:[.,][0-9]+)?)\s+de\s+/gi, "$1 ");
    text = text.replace(/\b([0-9]+(?:[.,][0-9]+)?)\s+unidades?\s+de\s+/gi, "$1 ");
    text = text.replace(/^(agregame|agrégame|agrega|agregá|quiero agregar|quiero sumar|sumame|súmame)\s+/i, "");
    return text.replace(/\s+/g, " ").trim();
  }

  isOmitProductMessage(message) {
    const text = this.normalizeCommandText(message);
    return ["NINGUNO", "NINGUNA", "OMITILO", "OMITIR", "SACALO", "QUITARLO", "DEJALO", "NO LO AGREGUES", "SIN ESE"].includes(text);
  }

  /*
   * Detecta mensajes completos
   * de confirmación.
   */
  isConfirmMessage(message) {
    const text = this.normalizeCommandText(message);

    return [
      "SI",
      "CONFIRMAR",
      "CONFIRMO",
      "CONFIRMADO",
      "ACEPTAR",
      "ACEPTO",
      "OK",
      "DALE",
      "CORRECTO",
    ].includes(text);
  }

  /*
   * Detecta mensajes completos
   * de cancelación.
   */
  isCancelMessage(message) {
    const text = this.normalizeCommandText(message);

    return [
      "CANCELAR",
      "CANCELO",
      "CANCELADO",
      "ANULAR",
      "DESCARTAR",
      "CANCELAR OPERACION",
      "NO QUIERO CONTINUAR",
    ].includes(text);
  }

  /*
   * Normaliza comandos cortos
   * de conversación.
   */
  normalizeCommandText(value) {
    return String(value || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.!?,;:]+$/g, "")
      .toUpperCase();
  }

  /*
   * Valida que se haya recibido
   * un contexto comercial válido.
   */
  assertContext(context) {
    if (!context || !context.command) {
      const error = new Error("El contexto comercial es obligatorio.");

      error.statusCode = 400;

      throw error;
    }
  }
}

module.exports = new CommercialConversationEngine();
