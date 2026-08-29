const db = require("../db/database");

const ResolverEngine = require("../resolver/resolverEngine");
const { saveDocumento } = require("../repositories/documentoComercial.repository");
const CuentaCorrienteService = require("./cuentaCorriente.service");
const AI = require("./aiConversation.service");
const { normalizePhone } = require("../utils/validators");

/*
 * PedidoConversacional
 *
 * Motor conversacional para PEDIDOS por WhatsApp de clientes finales.
 *
 * Arquitectura:
 *   WhatsApp -> IA (interpreta, no inventa) -> este motor (estados + memoria)
 *   -> repositorio ERP (productos, precios, stock, cliente, saldo) -> SQLite
 *
 * Estados internos (el cliente nunca los ve):
 *   INICIO -> ARMANDO_PEDIDO -> RESOLVIENDO_PRODUCTO -> ARMANDO_PEDIDO
 *   -> CONFIRMAR_PEDIDO (dirección/pago solo si faltan) -> PEDIDO_ERP -> FINALIZADO
 *
 * Reglas de oro:
 *   - La IA jamás aporta productos, precios, stock ni saldos: todo sale del ERP.
 *   - No se formulariza: se agrega directo y se responde corto.
 *   - Ambigüedad: pregunta con 2-4 opciones. Acción crítica: siempre confirmar.
 *   - Correcciones naturales: quitar, cambiar cantidad, reemplazar, "mejor",
 *     resumen, saldo, repetir pedido anterior, nueva orden, dirección de entrega.
 */

const ESTADOS = Object.freeze({
  ARMANDO: "ARMANDO_PEDIDO",
  RESOLVIENDO: "RESOLVIENDO_PRODUCTO",
  DIRECCION: "DIRECCION_ENTREGA",
  PAGO: "FORMA_PAGO",
  CONFIRMACION: "CONFIRMA_PEDIDO",
  CANCELAR_PROMPT: "CONFIRMA_CANCELAR",
  FINALIZADO: "FINALIZADO",
});

const SI = /^(si|s[ií]|sip|claro|dale|confirmo|confirmar|ok|oka|oj[aá]|s[ií] est[aá] bien|perfecto)$/i;
const NO = /^(no|nah|não|no por ahora|despu[eé]s|m[eé]s tarde|todav[ií]a no)$/i;

class PedidoConversacional {
  async procesar({ empresaId, empresaNombre, telefono, clienteId, mensaje }) {
    const tel = normalizePhone(telefono);

    const row = db
      .prepare(
        `SELECT id, contexto, estado
         FROM conversations
         WHERE empresa_id=? AND telefono=? AND canal='WHATSAPP_CLIENTE' AND estado <> 'COMPLETADO'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(empresaId, tel);

    let ctx;
    let convId;

    const existioAlgunaVez =
      db.prepare(
        `SELECT COUNT(*) n FROM conversations
         WHERE empresa_id=? AND telefono=? AND canal='WHATSAPP_CLIENTE'`,
      ).get(empresaId, tel).n > 0;
    const esPrimerContacto = !existioAlgunaVez;

    if (row) {
      convId = row.id;
      try { ctx = JSON.parse(row.contexto || "{}"); } catch { ctx = {}; }
    } else {
      ctx = this.ctxInicial({ telefono: tel, clienteId });
      convId = this.crearConversacion({ empresaId, telefono: tel, ctx });
    }

    if (!ctx || !Array.isArray(ctx.items)) {
      ctx = this.ctxInicial({ telefono: tel, clienteId });
    }
    ctx.telefonoOrigen = tel;

    this.cargarPerfil({ ctx, empresaId, clienteId });

    const cliente = clienteId
      ? db.prepare("SELECT razon_social, domicilio FROM clientes WHERE id=? AND empresa_id=?").get(clienteId, empresaId)
      : null;

    /*
     * Capa IA opcional: convierte el texto en una instrucción JSON.
     * Si no está configurada (AI_ENABLED=false) el motor usa el parser reglas.
     */
    let intencion = null;
    if (AI.enabled()) {
      try {
        intencion = await AI.interpretarPedido({ message: mensaje, contexto: ctx });
      } catch (e) {
        console.warn("[PedidoConversacional] IA no disponible:", e.message);
      }
    }

    const res = intencion
      ? this.mensajeIntencion({ ctx, intencion, empresaId, clienteId })
      : this.mensaje({
          ctx,
          mensaje: String(mensaje || "").trim(),
          empresaId,
          clienteId,
          clienteNombre: cliente?.razon_social || "cliente",
        });

    let respuesta = res.respuesta;
    if (esPrimerContacto && cliente) {
      respuesta =
        `¡Hola ${cliente.razon_social}! Ya estás habilitado: tu número de cliente es ${clienteId}.\n\n` +
        respuesta;
    }

    const estadoColumna = res.finalizado ? "COMPLETADO" : "ACTIVO";

    db.prepare(
      `UPDATE conversations
       SET contexto=?, estado=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
    ).run(JSON.stringify(ctx), estadoColumna, convId);

    return {
      ok: true,
      canal: "WHATSAPP_CLIENTE",
      estado: ctx.s,
      respuesta,
      conversation: { id: convId, estado: ctx.s },
      documento: res.documento || null,
    };
  }

  ctxInicial({ telefono, clienteId }) {
    return {
      s: ESTADOS.ARMANDO,
      items: [],
      telefonoOrigen: telefono,
      clienteId: clienteId || null,
      perfil: { condicion: "CONTADO", listaPrecio: "GENERAL", vendedor: null, saldo: null },
      direccionElegida: null,
      usoDomicilio: null,
    };
  }

  crearConversacion({ empresaId, telefono, ctx }) {
    return db
      .prepare(
        `INSERT INTO conversations(empresa_id, telefono, canal, estado, contexto)
         VALUES(?,?,?,?,?)`,
      )
      .run(
        empresaId,
        telefono,
        "WHATSAPP_CLIENTE",
        "ACTIVO",
        JSON.stringify(ctx),
      ).lastInsertRowid;
  }

