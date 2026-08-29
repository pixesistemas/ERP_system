class ProcessEngine {
  constructor() {
    this.processes = new Map();
  }

  register(name, handler) {
    if (!name || typeof handler !== "function") {
      throw new Error("Proceso inválido");
    }

    this.processes.set(name, handler);
  }

  async execute(name, payload = {}) {
    const handler = this.processes.get(name);

    if (!handler) {
      const error = new Error(`Proceso no registrado: ${name}`);
      error.statusCode = 400;
      throw error;
    }

    return await handler(payload);
  }

  list() {
    return Array.from(this.processes.keys());
  }
}

module.exports = new ProcessEngine();
