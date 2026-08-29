const ConversationService = require("./conversationService");

const States = require("./conversationStates");

const Intents = require("./conversationIntents");

const IntentDetector = require("./intentDetector");

const WorkspaceEngine = require("../../workspace/workspaceEngine");

const WorkspaceConfirmationEngine = require("../../workspace/workspaceConfirmationEngine");
const MessageParser = require("./messageParser");

/*
 * ConversationEngine
 *
 * Coordina el flujo de las conversaciones comerciales.
 * Detecta intenciones, administra estados y delega
 * operaciones a WorkspaceEngine y otros motores.
 */
class ConversationEngine {
  /*
   * Inicia una conversación nueva o recupera
   * la conversación activa del mismo teléfono.
   */
  start(data) {
    return ConversationService.start(data);
  }

  /*
   * Recupera una conversación por su identificador.
   */
  load(conversationId) {
    return ConversationService.load(conversationId);
  }

  /*
   * Asocia un workspace a una conversación
   * y deja el flujo esperando un cliente.
   */
  attachWorkspace({ conversationId, workspaceId }) {
    const conversation = this.load(conversationId);

    conversation.setWorkspace(workspaceId).waitCustomer();

    return ConversationService.save(conversation);
  }

  /*
   * Cambia manualmente el estado de una conversación.
   */
  changeState({ conversationId, estado }) {
    const conversation = this.load(conversationId);

    conversation.changeState(estado);

    return ConversationService.save(conversation);
  }

  /*
   * Guarda un dato dentro del contexto conversacional.
   */
  setContext({ conversationId, key, value }) {
    const conversation = this.load(conversationId);

    conversation.setContext(key, value);

    return ConversationService.save(conversation);
  }

  /*
   * Finaliza correctamente una conversación.
   */
  finish(conversationId) {
    return ConversationService.finish(conversationId);
  }

  /*
   * Cancela una conversación.
   */
  cancel(conversationId) {
    return ConversationService.cancel(conversationId);
  }

  /*
   * Devuelve el estado actual de una conversación.
   */
  getState(conversationId) {
    return this.load(conversationId).getState();
  }

  /*
   * Indica si una conversación todavía está activa.
   */
  isActive(conversationId) {
    return this.load(conversationId).isActive();
  }

  /*
   * Devuelve todos los estados disponibles.
   */
  getStates() {
    return States;
  }

  /*
   * Recibe un mensaje, detecta su intención
   * y continúa el flujo conversacional.
   */
  async receiveMessage({
    empresaId,
    empresaNombre,
    telefono,
    canal = "API",
    mensaje,
    usuarioId = null,
  }) {
    const conversation = ConversationService.start({
      empresaId,
      telefono,
      canal,
    });

    const detection = IntentDetector.detect(mensaje);

    /*
     * Guarda el último mensaje y la intención
     * para trazabilidad y futuras decisiones.
     */
    conversation
      .setContext("ultimoMensaje", mensaje)
      .setContext("ultimaIntencion", detection.intent);

    /*
     * Permite cancelar desde cualquier estado.
     */
    if (detection.intent === Intents.CANCEL) {
      conversation.cancel();

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        intent: detection,
        response: {
          type: "CANCELLED",
          message: "La operación fue cancelada.",
        },
      };
    }