  /*
   * Contexto del número: cliente, saldo, condición habitual, domicilio.
   */
  cargarPerfil({ ctx, empresaId, clienteId }) {
    if (!clienteId) return;
    const cli = db
      .prepare(
        `SELECT id, razon_social, domicilio, localidad, condicion_iva
         FROM clientes WHERE id=? AND empresa_id=?`,
      )
      .get(clienteId, empresaId);
    if (!cli) return;
    ctx.clienteId = clienteId;
    ctx.clienteNombre = cli.razon_social;
    if (cli.domicilio && !ctx.domicilioCliente) ctx.domicilioCliente = cli.domicilio;

    try {
      const estado = CuentaCorrienteService.estadoCuentaCliente({
        empresaId,
        cuit: null,
        dni: null,
      });
      const doc = db
        .prepare(
          `SELECT cuit, dni FROM clientes WHERE id=? AND empresa_id=?`,
        )
        .get(clienteId, empresaId);
      if (doc && (doc.cuit || doc.dni)) {
        const saldo = CuentaCorrienteService.estadoCuentaCliente({
          empresaId,
          cuit: doc.cuit,
          dni: doc.dni,
        });
        ctx.perfil.saldo = saldo ? Math.round(saldo.saldo * 100) / 100 : 0;
      }
    } catch (e) {
      ctx.perfil.saldo = null;
    }

    /*
     * Condition de pago habitual: la del último documento del cliente.
     */
    if (!ctx.perfil.condicionHabitual) {
      const ultimo = db
        .prepare(
          `SELECT condicion_venta FROM documentos_comerciales
           WHERE empresa_id=? AND cliente_id=? AND tipo='NOTA_PEDIDO'
           ORDER BY id DESC LIMIT 1`,
        )
        .get(empresaId, clienteId);
      if (ultimo?.condicion_venta) {
        ctx.perfil.condicionHabitual = String(ultimo.condicion_venta).toUpperCase();
      }
    }
  }

  /*
   * Ejecuta una intención devuelta por la IA (JSON normalizado).
   * La IA solo interpreta; todo lo demás lo hace el ERP/acá.
   */
  mensajeIntencion({ ctx, intencion, empresaId, clienteId }) {
    const tipo = String(intencion.intencion || "").toLowerCase();

    switch (tipo) {
      case "cerrar":
      case "confirmar_pedido":
        return this.intencionCerrar({ ctx, empresaId, clienteId });
      case "agregar":
      case "agregar_productos":
        return this.procesarLineas({
          ctx,
          lineas: (intencion.items || []).map((it) => ({
            cantidad: Number(it.cantidad || 1),
            nombre: String(it.descripcion || "").trim(),
          })).filter((l) => l.nombre),
          empresaId,
        });
      case "quitar":
        return this.quitarLineas({ ctx, empresaId, clienteId, descripcion: intencion.items?.[0]?.descripcion || intencion.descripcion, cantidad: intencion.items?.[0]?.cantidad ?? intencion.cantidad });
      case "cambiar_cantidad":
        return this.cambiarCantidad({ ctx, cantidad: Number(intencion.cantidad), descripcion: intencion.items?.[0]?.descripcion || null });
      case "reemplazar":
        return this.reemplazar({ ctx, empresaId, original: intencion.descripcionOriginal || intencion.items?.[0]?.descripcion, nuevo: intencion.descripcionNueva || intencion.items?.[1]?.descripcion });
      case "resumen":
        return { respuesta: this.resumenCorto(ctx) };
      case "saldo":
        return this.respuestaSaldo({ ctx, clienteId });
      case "direccion":
        return this.respuestaDireccion({ ctx, direccion: intencion.direccion || null });
      case "repetir_ultimo":
        return this.copiarUltimoPedido({ ctx, empresaId, clienteId });
      case "nuevo_pedido":
        return this.nuevoPedido(ctx);
      case "cancelar":
        return this.cancelarPedido(ctx);
      case "omitir":
        return this.omitirPendiente(ctx);
      case "si":
        return this.intencionSi({ ctx, empresaId, clienteId });
      case "no":
        return this.intencionNo({ ctx });
      case "ayuda":
      case "inicio":
        return { respuesta: this.ayuda() };
      default:
        return this.mensaje({
          ctx,
          mensaje: String(intencion.textoOriginal || intencion.mensaje || "").trim(),
          empresaId,
          clienteId,
          clienteNombre: ctx.clienteNombre || "cliente",
        });
    }
  }

