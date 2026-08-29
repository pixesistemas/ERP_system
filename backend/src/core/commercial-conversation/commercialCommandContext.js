const CommercialParser = require("../commercial-parser");

const States = require("./commercialConversationStates");

/*
 * CommercialCommandContext
 *
 * Conserva el comando comercial y los datos temporales
 * utilizados durante una conversación.
 */
class CommercialCommandContext {
  constructor({
    command = null,
    state = States.WAITING_OPERATION,
    workspaceId = null,
    customerOptions = [],
    productOptions = [],
    pendingProduct = null,
    metadata = {},
  } = {}) {
    /*
     * Reconstruye el CommercialCommand cuando recibe
     * un objeto simple proveniente de la base de datos.
     */
    this.command =
      command instanceof CommercialParser.Command
        ? command
        : new CommercialParser.Command(command || {});

    this.state = state || States.WAITING_OPERATION;

    this.workspaceId = workspaceId || null;

    this.customerOptions = Array.isArray(customerOptions)
      ? customerOptions
      : [];

    this.productOptions = Array.isArray(productOptions) ? productOptions : [];

    this.pendingProduct = pendingProduct || null;

    this.metadata = {
      ...metadata,
    };
  }

  /*
   * Crea un contexto a partir de un mensaje nuevo.
   */
  static fromMessage({ message, channel = "API" }) {
    const command = CommercialParser.Parser.parse({
      message,
      channel,
    });

    return new CommercialCommandContext({
      command,
      state: CommercialCommandContext.determineInitialState(command),
      metadata: { mensajeInicial: message },
    });
  }

  /*
   * Reconstruye el contexto desde un objeto persistido.
   */
  static fromPlainObject(value) {
    if (!value || typeof value !== "object") {
      return new CommercialCommandContext();
    }

    const context = new CommercialCommandContext({
      command: value.command,
      state: value.state,
      workspaceId: value.workspaceId,
      customerOptions: value.customerOptions,
      productOptions: value.productOptions,
      pendingProduct: value.pendingProduct,
      metadata: value.metadata,
    });

    /*
     * La validación es información derivada.
     * Se vuelve a calcular al reconstruir el contexto.
     */
    context.refreshValidation();

    return context;
  }

  /*
   * Determina qué dato debe solicitarse primero.
   */
  static determineInitialState(command) {
    if (!command.hasOperation()) {
      return States.WAITING_OPERATION;
    }

    if (command.sourceDocument) {
      return States.WAITING_CONFIRMATION;
    }

    if (!command.hasCustomer()) {
      return States.WAITING_CUSTOMER;
    }

    if (!command.hasProducts()) {
      return States.WAITING_PRODUCT;
    }

    return States.WAITING_CONFIRMATION;
  }

  /*
   * Recalcula la validación del comando.
   */
  refreshValidation() {
    this.command.validation = CommercialParser.Validator.validate(this.command);

    return this;
  }

  /*
   * Modifica el estado actual.
   */
  changeState(state) {
    this.state = state;

    return this;
  }

  /*
   * Asocia el workspace creado.
   */
  setWorkspace(workspaceId) {
    this.workspaceId = workspaceId || null;

    return this;
  }

  /*
   * Guarda opciones de clientes.
   */
  setCustomerOptions(options) {
    this.customerOptions = Array.isArray(options) ? options : [];

    this.state = States.WAITING_CUSTOMER_SELECTION;

    return this;
  }

  /*
   * Limpia opciones de clientes.
   */
  clearCustomerOptions() {
    this.customerOptions = [];

    return this;
  }

  /*
   * Guarda opciones de productos y el producto pendiente.
   */
  setProductOptions(options, pendingProduct) {
    this.productOptions = Array.isArray(options) ? options : [];

    this.pendingProduct = pendingProduct || null;

    this.state = States.WAITING_PRODUCT_SELECTION;

    return this;
  }

  /*
   * Limpia opciones de productos.
   */
  clearProductOptions() {
    this.productOptions = [];
    this.pendingProduct = null;

    return this;
  }

  /*
   * Asigna el cliente resuelto al comando.
   */
  setResolvedCustomer(customer) {
    this.command.customer = {
      id: customer?.id || customer?.idcliente || null,

      text:
        customer?.nombre ||
        customer?.apnom ||
        customer?.razon_social ||
        customer?.razonSocial ||
        customer?.descripcion ||
        customer?.text ||
        this.command.customer?.text ||
        null,
    };

    this.refreshValidation();

    return this;
  }

  /*
   * Marca un producto como resuelto.
   */
  setResolvedProduct({ productIndex, product }) {
    const current = this.command.products[productIndex];

    if (!current) {
      return this;
    }

    this.command.products[productIndex] = {
      ...current,

      id: product?.id || product?.idart || null,

      description:
        product?.descripcion || product?.descrip || current.description,

      resolved: true,
    };

    this.refreshValidation();

    return this;
  }

  /*
   * Devuelve productos todavía no resueltos.
   */
  removeProductAt(index) {
    if (Number.isInteger(index) && index >= 0) this.command.products.splice(index, 1);
    this.clearProductOptions();
    this.refreshValidation();
    return this;
  }

  setMissingProduct(productIndex, description) {
    this.pendingProduct = { productIndex, description, reason: "NOT_FOUND" };
    this.metadata.lastMissingProduct = { productIndex, description };
    return this;
  }

  clearMissingProduct() {
    this.pendingProduct = null;
    delete this.metadata.lastMissingProduct;
    return this;
  }

  getUnresolvedProducts() {
    return this.command.products
      .map((product, index) => ({
        product,
        index,
      }))
      .filter(({ product }) => !product.resolved && !product.id);
  }

  /*
   * Convierte el contexto en un objeto simple.
   */
  toPlainObject() {
    return {
      command: this.command.toPlainObject(),

      validation: this.command.validation || null,

      state: this.state,

      workspaceId: this.workspaceId,

      customerOptions: this.customerOptions.map((option) => ({
        ...option,
      })),

      productOptions: this.productOptions.map((option) => ({
        ...option,
      })),

      pendingProduct: this.pendingProduct
        ? {
            ...this.pendingProduct,
          }
        : null,

      metadata: {
        ...this.metadata,
      },
    };
  }
}

module.exports = CommercialCommandContext;