    /*
     * Muestra ayuda sin modificar
     * el estado comercial actual.
     */
    if (detection.intent === Intents.HELP) {
      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        intent: detection,
        response: this.buildHelpResponse(),
      };
    }

    /*
     * Si todavía no existe un workspace,
     * intenta iniciar una nueva operación.
     */
    if (!conversation.workspaceId) {
      return this.handleWithoutWorkspace({
        conversation,
        detection,
        empresaId,
        telefono,
        canal,
        usuarioId,
      });
    }

    /*
     * Continúa el flujo del workspace activo.
     */
    return await this.handleWithWorkspace({
      conversation,
      detection,
      mensaje,
      empresaId,
      empresaNombre,
      usuarioId,
    });
  }

  /*
   * Crea un workspace cuando el usuario
   * informa qué operación desea realizar.
   */
  handleWithoutWorkspace({
    conversation,
    detection,
    empresaId,
    telefono,
    canal,
    usuarioId,
  }) {
    const tipoOperacion = this.resolveWorkspaceOperation(detection.intent);

    /*
     * Si todavía no se reconoció una operación,
     * se solicita al usuario que indique una.
     */
    if (!tipoOperacion) {
      conversation.waitOperation();

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        intent: detection,
        response: {
          type: "ASK_OPERATION",
          message:
            "¿Qué querés hacer? Podés crear un presupuesto, una nota de pedido, un remito o una factura.",
        },
      };
    }

    /*
     * Crea el borrador comercial que se irá
     * completando durante la conversación.
     */
    const workspace = WorkspaceEngine.create({
      empresaId,
      usuarioId,
      canal,
      telefonoOrigen: telefono,
      tipoOperacion,
      condicionVenta: "CONTADO",
      listaPrecio: "GENERAL",
    });

    conversation
      .setWorkspace(workspace.id)
      .setContext("tipoOperacion", tipoOperacion)
      .waitCustomer();

    /*
     * Intenta obtener cliente y producto del mismo
     * mensaje que inició la operación.
     */
    const completed = this.tryCompleteInitialOperation({
      conversation,
      workspace,
      mensaje: detection.originalMessage || "",
      empresaId,
      usuarioId,
      detection,
    });

    if (completed) {
      return completed;
    }

    const saved = ConversationService.save(conversation);

    return {
      conversation: saved.toPlainObject(),
      workspace,
      intent: detection,
      response: {
        type: "ASK_CUSTOMER",
        message: `${this.getOperationLabel(
          tipoOperacion,
        )} iniciado. ¿Para qué cliente es?`,
      },
    };
  }

  /*
   * Continúa el flujo de una conversación
   * que ya tiene un workspace asociado.
   */
  async handleWithWorkspace({
    conversation,
    detection,
    mensaje,
    empresaId,
    empresaNombre,
    usuarioId,
  }) {
    const workspace = WorkspaceEngine.load(conversation.workspaceId);

    /*
     * Evita utilizar un workspace
     * perteneciente a otra empresa.
     */
    if (Number(workspace.empresaId) !== Number(empresaId)) {
      const error = new Error("El workspace pertenece a otra empresa");

      error.statusCode = 403;
      throw error;
    }

    /*
     * Procesa una elección pendiente entre
     * varias coincidencias posibles.
     */
    if (conversation.estado === States.WAITING_SELECTION) {
      return this.handleSelectionMessage({
        conversation,
        workspace,
        mensaje,
        empresaId,
        usuarioId,
        detection,
      });
    }

    /*
     * Procesa el cliente cuando el sistema
     * está esperando su selección.
     */
    if (conversation.estado === States.WAITING_CUSTOMER) {
      return this.handleCustomerMessage({
        conversation,
        workspace,
        mensaje,
        empresaId,
        usuarioId,
        detection,
      });
    }

    /*
     * Procesa productos mientras se está
     * construyendo la operación comercial.
     */
    if (conversation.estado === States.WAITING_PRODUCT) {
      return this.handleProductMessage({
        conversation,
        workspace,
        mensaje,
        empresaId,
        usuarioId,
        detection,
      });
    }

    /*
     * Confirma y ejecuta el workspace
     * cuando el usuario acepta el resumen.
     */
    if (conversation.estado === States.WAITING_CONFIRMATION) {
      return await this.handleConfirmationMessage({
        conversation,
        workspace,
        detection,
        empresaId,
        empresaNombre,
        usuarioId,
      });
    }

    /*
     * Informa que el estado no pudo procesarse.
     */
    const saved = ConversationService.save(conversation);

    return {
      conversation: saved.toPlainObject(),
      workspace,
      intent: detection,
      response: {
        type: "UNKNOWN_STATE",
        message:
          "No pude determinar qué dato falta. Escribí ayuda para ver las opciones.",
      },
    };
  }

  /*
   * Busca y asigna el cliente mencionado
   * por el usuario.
   */
  handleCustomerMessage({
    conversation,
    workspace,
    mensaje,
    empresaId,
    usuarioId,
    detection,
  }) {
    const result = WorkspaceEngine.resolveAndSetCustomer({
      workspaceId: workspace.id,
      empresaId,
      texto: mensaje,
      usuarioId,
    });

    /*
     * Informa cuando no se encontró ningún cliente.
     */
    if (result.resolucion.estado === "NO_ENCONTRADO") {
      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace: result.workspace,
        intent: detection,
        resolution: result.resolucion,
        response: {
          type: "CUSTOMER_NOT_FOUND",
          message: `No encontré un cliente parecido a "${mensaje}". Probá con nombre, CUIT o DNI.`,
        },
      };
    }

    /*
     * Guarda las opciones cuando existen
     * varias coincidencias posibles.
     */
    if (result.resolucion.estado === "REQUIERE_SELECCION") {
      conversation
        .waitSelection()
        .setContext("tipoSeleccion", "CLIENTE")
        .setContext("opcionesSeleccion", result.resolucion.opciones);

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace: result.workspace,
        resolution: result.resolucion,
        intent: detection,
        response: {
          type: "SELECT_CUSTOMER",
          message: this.buildCustomerOptionsMessage(result.resolucion.opciones),
          options: result.resolucion.opciones,
        },
      };
    }

    /*
     * Guarda el cliente seleccionado
     * y solicita el primer producto.
     */
    conversation
      .setContext("clienteId", result.resolucion.seleccionado.id)
      .waitProduct();

    const saved = ConversationService.save(conversation);

    return {
      conversation: saved.toPlainObject(),
      workspace: result.workspace,
      resolution: result.resolucion,
      intent: detection,
      response: {
        type: "ASK_PRODUCT",
        message: `Cliente seleccionado: ${this.getCustomerName(
          result.resolucion.seleccionado,
        )}. ¿Qué producto querés agregar?`,
      },
    };
  }

  /*
   * Busca un producto y lo agrega
   * al workspace comercial.
   */
  handleProductMessage({
    conversation,
    workspace,
    mensaje,
    empresaId,
    usuarioId,
    detection,
  }) {
    /*
     * El primer confirmar muestra el resumen.
     * El segundo confirmar ejecutará la operación.
     */
    if (detection.intent === Intents.CONFIRM) {
      conversation.waitConfirmation();

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace,
        intent: detection,
        response: {
          type: "CONFIRM_OPERATION",
          message: this.buildWorkspaceSummary(workspace),
        },
      };
    }

    /*
     * Extrae la cantidad y limpia la descripción
     * antes de buscar el producto.
     */
    const parsed = MessageParser.parseProductMessage(mensaje);

    /*
     * Valida que haya quedado un texto útil
     * para realizar la búsqueda.
     */
    if (!parsed.textoProducto) {
      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace,
        intent: detection,
        response: {
          type: "INVALID_PRODUCT_MESSAGE",
          message:
            "No pude identificar el producto. Probá, por ejemplo: 10 hierros.",
        },
      };
    }

    /*
     * Busca el producto usando solo su descripción
     * y aplica la cantidad detectada.
     */
    const result = WorkspaceEngine.resolveAndAddProduct({
      workspaceId: workspace.id,
      empresaId,
      texto: parsed.textoProducto,
      cantidad: parsed.cantidad,
      descuento: 0,
      usuarioId,
    });

    /*
     * Informa cuando no se encontró ningún producto.
     */
    if (result.resolucion.estado === "NO_ENCONTRADO") {
      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace: result.workspace,
        resolution: result.resolucion,
        intent: detection,
        response: {
          type: "PRODUCT_NOT_FOUND",
          message: `No encontré un producto parecido a "${mensaje}".`,
        },
      };
    }

    /*
     * Guarda las opciones cuando hay
     * varios productos posibles.
     */
    if (result.resolucion.estado === "REQUIERE_SELECCION") {
      conversation
        .waitSelection()
        .setContext("tipoSeleccion", "PRODUCTO")
        .setContext("opcionesSeleccion", result.resolucion.opciones)
        .setContext("cantidadPendiente", parsed.cantidad);

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace: result.workspace,
        resolution: result.resolucion,
        intent: detection,
        response: {
          type: "SELECT_PRODUCT",
          message: this.buildProductOptionsMessage(result.resolucion.opciones),
          options: result.resolucion.opciones,
        },
      };
    }

    /*
     * Mantiene el flujo esperando más productos.
     */
    conversation.waitProduct();

    const saved = ConversationService.save(conversation);

    return {
      conversation: saved.toPlainObject(),
      workspace: result.workspace,
      resolution: result.resolucion,
      intent: detection,
      response: {
        type: "PRODUCT_ADDED",
        message: `${parsed.cantidad} x ${result.resolucion.seleccionado.descripcion} agregado. Podés agregar otro producto o escribir confirmar.`,
      },
    };
  }

  /*
   * Procesa el número elegido cuando existen
   * varias coincidencias de cliente o producto.
   */
  handleSelectionMessage({
    conversation,
    workspace,
    mensaje,
    empresaId,
    usuarioId,
    detection,
  }) {
    const opciones = conversation.getContext("opcionesSeleccion") || [];

    const tipoSeleccion = conversation.getContext("tipoSeleccion");

    const numeroSeleccionado = Number(String(mensaje || "").trim());

    /*
     * Controla que la posición seleccionada sea válida.
     */
    if (
      !Number.isInteger(numeroSeleccionado) ||
      numeroSeleccionado < 1 ||
      numeroSeleccionado > opciones.length
    ) {
      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace,
        intent: detection,
        response: {
          type: "INVALID_SELECTION",
          message: `Elegí un número entre 1 y ${opciones.length}.`,
          options: opciones,
        },
      };
    }

    const seleccionado = opciones[numeroSeleccionado - 1];

    /*
     * Asigna el cliente seleccionado
     * y continúa con los productos.
     */
    /*
     * Asigna el cliente seleccionado y, si había un producto
     * pendiente en el mensaje inicial, intenta agregarlo.
     */
    if (tipoSeleccion === "CLIENTE") {
      const actualizado = WorkspaceEngine.setCustomer({
        workspaceId: workspace.id,
        empresaId,
        clienteId: seleccionado.id,
        usuarioId,
      });

      /*
       * Recupera el producto y la cantidad que pudieron
       * venir en el primer mensaje de la conversación.
       */
      const productoPendiente = conversation.getContext("productoPendiente");

      const cantidadPendiente = Number(
        conversation.getContext("cantidadPendiente") || 1,
      );

      /*
       * Guarda el cliente seleccionado y limpia
       * los datos temporales de selección.
       */
      conversation
        .setContext("clienteId", seleccionado.id)
        .clearSelection(States.WAITING_PRODUCT);

      /*
       * Si había un producto pendiente, intenta
       * resolverlo y agregarlo automáticamente.
       */
      if (productoPendiente) {
        conversation
          .removeContext("productoPendiente")
          .removeContext("cantidadPendiente");

        const productResult = WorkspaceEngine.resolveAndAddProduct({
          workspaceId: workspace.id,
          empresaId,
          texto: productoPendiente,
          cantidad: cantidadPendiente,
          descuento: 0,
          usuarioId,
        });

        /*
         * Si el producto fue resuelto, muestra
         * directamente el resumen para confirmar.
         */
        if (productResult.resolucion.estado === "RESUELTO") {
          conversation.waitConfirmation();

          const saved = ConversationService.save(conversation);

          const updatedWorkspace = WorkspaceEngine.load(workspace.id);

          return {
            conversation: saved.toPlainObject(),
            workspace: updatedWorkspace,
            seleccionado,
            intent: detection,
            response: {
              type: "CONFIRM_OPERATION",
              message: this.buildWorkspaceSummary(updatedWorkspace),
            },
          };
        }

        /*
         * Si hay varios productos posibles,
         * pide al usuario elegir uno.
         */
        if (productResult.resolucion.estado === "REQUIERE_SELECCION") {
          conversation
            .waitSelection()
            .setContext("tipoSeleccion", "PRODUCTO")
            .setContext("opcionesSeleccion", productResult.resolucion.opciones)
            .setContext("cantidadPendiente", cantidadPendiente);

          const saved = ConversationService.save(conversation);

          return {
            conversation: saved.toPlainObject(),
            workspace: productResult.workspace,
            seleccionado,
            intent: detection,
            response: {
              type: "SELECT_PRODUCT",
              message: this.buildProductOptionsMessage(
                productResult.resolucion.opciones,
              ),
              options: productResult.resolucion.opciones,
            },
          };
        }

        /*
         * Si no encontró el producto, conserva
         * el cliente y solicita otro producto.
         */
        conversation.waitProduct();

        const saved = ConversationService.save(conversation);

        return {
          conversation: saved.toPlainObject(),
          workspace: actualizado,
          seleccionado,
          intent: detection,
          response: {
            type: "PRODUCT_NOT_FOUND",
            message: `Cliente seleccionado, pero no encontré el producto "${productoPendiente}". Indicá otro producto.`,
          },
        };
      }

      /*
       * Si no había producto pendiente,
       * simplemente solicita el primer producto.
       */
      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace: actualizado,
        seleccionado,
        intent: detection,
        response: {
          type: "ASK_PRODUCT",
          message: `Cliente seleccionado: ${this.getCustomerName(
            seleccionado,
          )}. ¿Qué producto querés agregar?`,
        },
      };
    }

    /*
     * Agrega el producto seleccionado
     * con la cantidad pendiente.
     */
    if (tipoSeleccion === "PRODUCTO") {
      const cantidadPendiente = Number(
        conversation.getContext("cantidadPendiente") || 1,
      );

      const actualizado = WorkspaceEngine.addProduct({
        workspaceId: workspace.id,
        empresaId,
        productoId: seleccionado.id,
        cantidad: cantidadPendiente,
        descuento: 0,
        usuarioId,
      });

      conversation
        .removeContext("cantidadPendiente")
        .clearSelection(States.WAITING_PRODUCT);

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace: actualizado,
        seleccionado,
        intent: detection,
        response: {
          type: "PRODUCT_ADDED",
          message: `${cantidadPendiente} x ${seleccionado.descripcion} agregado. Podés agregar otro producto o escribir confirmar.`,
        },
      };
    }

    /*
     * Reinicia la selección si el contexto
     * quedó incompleto o inválido.
     */
    conversation.clearSelection(States.WAITING_PRODUCT);

    const saved = ConversationService.save(conversation);

    return {
      conversation: saved.toPlainObject(),
      workspace,
      intent: detection,
      response: {
        type: "SELECTION_RESET",
        message:
          "La selección anterior no es válida. Indicá nuevamente el producto.",
      },
    };
  }

  /*
   * Confirma el workspace y genera
   * el documento comercial definitivo.
   */
  async handleConfirmationMessage({
    conversation,
    workspace,
    detection,
    empresaId,
    empresaNombre,
    usuarioId,
  }) {
    /*
     * Si el usuario no confirma, vuelve
     * al estado de carga de productos.
     */
    if (detection.intent !== Intents.CONFIRM) {
      conversation.waitProduct();

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace,
        intent: detection,
        response: {
          type: "CONFIRMATION_REJECTED",
          message:
            "La operación no fue confirmada. Podés seguir agregando productos o escribir cancelar.",
        },
      };
    }

    /*
     * Marca la conversación como procesando
     * antes de ejecutar el documento.
     */
    conversation.startProcessing();

    ConversationService.save(conversation);

    try {
      /*
       * Ejecuta el proceso comercial
       * correspondiente al workspace.
       */
      const resultado = await WorkspaceConfirmationEngine.confirm({
        workspaceId: workspace.id,
        empresa: empresaNombre,
        empresaId,
        usuarioId,
      });

      /*
       * Finaliza la conversación y guarda
       * el resultado generado.
       */
      conversation.setContext("resultado", resultado).finish();

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace,
        intent: detection,
        resultado,
        response: {
          type: "OPERATION_COMPLETED",
          message: this.buildCompletedMessage({
            workspace,
            resultado,
          }),
        },
      };
    } catch (error) {
      /*
       * Permite reintentar la confirmación
       * sin perder el workspace.
       */
      conversation.waitConfirmation().setContext("ultimoError", error.message);

      ConversationService.save(conversation);

      throw error;
    }
  }

  /*
   * Traduce una intención detectada
   * al tipo de workspace correspondiente.
   */
  resolveWorkspaceOperation(intent) {
    const operations = {
      [Intents.CREATE_QUOTATION]: "PRESUPUESTO",

      [Intents.CREATE_ORDER]: "NOTA_PEDIDO",

      [Intents.CREATE_REMITO]: "REMITO",

      [Intents.CREATE_INVOICE]: "FACTURA",
    };

    return operations[intent] || null;
  }

  /*
   * Devuelve el nombre visible
   * de una operación comercial.
   */
  getOperationLabel(type) {
    const labels = {
      PRESUPUESTO: "Presupuesto",
      NOTA_PEDIDO: "Nota de pedido",
      REMITO: "Remito",
      FACTURA: "Factura",
    };

    return labels[type] || type;
  }

  /*
   * Obtiene el nombre visible de un cliente.
   */
  getCustomerName(customer) {
    return (
      customer?.razon_social ||
      customer?.razonSocial ||
      customer?.nombre ||
      customer?.cuit ||
      "Cliente"
    );
  }

  /*
   * Construye el mensaje para elegir
   * entre varios clientes.
   */
  buildCustomerOptionsMessage(options) {
    const lines = options.map(
      (customer, index) => `${index + 1}. ${this.getCustomerName(customer)}`,
    );

    return [
      "Encontré varios clientes:",
      ...lines,
      "Indicá el número de la opción.",
    ].join("\n");
  }

  /*
   * Construye el mensaje para elegir
   * entre varios productos.
   */
  buildProductOptionsMessage(options) {
    const lines = options.map(
      (product, index) => `${index + 1}. ${product.descripcion}`,
    );

    return [
      "Encontré varios productos:",
      ...lines,
      "Indicá el número de la opción.",
    ].join("\n");
  }

  /*
   * Genera un resumen previo
   * a confirmar el workspace.
   */
  buildWorkspaceSummary(workspace) {
    const summary = workspace.getConfirmationSummary();

    const itemLines = summary.items.map(
      (item) => `${item.cantidad} x ${item.descripcion}`,
    );

    const total = Number(summary.totals.total || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return [
      "Resumen de la operación:",
      ...itemLines,
      `Total: $ ${total}`,
      "¿Confirmás?",
    ].join("\n");
  }

  /*
   * Construye el mensaje final
   * cuando el documento fue generado.
   */
  buildCompletedMessage({ workspace, resultado }) {
    const tipo = this.getOperationLabel(workspace.tipoOperacion);

    const documento =
      resultado?.documento ||
      resultado?.documentoOrigen ||
      resultado?.factura ||
      null;

    const pdfUrl =
      resultado?.pdf?.publicUrl ||
      resultado?.pdf?.url ||
      resultado?.documento?.pdf_url ||
      resultado?.factura?.pdf?.publicUrl ||
      resultado?.factura?.pdfUrl ||
      null;

    const numero =
      documento?.numero ||
      resultado?.numero ||
      resultado?.factura?.numero ||
      null;

    const lines = [`${tipo} generado correctamente.`];

    if (numero) {
      lines.push(`Número: ${numero}`);
    }

    if (pdfUrl) {
      lines.push(`PDF: ${pdfUrl}`);
    }

    return lines.join("\n");
  }

  /*
   * Devuelve las operaciones principales
   * disponibles para el usuario.
   */
  buildHelpResponse() {
    return {
      type: "HELP",
      message: [
        "Podés escribir:",
        "- Crear presupuesto",
        "- Crear nota de pedido",
        "- Crear remito",
        "- Crear factura",
        "- Confirmar",
        "- Cancelar",
      ].join("\n"),
    };
  }
  /*
   * Intenta completar cliente y primer producto
   * directamente desde el mensaje inicial.
   *
   * Si alguna entidad requiere selección, conserva
   * las opciones dentro de la conversación.
   */
  tryCompleteInitialOperation({
    conversation,
    workspace,
    mensaje,
    empresaId,
    usuarioId,
    detection,
  }) {
    const parsed = MessageParser.parseCommercialOperation(mensaje);

    /*
     * Si el mensaje no contiene cliente,
     * continúa con el flujo normal.
     */
    if (!parsed.clienteTexto) {
      return null;
    }

    const customerResult = WorkspaceEngine.resolveAndSetCustomer({
      workspaceId: workspace.id,
      empresaId,
      texto: parsed.clienteTexto,
      usuarioId,
    });

    /*
     * Pide nuevamente el cliente si no fue encontrado.
     */
    if (customerResult.resolucion.estado === "NO_ENCONTRADO") {
      conversation.waitCustomer();

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace: customerResult.workspace,
        intent: detection,
        resolution: customerResult.resolucion,
        response: {
          type: "CUSTOMER_NOT_FOUND",
          message: `No encontré el cliente "${parsed.clienteTexto}". Indicá nombre, CUIT o DNI.`,
        },
      };
    }

    /*
     * Guarda las opciones si existen varios clientes.
     */
    if (customerResult.resolucion.estado === "REQUIERE_SELECCION") {
      conversation
        .waitSelection()
        .setContext("tipoSeleccion", "CLIENTE")
        .setContext("opcionesSeleccion", customerResult.resolucion.opciones)
        .setContext("productoPendiente", parsed.productoTexto)
        .setContext("cantidadPendiente", parsed.cantidad);

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace: customerResult.workspace,
        intent: detection,
        resolution: customerResult.resolucion,
        response: {
          type: "SELECT_CUSTOMER",
          message: this.buildCustomerOptionsMessage(
            customerResult.resolucion.opciones,
          ),
          options: customerResult.resolucion.opciones,
        },
      };
    }

    conversation.setContext(
      "clienteId",
      customerResult.resolucion.seleccionado.id,
    );

    /*
     * Si no había producto en el mensaje,
     * simplemente solicita uno.
     */
    if (!parsed.productoTexto) {
      conversation.waitProduct();

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace: customerResult.workspace,
        intent: detection,
        response: {
          type: "ASK_PRODUCT",
          message: `Cliente seleccionado: ${this.getCustomerName(
            customerResult.resolucion.seleccionado,
          )}. ¿Qué producto querés agregar?`,
        },
      };
    }

    const productResult = WorkspaceEngine.resolveAndAddProduct({
      workspaceId: workspace.id,
      empresaId,
      texto: parsed.productoTexto,
      cantidad: parsed.cantidad,
      descuento: 0,
      usuarioId,
    });

    /*
     * Solicita otro texto si el producto no existe.
     */
    if (productResult.resolucion.estado === "NO_ENCONTRADO") {
      conversation.waitProduct();

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace: productResult.workspace,
        intent: detection,
        response: {
          type: "PRODUCT_NOT_FOUND",
          message: `Encontré al cliente, pero no el producto "${parsed.productoTexto}". Indicá otro producto.`,
        },
      };
    }

    /*
     * Guarda las alternativas cuando existen
     * varios productos coincidentes.
     */
    if (productResult.resolucion.estado === "REQUIERE_SELECCION") {
      conversation
        .waitSelection()
        .setContext("tipoSeleccion", "PRODUCTO")
        .setContext("opcionesSeleccion", productResult.resolucion.opciones)
        .setContext("cantidadPendiente", parsed.cantidad);

      const saved = ConversationService.save(conversation);

      return {
        conversation: saved.toPlainObject(),
        workspace: productResult.workspace,
        intent: detection,
        response: {
          type: "SELECT_PRODUCT",
          message: this.buildProductOptionsMessage(
            productResult.resolucion.opciones,
          ),
          options: productResult.resolucion.opciones,
        },
      };
    }

    /*
     * Como cliente y producto quedaron resueltos,
     * muestra directamente el resumen para confirmar.
     */
    conversation.waitConfirmation();

    const saved = ConversationService.save(conversation);

    const updatedWorkspace = WorkspaceEngine.load(workspace.id);

    return {
      conversation: saved.toPlainObject(),
      workspace: updatedWorkspace,
      intent: detection,
      response: {
        type: "CONFIRM_OPERATION",
        message: this.buildWorkspaceSummary(updatedWorkspace),
      },
    };
  }
}

module.exports = new ConversationEngine();