  /*
   * Núcleo por reglas (fallback cuando no hay IA configurada).
   */
  mensaje({ ctx, mensaje, empresaId, clienteId, clienteNombre }) {
    const m = String(mensaje || "").trim();

    /*
     * Estado: confirmar cancelación total.
     */
    if (ctx.s === ESTADOS.CANCELAR_PROMPT) {
      if (SI.test(m)) {
        ctx.items = [];
        ctx.pendiente = null;
        ctx.s = ESTADOS.ARMANDO;
        return { respuesta: "Pedido cancelado quedó vacío. Contame qué querés para armar otro." };
      }
      ctx.s = ESTADOS.ARMANDO;
      return { respuesta: "Seguimos con el pedido como estaba." };
    }

    /*
     * Operaciones que no son pedidos.
     */
    if (/(factura|presupuesto|remito|libro iva|fiscal)/i.test(m) && !/(pedido|compra|necesit|quer)/i.test(m)) {
      return {
        respuesta:
          "Ese trámite lo hacemos por otro canal. Por acá te tomo pedidos: decime qué y cuánto, ej.: “10 bolsas de cemento y 5 cal”.",
      };
    }

    /*
     * "Cancelá el pedido" (con confirmación; acción crítica).
     */
    if (/(cancel[áa] (el|mi|la)? ?pedido|borr[áa] (el pedido|todo)|anular (el|todo)|descart[áa] (el|todo)|empezá de nuevo)/i.test(m) && ctx.items.length) {
      ctx.s = ESTADOS.CANCELAR_PROMPT;
      return { respuesta: "¿Confirmás que cancelo el pedido que teníamos? Se borra todo." };
    }

    /*
     * Nuevo pedido: limpia el carrito (conserva perfil).
     */
    if (/(otro pedido|nuevo pedido|otra compra|nueva compra|empezamos de nuevo|arranc(á|a) de nuevo|quiero hacer otro)/i.test(m)) {
      return this.nuevoPedido(ctx);
    }

    /*
     * "Cuánto llevo / cuánto va" y "saldo".
     */
    if (/(cu[áa]nto (llevo|va|llevamos|vamos)|qu[eé] (llevo|tenemos)|resumen( del pedido)?|as[ií] vamos)/i.test(m)) {
      return { respuesta: this.resumenCorto(ctx) };
    }
    if (/(saldo|cu[áa]nto debo|cu[áa]nto tengo de)/i.test(m)) {
      return this.respuestaSaldo({ ctx, clienteId });
    }

    /*
     * Repetir el pedido anterior.
     */
    if (/(lo mismo (de|que)|igual (al|que|de)|el mismo pedido|otra vez (lo|l[aá] compra|el pedido)|nuevamente (el|lo)|mismo (pedido|patrón)|de (la )?semana pasada|del (viernes|mes pasado|martes|s[eé]ptima))/i.test(m)) {
      return this.copiarUltimoPedido({ ctx, empresaId, clienteId });
    }

    /*
     * Confirmación final / dirección / forma de pago.
     */
    if (ctx.s === ESTADOS.CONFIRMACION) {
      if (SI.test(m)) return this.crearPedido({ ctx, empresaId, clienteId, telefono: ctx.telefonoOrigen });
      ctx.s = ESTADOS.ARMANDO;
      if (NO.test(m) || /(est[aá] mal|as[ií] no|no es eso|cambiar|modificar|corregir)/i.test(m)) {
        return {
          respuesta:
            "Queda sin confirmar 👍 ¿Qué querés cambiar? Podés decir “sacá…”, “poneme…”, “agregame…” o “cuánto llevo”.",
        };
      }
      /* Cualquier otra cosa en confirmación se procesa como corrección. */
    }

    if (ctx.s === ESTADOS.DIRECCION) {
      if (SI.test(m)) {
        if (!ctx.direccionElegida && ctx.domicilioCliente) ctx.direccionElegida = ctx.domicilioCliente;
        if (ctx.direccionElegida) return this.definirPagoOConfirmar({ ctx });
        return { respuesta: "Pasame la dirección, por ejemplo: “obra de calle San Martín 1234”." };
      }
      if (NO.test(m)) {
        ctx.s = ESTADOS.ARMANDO;
        return { respuesta: "Listo. ¿Seguimos con el pedido o lo cerramos?" };
      }
      /*
       * Si en vez de la dirección el cliente manda una corrección,
       * se procesa normalmente (sacá, poneme, cuánto llevo, cerrar…).
       */
      if (/^(sac|quit|borr|pon|dej|cambia|cu[aá]nto|cerr|confirm|resumen|agreg|suma|repet|otro pedido|nuevo pedido)/i.test(m)) {
        ctx.s = ESTADOS.ARMANDO;
      } else {
        ctx.direccionElegida = m;
        ctx.useDomicilio = null;
        return this.definirPagoOConfirmar({ ctx });
      }
    }

    if (ctx.s === ESTADOS.PAGO) {
      if (SI.test(m) || /cuenta corriente/i.test(m)) {
        ctx.perfil.condicion = "CUENTA_CORRIENTE";
      } else if (NO.test(m) || /contado|efectivo|transferencia|pag(o|a)? (ahora|ya)|pago en efectivo/i.test(m)) {
        ctx.perfil.condicion = "CONTADO";
      } else if (/^(sac|quit|borr|pon|dej|cambia|cu[aá]nto|cerr|confirm|resumen|agreg|suma|repet|otro pedido|nuevo pedido)/i.test(m)) {
        ctx.s = ESTADOS.ARMANDO;
      } else {
        return { respuesta: "¿Cuenta corriente o contado?" };
      }
      ctx.perfil.condicionElegida = true;
      ctx.perfil.condicionHabitual = ctx.perfil.condicion;
      if (ctx.s === ESTADOS.ARMANDO) {
        /* cae al flujo normal: la corrección se procesa abajo */
      } else {
        return this.resumenConfirmacion({ ctx });
      }
    }

    /*
     * Correcciones: quitar / reemplazar / cantidad / "mejor" / "más".
     */
    const quitar = m.match(
      /(?:sac[áa]|quit[áa]|borr[áa]|elimin[áa]|cancel[áa]me?|descont[áa])\s+(?:la|el|las|los|una|un)?\s*(?:(\d+(?:[.,]\d+)?)\s+)?([a-záéíóúñ][a-záéíóúñ ]+?)(?:\s+del\s+pedido)?\s*$/i,
    );
    if (quitar) {
      return this.quitarLineas({
        ctx,
        descripcion: quitar[2].trim(),
        cantidad: quitar[1] ? Number(quitar[1].replace(",", ".")) : null,
      });
    }

    const reemplazo = m.match(/cambi[áa]?me?\s+(?:el|la|los|las)?\s*([a-záéíóúñ][a-záéíóúñ ]*?)\s+por\s+(?:el|la|los|las)?\s*([a-záéíóúñ][a-záéíóúñ ]*?)(?:\s+mejor)?\s*$/i);
    if (reemplazo) {
      return this.reemplazar({ ctx, empresaId, original: reemplazo[1].trim(), nuevo: reemplazo[2].trim() });
    }

    const cantidad = m.match(
      /(?:pon[eé]?me?|dej[áa](?:me|la|lo)?|aument[áa]?\s*a?|actualiz[áa])\s*(?:(?:s[óo]lo|solamente|únicamente|solo)\s*)?(\d+(?:[.,]\d+)?)\s*(?:mejor|m[ií]smo[a]?|por favor)?/i,
    );
    if (cantidad) {
      return this.cambiarCantidad({ ctx, cantidad: Number(cantidad[1].replace(",", ".")) });
    }

    const mas = m.match(
      /(?:agreg(?:á|áme|ame)?|mand(?:á|ame)?|sum(?:á|ame)?|pon(?:e|é|eme))\s+(?:(\d+(?:[.,]\d+)?)\s+)?(?:m[áa]s|otr[oa]\s*(?:vez)?)\s*(?:de\s+([a-záéíóúñ][a-záéíóúñ ]+))?\s*$/i,
    );
    if (mas) {
      const extra = Number(mas[1] || 1);
      if (mas[3]) {
        const idx = ctx.items.findIndex((it) =>
          this.normalize(`${it.descripcion} ${it.codigo || ""}`).includes(this.normalize(mas[3])),
        );
        if (idx !== -1) {
          ctx.items[idx].cantidad += extra;
          return { respuesta: `Listo 👍 ${this.num(ctx.items[idx].cantidad)} × ${ctx.items[idx].descripcion}.\n${this.pieCarrito(ctx)}` };
        }
      }
      const ultimo = ctx.items[ctx.items.length - 1];
      if (ultimo) {
        ultimo.cantidad += extra;
        return { respuesta: `Listo 👍 ${this.num(ultimo.cantidad)} × ${ultimo.descripcion}.\n${this.pieCarrito(ctx)}` };
      }
    }

    /*
     * Dirección de entrega: "mandalo a la obra...", "entrégalo en...".
     */
    const direccion = m.match(/(?:mand[aá]?lo|mandar(?:lo)?|envi[áa]?(?:ar(?:lo)?)?|entreg[aá]|llev[áa]?lo|despach[aá])\s+(?:a|para)?\s*(?:la\s+)?(?:obra|direcci[oó]n|domicilio|dire)(.*)$/i);
    if (direccion) {
      const destino = direccion[1]?.trim();
      return this.respuestaDireccion({ ctx, direccion: destino ? `obra ${destino}`.trim() : null });
    }

    /*
     * Cerrar / confirmar (acción crítica).
     */
    if (
      /^(cerra|cerrá|cerrar|cerramos|cerralo|cerrálo|listo|dale|confirmar|confirmá(lo)?|hac(e|é) (el|la)? ?pedido|envi(á|a) (el|la)? ?pedido|solo eso|nada m[áa]s|as[ií] est[áa] bien|eso es todo)$/i.test(m) ||
      /(,?\s*(cerr(amos|ar|alo|arlo)|confirmar|confirmá(lo)?)\s*)$/i.test(m)
    ) {
      return this.intencionCerrar({ ctx, empresaId, clienteId });
    }

    /*
     * Esperando producto (opciones / faltante).
     */
    if (ctx.pendiente && Array.isArray(ctx.pendiente.opciones) && ctx.pendiente.opciones.length) {
      return this.resolverOpcionProducto({ ctx, m });
    }
    if (ctx.pendiente && ctx.pendiente.sinOpciones) {
      return this.resolverProductoFaltante({ ctx, m, empresaId });
    }

    /*
     * Saludo puro.
     */
    if (/^(hola|buenos d[ií]as|buenas|buen d[ií]a|buenas tardes|buenas noches|holi|holis|qu[eé] tal|hey|hi)?[\s!?]*$/i.test(m) && !this.parsearLineas(m).length) {
      return { respuesta: this.ayuda() };
    }

    /*
     * "Está mal / me equivoqué" sin más detalle.
     */
    if (/(est[aá] mal|no es eso|as[ií] no|me equivoqu[eé]|est[aá] equivocado|algo (est[aá] mal|anda mal)|no era eso)/i.test(m)) {
      return { respuesta: "¿Qué está mal? Decime “sacá…”, “cambiame…”, “poneme…” o “cuánto llevo” y lo arreglamos." };
    }

    const lineas = this.parsearLineas(m);

    if (!lineas.length) {
      if (NO.test(m)) {
        ctx.pendiente = null;
        return { respuesta: "Sin problema. Decime qué querés cuando quieras." };
      }
      if (/^(agregar|agregá|agrega|agregame|sumar|sumá|poner|poné|poneme|mandar|mandame|enviar|enviame|comprar|pedir)$/i.test(m)) {
        return { respuesta: "¿Qué producto te agrego? Ej.: “agrega 3 cal”." };
      }
      return {
        respuesta:
          "No entendí. Probá con algo como: “2 cal y 5 cemento” o “10 bolsas de cemento”.",
      };
    }

    return this.procesarLineas({ ctx, lineas, empresaId });
  }

