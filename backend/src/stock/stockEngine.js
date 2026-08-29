const {
  getDepositoPrincipal,
  getStock,
  getReservadoProducto,
  moverStock,
} = require("../repositories/stock.repository");

const CompanySettings = require("../repositories/companySettings.repository");

const {
  crearReserva,
  cancelarReserva,
  consumirReserva,
} = require("../repositories/stockReserva.repository");

class StockEngine {
  getDepositoPrincipal(empresaId) {
    const deposito = getDepositoPrincipal(empresaId);

    if (!deposito) {
      const error = new Error("No existe depósito principal");
      error.statusCode = 400;
      throw error;
    }

    return deposito;
  }

  getDisponible({ empresaId, depositoId, productoId }) {
    const stock = getStock({
      empresaId,
      depositoId,
      productoId,
    });

    const fisico = Number(stock?.cantidad || 0);

    const reservado = getReservadoProducto({
      empresaId,
      depositoId,
      productoId,
    });

    return {
      fisico,
      reservado,
      disponible: fisico - reservado,
    };
  }

  validateAvailable({ empresaId, depositoId, items }) {
    const errores = [];

    for (const item of items) {
      if (!item.productoId) continue;

      const stock = this.getDisponible({
        empresaId,
        depositoId,
        productoId: item.productoId,
      });

      if (stock.disponible < Number(item.cantidad || 0)) {
        errores.push({
          productoId: item.productoId,
          descripcion: item.descripcion,
          solicitado: Number(item.cantidad || 0),
          disponible: stock.disponible,
        });
      }
    }

    if (errores.length) {
      const settings = CompanySettings.getSettings(empresaId);
      if (settings.stockPolicy === "IGNORE") return { ok: true, warnings: errores, allowed: true };
      const lines = errores.map((item) => `${item.descripcion || `Producto #${item.productoId}`}: solicitado ${item.solicitado}, disponible ${item.disponible}`);
      const error = new Error(settings.stockPolicy === "WARN" ? "Stock insuficiente. La empresa permite continuar con autorización" : "Stock insuficiente");
      error.statusCode = settings.stockPolicy === "WARN" ? 409 : 400;
      error.code = settings.stockPolicy === "WARN" ? "STOCK_CONFIRMATION_REQUIRED" : "STOCK_BLOCKED";
      error.details = lines;
      error.stock = errores;
      throw error;
    }
    return { ok: true, warnings: [], allowed: true };
  }

  consume({
    empresaId,
    depositoId,
    items,
    documentoTipo,
    documentoId,
    usuarioId,
  }) {
    for (const item of items) {
      if (!item.productoId) continue;

      moverStock({
        empresaId,
        depositoId,
        productoId: item.productoId,
        tipo: "SALIDA",
        cantidad: item.cantidad,
        motivo: `Salida por ${documentoTipo}`,
        documentoTipo,
        documentoId,
        usuarioId,
      });
    }
  }

  reserve({
    empresaId,
    depositoId,
    items,
    documentoTipo,
    documentoId,
    usuarioId,
  }) {
    const reservas = [];

    for (const item of items) {
      if (!item.productoId) continue;

      const reserva = crearReserva({
        empresaId,
        depositoId,
        productoId: item.productoId,
        cantidad: item.cantidad,
        documentoTipo,
        documentoId,
        observaciones: `Reserva por ${documentoTipo}`,
        usuarioId,
      });

      reservas.push(reserva);
    }

    return reservas;
  }

  cancelReservation({ empresaId, reservaId }) {
    return cancelarReserva({
      reservaId,
      empresaId,
    });
  }

  consumeReservation({ empresaId, reservaId }) {
    return consumirReserva({
      reservaId,
      empresaId,
    });
  }
}

module.exports = new StockEngine();
