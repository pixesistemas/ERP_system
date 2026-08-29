const States = require("../core/conversation/conversationStates");

/*
 * Conversation
 *
 * Representa una conversación comercial activa.
 * No conoce HTTP, Express ni SQLite.
 */
class Conversation {
  /*
   * Inicializa una conversación nueva o recuperada de la base.
   */
  constructor(data = {}) {
    this.id = data.id || null;
    this.empresaId = data.empresaId || null;
    this.telefono = data.telefono || null;
    this.canal = data.canal || "API";
    this.estado = data.estado || States.IDLE;
    this.workspaceId = data.workspaceId || null;
    this.sessionId = data.sessionId || null;

    this.contexto =
      data.contexto && typeof data.contexto === "object" ? data.contexto : {};
  }

  /*
   * Devuelve el estado actual.
   */
  getState() {
    return this.estado;
  }

  /*
   * Cambia el estado de la conversación.
   */
  changeState(state) {
    if (!state) {
      throw new Error("Debe informar el estado de la conversación");
    }

    this.estado = state;
    return this;
  }

  /*
   * Guarda un dato dentro del contexto.
   */
  setContext(key, value) {
    if (!key) {
      throw new Error("Debe informar una clave de contexto");
    }

    this.contexto[key] = value;
    return this;
  }

  /*
   * Recupera un dato del contexto.
   */
  getContext(key) {
    return this.contexto[key];
  }

  /*
   * Elimina un dato del contexto.
   */
  removeContext(key) {
    delete this.contexto[key];
    return this;
  }

  /*
   * Asocia un workspace activo.
   */
  setWorkspace(workspaceId) {
    this.workspaceId = workspaceId || null;
    return this;
  }

  /*
   * Asocia una sesión comercial.
   */
  setSession(sessionId) {
    this.sessionId = sessionId || null;
    return this;
  }

  /*
   * Deja la conversación esperando una operación.
   */
  waitOperation() {
    return this.changeState(States.WAITING_OPERATION);
  }

  /*
   * Deja la conversación esperando un cliente.
   */
  waitCustomer() {
    return this.changeState(States.WAITING_CUSTOMER);
  }

  /*
   * Deja la conversación esperando un producto.
   */
  waitProduct() {
    return this.changeState(States.WAITING_PRODUCT);
  }

  /*
   * Deja la conversación esperando una cantidad.
   */
  waitQuantity() {
    return this.changeState(States.WAITING_QUANTITY);
  }

  /*
   * Deja la conversación esperando que el usuario elija una opción.
   */
  waitSelection() {
    return this.changeState(States.WAITING_SELECTION);
  }

  /*
   * Deja la conversación esperando confirmación.
   */
  waitConfirmation() {
    return this.changeState(States.WAITING_CONFIRMATION);
  }

  /*
   * Marca la conversación como en procesamiento.
   */
  startProcessing() {
    return this.changeState(States.PROCESSING);
  }

  /*
   * Finaliza correctamente la conversación.
   */
  finish() {
    return this.changeState(States.FINISHED);
  }

  /*
   * Cancela la conversación.
   */
  cancel() {
    return this.changeState(States.CANCELLED);
  }

  /*
   * Indica si la conversación continúa activa.
   */
  isActive() {
    return ![States.FINISHED, States.CANCELLED].includes(this.estado);
  }

  /*
   * Convierte la conversación a un objeto simple.
   */
  toPlainObject() {
    return {
      id: this.id,
      empresaId: this.empresaId,
      telefono: this.telefono,
      canal: this.canal,
      estado: this.estado,
      workspaceId: this.workspaceId,
      sessionId: this.sessionId,
      contexto: this.contexto,
    };
  }
  /*
   * Vuelve la conversación al estado indicado
   * y elimina los datos temporales de selección.
   */
  clearSelection(nextState) {
    this.removeContext("tipoSeleccion");
    this.removeContext("opcionesSeleccion");

    return this.changeState(nextState);
  }
}

module.exports = Conversation;