  /*
   * Cierre: dirección -> pago -> resumen final -> confirmación.
   */
  intencionCerrar({ ctx, empresaId, clienteId }) {
    if (!ctx.items.length) {
      return {
        respuesta:
          "Todavía no tengo nada. Contame qué querés, por ejemplo “10 bolsas de cemento y 5 cal”.",
      };
    }
    ctx.pendiente = null;
    /* Falta la dirección de entrega. */
    if (!ctx.direccionElegida && !ctx.useDomicilio) {
      if (ctx.domicilioCliente) {
        ctx.s = ESTADOS.DIRECCION;
        return { respuesta: `¿Lo mandamos a ${ctx.domicilioCliente}?` };
      }
      ctx.s = ESTADOS.DIRECCION;
      return {
        respuesta:
          "¿A dónde te lo mandamos? Pasame la dirección (o una referencia, ej.: “obra de calle San Martín”).",
      };
    }
    return this.definirPagoOConfirmar({ ctx });
  }

  definirPagoOConfirmar({ ctx }) {
    /* Falta forma de pago: preguntamos una sola vez según lo habitual. */
    if (!ctx.perfil.condicionElegida) {
      const habitual = ctx.perfil.condicionHabitual;
      if (habitual && habitual !== "CONTADO") {
        ctx.s = ESTADOS.PAGO;
        return { respuesta: `Forma de pago habitual: cuenta corriente. ¿La mantenemos?` };
      }
      ctx.perfil.condicionElegida = true;
      ctx.perfil.condicion = "CONTADO";
    }
    return this.resumenConfirmacion({ ctx });
  }

  resumenConfirmacion({ ctx }) {
    ctx.s = ESTADOS.CONFIRMACION;
    const entrega = ctx.direccionElegida || (ctx.useDomicilio ? ctx.domicilioCliente : null);
    const pago = ctx.perfil.condicion === "CUENTA_CORRIENTE" ? "Cuenta corriente" : "Contado";

    return {
      respuesta:
        "Perfecto. Antes de enviarlo te confirmo:\n\n" +
        this.summary({ ctx }) +
        (entrega ? `\nEntrega: ${entrega}` : "") +
        `\nPago: ${pago}` +
        "\n\n¿Confirmás el pedido?",
    };
  }

  crearPedido({ ctx, empresaId, clienteId, telefono }) {
    if (!ctx.items.length) {
      ctx.s = ESTADOS.ARMANDO;
      return { respuesta: "No hay nada para confirmar. Decime qué querés y lo armo." };
    }

    try {
      const items = ctx.items.map((it) => {
        const neto = Math.round((Number(it.precio) * 100) / (100 + Number(it.iva || 21)));
        const subtotal = Math.round(neto * it.cantidad * 100) / 100;
        const ivaImporte = Math.round(subtotal * (Number(it.iva || 21) / 100) * 100) / 100;
        const total = Math.round((subtotal + ivaImporte) * 100) / 100;

        return {
          productoId: it.productoId || null,
          codigo: it.codigo,
          descripcion: it.descripcion,
          unidad: it.unidad || "UN",
          cantidad: it.cantidad,
          precioUnitario: neto,
          descuento: 0,
          iva: it.iva || 21,
          subtotal,
          ivaImporte,
          total,
        };
      });

      const entrega = ctx.direccionElegida || (ctx.useDomicilio ? ctx.domicilioCliente : null);

      const documento = saveDocumento({
        empresaId,
        clienteId,
        tipo: "NOTA_PEDIDO",
        estado: "CONFIRMADO",
        items,
        observaciones:
          "Pedido por WhatsApp " + telefono + (entrega ? " · Entrega: " + entrega : ""),
        condicionVenta: ctx.perfil.condicion === "CUENTA_CORRIENTE" ? "CUENTA_CORRIENTE" : "CONTADO",
        canal: "WHATSAPP",
        telefonoOrigen: telefono,
      });

      db.prepare(
        `INSERT INTO whatsapp_notificaciones(empresa_id,telefono,pedido_id,estado_pedido,mensaje,estado)
         VALUES(?,?,?,?,?,?)`,
      ).run(
        empresaId,
        telefono,
        documento.id,
        "CONFIRMADO",
        `Pedido N.º confirmado: ${documento.tipo} de ${telefono}. Estamos preparando tu pedido.`,
        "PENDIENTE",
      );

      ctx.s = ESTADOS.FINALIZADO;
      ctx.pendiente = null;
      ctx.items = [];

      return {
        respuesta:
          `✅ Pedido N.º ${String(documento.punto_venta).padStart(4, "0")}-${String(documento.numero).padStart(8, "0")} registrado.\n\n` +
          this.summary({ ctx }) +
          (entrega ? `\nEntrega: ${entrega}` : "") +
          `\nPago: ${ctx.perfil.condicion === "CUENTA_CORRIENTE" ? "Cuenta corriente" : "Contado"}` +
          "\n\nTe aviso cuando pase a preparación.",
        documento: {
          id: documento.id,
          tipo: documento.tipo,
          numero: documento.numero,
          punto_venta: documento.punto_venta,
          estado: documento.estado,
        },
        finalizado: true,
      };
    } catch (e) {
      return { respuesta: "No pude registrar el pedido. Volvé a intentarlo." };
    }
  }

  quitarLineas({ ctx, descripcion, cantidad, empresaId, clienteId }) {
    if (!descripcion) return { respuesta: "¿Qué querés sacar? Decime el producto." };
    const q = this.normalize(descripcion);
    const idx = ctx.items.findIndex((it) =>
      this.normalize(it.descripcion + " " + (it.codigo || "")).includes(q) || q.includes(this.normalize(it.descripcion)),
    );
    if (idx === -1) {
      return { respuesta: `No tengo “${descripcion}” en el pedido.` };
    }
    const it = ctx.items[idx];
    if (cantidad && cantidad < it.cantidad) {
      it.cantidad -= cantidad;
      return { respuesta: `Listo 👍 Saqué ${this.num(cantidad)} de ${it.descripcion}.\n${this.pieCarrito(ctx)}` };
    }
    ctx.items.splice(idx, 1);
    return { respuesta: `Listo 👍 Saqué ${it.descripcion}.\n${this.pieCarrito(ctx)}` };
  }

  cambiarCantidad({ ctx, cantidad, descripcion }) {
    if (!(cantidad > 0)) return { respuesta: "¿Hasta cuánto lo cambio?" };
    let it = null;
    if (descripcion) {
      const q = this.normalize(descripcion);
      it = ctx.items.find((x) => this.normalize(x.descripcion + " " + (x.codigo || "")).includes(q));
    }
    if (!it) it = ctx.items[ctx.items.length - 1];
    if (!it) return { respuesta: "Todavía no hay productos, agregá uno primero." };
    it.cantidad = cantidad;
    return { respuesta: `Listo 👍 ${this.num(cantidad)} × ${it.descripcion}.\n${this.pieCarrito(ctx)}` };
  }

  reemplazar({ ctx, empresaId, original, nuevo }) {
    if (!original || !nuevo) return { respuesta: "Decime qué sacamos y qué ponemos (ej.: “cambiame el cemento por el holcim”)." };
    const q = this.normalize(original);
    const idx = ctx.items.findIndex((it) => this.normalize(it.descripcion + " " + (it.codigo || "")).includes(q));
    if (idx === -1) return { respuesta: `No tengo “${original}” en el pedido.` };
    const cantidad = ctx.items[idx].cantidad;
    const resolucion = ResolverEngine.resolveProduct({ empresaId, texto: String(nuevo || "").trim(), limit: 5 });
    if (!["RESUELTO"].includes(resolucion.estado) ) {
      if (resolucion.estado === "REQUIERE_SELECCION") {
        const it = ctx.items[idx];
        ctx.pendiente = {
          nombre: nuevo,
          cantidad,
          opciones: resolucion.opciones,
          reemplazoDe: { idx, descripcion: it.descripcion },
        };
        return {
          respuesta:
            `Para “${nuevo}” tengo estas opciones:\n` +
            this.opcionesTexto(resolucion.opciones) +
            "\n¿Cuál usás?",
        };
      }
      return { respuesta: `No encontré “${nuevo}” en el catálogo.` };
    }
    const p = resolucion.seleccionado;
    ctx.items[idx] = {
      codigo: p.codigo || "",
      descripcion: p.descripcion || p.nombre || nuevo,
      cantidad,
      precio: Number(p.precio || 0),
      iva: Number(p.iva || 21),
      unidad: p.unidad || "UN",
      productoId: p.id || p.productoId || null,
    };
    const it = ctx.items[idx];
    return { respuesta: `Cambiado 👍 ${this.num(it.cantidad)} × ${it.descripcion}.\n${this.pieCarrito(ctx)}` };
  }

  respuestaSaldo({ ctx, clienteId }) {
    if (ctx.perfil.saldo == null && clienteId) {
      const doc = db
        .prepare(`SELECT cuit, dni FROM clientes WHERE id=?`)
        .get(clienteId);
    }
    if (ctx.perfil.saldo == null) {
      return { respuesta: "No tengo movimientos cargados para mostrarte. Pedí un resumen a la administración 👍" };
    }
    const saldo = ctx.perfil.saldo;
    if (saldo > 0) return { respuesta: `Tu saldo en cuenta corriente es de $ ${this.money(saldo)}.` };
    return { respuesta: "Estás al día 👍 $ 0,00." };
  }

  respuestaDireccion({ ctx, direccion }) {
    if (direccion) {
      ctx.direccionElegida = direccion;
      return { respuesta: `Anotado ✅ Entrega: ${direccion}.` };
    }
    if (ctx.domicilioCliente) {
      return {
        respuesta: `¿Lo mandamos a ${ctx.domicilioCliente}? Decime “sí” o pasame otra dirección.`,
      };
    }
    return {
      respuesta:
        "¿A dónde lo mandamos? Pasame la dirección (o una referencia, ej.: “obra de calle San Martín”).",
    };
  }

  copiarUltimoPedido({ ctx, empresaId, clienteId }) {
    const doc = db
      .prepare(
        `SELECT d.id, d.tipo
         FROM documentos_comerciales d
         WHERE d.empresa_id=? AND d.cliente_id=? AND d.tipo='NOTA_PEDIDO' AND d.estado<>'ANULADO'
         ORDER BY d.id DESC LIMIT 1`,
      )
      .get(empresaId, clienteId);
    if (!doc) return { respuesta: "Todavía no tengo pedidos anteriores tuyos para copiar 😅" };

    const items = db
      .prepare(
        `SELECT codigo, descripcion, cantidad, precio_unitario, iva
         FROM documento_items WHERE documento_id=? ORDER BY id`,
      )
      .all(doc.id);

    let copiados = 0;
    ctx.items = [];
    for (const it of items || []) {
      if (!it.codigo) continue;
      const p = db
        .prepare(`SELECT id, descripcion, precio, iva, unidad FROM productos WHERE empresa_id=? AND codigo=? AND activo=1`)
        .get(empresaId, it.codigo);
      if (!p) continue;
      this.agregarItem(ctx, {
        codigo: p.codigo,
        descripcion: p.descripcion,
        cantidad: Number(it.cantidad || 1),
        precio: Number(p.precio || 0),
        iva: Number(p.iva || 21),
        unidad: p.unidad || "UN",
        productoId: p.id || null,
      });
      copiados++;
    }
    if (!copiados) return { respuesta: "No pude copiar los productos del pedido anterior." };

    return {
      respuesta: `Dale, copié tu último pedido:\n${this.summary({ ctx })}\n\n${this.pieCarrito(ctx)}`,
    };
  }

  nuevoPedido(ctx) {
    ctx.items = [];
    ctx.pendiente = null;
    ctx.s = ESTADOS.ARMANDO;
    return { respuesta: "Dale, nuevo pedido ✅. Contame qué querés." };
  }

  cancelarPedido(ctx) {
    ctx.items = [];
    ctx.pendiente = null;
    ctx.s = ESTADOS.ARMANDO;
    return { respuesta: "Pedido cancelado. Contame qué querés cuando quieras." };
  }

  omitirPendiente(ctx) {
    ctx.pendiente = null;
    return { respuesta: "Listo, no lo agrego. ¿Algo más?" };
  }

  intencionSi({ ctx, empresaId, clienteId }) {
    if (ctx.s === ESTADOS.CONFIRMACION) return this.crearPedido({ ctx, empresaId, clienteId, telefono: ctx.telefonoOrigen });
    if (ctx.pendiente && ctx.pendiente.opciones?.length) return this.resolverOpcionProducto({ ctx, m: "1" });
    if (ctx.s === ESTADOS.CANCELAR_PROMPT) {
      ctx.items = [];
      ctx.pendiente = null;
      ctx.s = ESTADOS.ARMANDO;
      return { respuesta: "Pedido cancelado quedó vacío." };
    }
    return this.intencionCerrar({ ctx, empresaId, clienteId });
  }

  intencionNo({ ctx }) {
    if (ctx.s === ESTADOS.CONFIRMACION) {
      ctx.s = ESTADOS.ARMANDO;
      return { respuesta: "Queda sin confirmar. Cambiá lo que quieras o decime “cerralo”." };
    }
    ctx.pendiente = null;
    return { respuesta: "Azul. ¿Algo más o cerramos?" };
  }

  procesarLineas({ ctx, lineas, empresaId }) {
    const salidas = [];

    for (const linea of lineas) {
      const resolucion = ResolverEngine.resolveProduct({
        empresaId,
        texto: linea.nombre,
        limit: 5,
      });

      if (resolucion.estado === "RESUELTO") {
        const p = resolucion.seleccionado;
        const agregado = this.agregarItem(ctx, {
          codigo: p.codigo || "",
          descripcion: p.descripcion || p.nombre || linea.nombre,
          cantidad: linea.cantidad,
          precio: Number(p.precio || 0),
          iva: Number(p.iva || 21),
          unidad: p.unidad || "UN",
          productoId: p.id || p.productoId || null,
        });
        salidas.push(this.lineaConfirmada(ctx, agregado));
        continue;
      }

      if (resolucion.estado === "REQUIERE_SELECCION") {
        ctx.pendiente = {
          nombre: linea.nombre,
          cantidad: linea.cantidad,
          opciones: resolucion.opciones,
        };
        salidas.push(
          `Para “${linea.nombre}” tengo estas opciones:\n` +
            this.opcionesTexto(resolucion.opciones) +
            "\n¿Cuál usás?",
        );
        continue;
      }

      ctx.pendiente = {
        nombre: linea.nombre,
        cantidad: linea.cantidad,
        sinOpciones: true,
      };
      salidas.push(
        `No encuentro “${linea.nombre}” en el catálogo. ¿Querés probar con otra palabra o digo “omitilo”?`,
      );
      continue;
    }

    const ultima = salidas[salidas.length - 1];
    const cuerpo = salidas.length === 1 ? ultima : salidas.join("\n");
    return { respuesta: `${cuerpo}\n${this.pieCarrito(ctx)}` };
  }

  resolverOpcionProducto({ ctx, m }) {
    const opciones = ctx.pendiente.opciones;
    const cantidadLiteral = m.match(/\b(\d+(?:[.,]\d+)?)\b/);
    const cantidad = cantidadLiteral && Number(cantidadLiteral[1].replace(",", "."));
    const mencionaIndice = /(primer[oa]|segund[oa]|tercer[oa]|\b(\d{1,2})\b)/i.exec(m);

    let elegida = null;

    if (mencionaIndice) {
      const idxMaybe = /^(\d{1,2})$/.exec(m);
      if (idxMaybe) elegida = opciones[Number(idxMaybe[1]) - 1] || null;
      else if (/primer/i.test(m)) elegida = opciones[0];
      else if (/segund/i.test(m)) elegida = opciones[1];
      else if (/tercer/i.test(m)) elegida = opciones[2];
    }

    const nombreMatch = /(el |la |una |un )?([a-záéíóúñ ]+)/i.exec(m);
    if (!elegida && nombreMatch) {
      const palabras = nombreMatch[2]
        .split(/\s+/)
        .filter((w) => w.length > 2 && !this.PALABRAS_DE_RALLEO().has(w));
      elegida = opciones.find((o) => {
        const texto = this.normalize(`${o.descripcion || o.nombre || ""} ${o.codigo || ""}`);
        return palabras.length && palabras.every((w) => texto.includes(w));
      });
    }

    if (SI.test(m) && cantidad == null && !elegida) {
      elegida = opciones[0];
    }

    if (NO.test(m)) {
      ctx.pendiente = null;
      return { respuesta: "Listo, lo dejo afuera." };
    }

    if (!elegida) {
      return {
        respuesta:
          "Decime cuál (1, 2…), el nombre o “omitilo”:\n" + this.opcionesTexto(opciones),
      };
    }

    const qty = ctx.pendiente.cantidad ?? cantidad ?? 1;

    const agregado = this.agregarItem(ctx, {
      codigo: elegida.codigo || "",
      descripcion: elegida.descripcion || elegida.nombre || ctx.pendiente.nombre,
      cantidad: qty,
      precio: Number(elegida.precio || 0),
      iva: Number(elegida.iva || 21),
      unidad: elegida.unidad || "UN",
      productoId: elegida.id || elegida.productoId || null,
    });

    ctx.pendiente = null;

    return {
      respuesta: this.lineaConfirmada(ctx, agregado),
    };
  }

  resolverProductoFaltante({ ctx, m, empresaId }) {
    if (/^(omit[ií]lo|omitir|pas[aá]lo|podal|no|otre|otro|otra|acept[aá]?)$/i.test(m)) {
      ctx.pendiente = null;
      return { respuesta: "Listo, lo omito. ¿Seguimos o cerramos el pedido?" };
    }
    if (SI.test(m)) {
      ctx.pendiente = null;
      if (ctx.items.length) return this.intencionCerrar({ ctx, empresaId, clienteId: ctx.clienteId });
      return { respuesta: "¿Qué producto querés? Ej.: “2 cal y 5 cemento”." };
    }
    const lineas = this.parsearLineas(m);
    if (lineas.length) {
      ctx.pendiente = null;
      return this.procesarLineas({ ctx, lineas, empresaId });
    }
    return {
      respuesta:
        "Seguimos sin encontrarlo. Probalo con otro nombre (ej.: “cemento”, “cal hidratada”) o decime “omitilo”.",
    };
  }

  summary({ ctx }) {
    if (!ctx.items.length) return "Pedido: (vacío)";

    const lines = ctx.items.map(
      (it) => `- ${this.num(it.cantidad)} × ${it.descripcion} — $ ${this.money(it.precio * it.cantidad)}`,
    );

    let texto = `Pedido\n${lines.join("\n")}`;
    const total = ctx.items.reduce((n, it) => n + it.precio * it.cantidad, 0);
    texto += `\nTotal: $ ${this.money(total)}`;

    return texto;
  }

  resumenCorto(ctx) {
    if (!ctx.items.length) return "Por ahora el pedido está vacío 😅";
    return `Llevás ${ctx.items.length} product${ctx.items.length === 1 ? "o" : "os"}:\n${this.summary({ ctx })}\n\n¿Seguimos?`;
  }

  pieCarrito(ctx) {
    if (!ctx.items.length) return "¿Agregamos algo más?";
    const total = ctx.items.reduce((n, it) => n + it.precio * it.cantidad, 0);
    return `Total hasta ahora: $ ${this.money(total)}\n¿Algo más o cerramos?`;
  }

  lineaConfirmada(ctx, it) {
    const total = Number(it.precio) * Number(it.cantidad);
    return `Listo 👍 ${this.num(it.cantidad)} × ${it.descripcion} — $ ${this.money(total)}.`;
  }

  opcionesTexto(opciones) {
    return opciones
      .slice(0, 4)
      .map(
        (o, i) =>
          `${i + 1}. ${o.descripcion || o.nombre || o.razon_social}${o.codigo ? ` (${o.codigo})` : ""} — $ ${this.money(Number(o.precio || 0))}`,
      )
      .join("\n");
  }

  parsearLineas(mensaje) {
    const lineas = [];
    const m = this.limpiarMedidas(this.normalizarCliente(String(mensaje || "").trim()));

    const conCantidad = m.match(
      /(?:s[íi]|hac(e|é)|quiero|necesito|mand(ame|á)?|tra(e)?s?\b|agreg(á|áme|ame)?|sum(á|ame)?|pon(e|é|eme)?)\s+(\d+(?:[.,]\d+)?)\s+([a-záéíóúñ][a-záéíóúñ ]*?)(?=\s+(y|,|entonces|fin|$))/,
    );

    const patron = /(\d+(?:[.,]\d+)?)\s+([a-záéíóúñ][a-záéíóúñ ]*?)(?=\s+(?:y\s*i?voy)?[a-záéíóúñ0-9]|$)/g;

    let match;
    const resultados = [];
    while ((match = patron.exec(m)) !== null) {
      resultados.push({ cant: match[1], nombre: match[2].trim() });
    }

    if (!resultados.length && conCantidad) {
      resultados.push({ cant: conCantidad[2], nombre: conCantidad[3].trim() });
    }

    if (!resultados.length && m.length > 2) {
      const solo = this.limpiarNombre(m);
      if (solo.length >= 3 && !this.VERBOS_SUELTOS().has(solo)) {
        resultados.push({ cant: null, nombre: solo });
      }
    }

    for (const r of resultados) {
      const nombre = this.limpiarNombre(r.nombre);
      if (nombre.length < 3) continue;
      lineas.push({ cantidad: r.cant ? Math.max(0.001, Number(r.cant.replace(",", "."))) : null, nombre });
    }

    return lineas;
  }

  parsearNombre(texto) {
    return this.limpiarNombre(texto);
  }

  limpiarNombre(fragmento) {
    return this.normalizarCliente(fragmento)
      .replace(/^(s[íi]\s+)?/, "")
      .replace(/(\d+(?:[.,]\d+)?)\s+/g, "")
      .replace(/\b(bolsa|bolsas|caja|cajas|paquete|paquetes|unidad|unidades|unid|kilo|kilos|kg|litro|litros|metro|metros|m3|cm|mm|de|del|por)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  limpiarMedidas(m) {
    return String(m || "")
      .trim()
      .replace(/\b(bolsas?|cajas?|paquetes?|unidades?|unid|kilos?|litros?|metros?|mts|kg|gr|m3|cm|mm)\s+(de|por)\b/gi, " ")
      .replace(/\b(bolsas?|cajas?|paquetes?|unidades?|unid|kilos?|litros?|metros?|mts|kg|gr|m3|cm|mm)\b/gi, " ")
      .replace(/(\d+)\s+de\s+/gi, "$1 ")
      .replace(/\s+/g, " ")
      .trim();
  }

  normalizarCliente(m) {
    return String(m || "")
      .toLowerCase()
      .replace(/,/g, " ")
      .replace(/(\d+(?:[.,]\d+)?)\s+([a-záéíóúüñ][a-záéíóúüñ]*)(?:s|es)(?=\s|$)/g, "$1 $2");
  }

  normalize(texto) {
    return String(texto || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ");
  }

  PALABRAS_DE_RALLEO() {
    return new Set([
      "del","de","los","las","la","el","un","una","unos","unas","y","o","u","por","para","con","bolsa","bolsas","caja","cajas","paquete","paquetes","unidad","unidades","kilos","kilo","kg","m3","cm","mm",
    ]);
  }

  VERBOS_SUELTOS() {
    return new Set([
      "agregar","agregame","agrega","sumar","sumame","poner","poneme","quitar","quitame","sacar","sacame","mandar","mandame","enviar","enviame","comprar","pedir","cerrar","confirmar","cancelar","resumen","bueno","hola","dale","listo","ok","oka","nada","todo","eso","solo","solo eso",
    ]);
  }

  agregarItem(ctx, it) {
    const existente = ctx.items.find((x) => x.codigo && x.codigo === it.codigo);
    if (existente) {
      existente.cantidad += it.cantidad;
      return existente;
    }
    const nuevo = {
      codigo: it.codigo,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precio: it.precio,
      iva: it.iva,
      unidad: it.unidad,
      productoId: it.productoId,
    };
    ctx.items.push(nuevo);
    return nuevo;
  }

  ayuda() {
    return [
      "Contame qué querés, por ejemplo: “mandame 10 bolsas de cemento y 5 cal”.",
      "También puedo: “sacá la cal”, “poneme 8 mejor”, “cuánto llevo”, “cuánto tengo de saldo”, “repetí mi pedido anterior”, “lo mando a la obra de San Martín”, “cerralo”.",
    ].join("\n");
  }

  num(v) {
    const n = Number(v || 0);
    return n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
  }

  money(v) {
    return Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

module.exports = new PedidoConversacional();
