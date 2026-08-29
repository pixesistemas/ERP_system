const db = require("../db/database");

/*
 * CuentaCorrienteService
 *
 * Reutiliza la misma lógica FIFO que muestra la pantalla Cuentas clientes:
 * los débitos se van pagando con los créditos según el orden de los
 * movimientos y lo que queda sin pagar se clasifica como VENCIDO (>30 días)
 * o A VENCER.
 */
class CuentaCorrienteService {
  estadoCuentaCliente({ empresaId, cuit, dni }) {
    const doc = String(cuit || dni || "").trim();

    if (!doc) return null;

    const movs = db
      .prepare(
        `SELECT * FROM cliente_cc_movimientos
         WHERE empresa_id=? AND cliente_doc=?
         ORDER BY created_at, id`,
      )
      .all(empresaId, doc);

    if (!movs.length) return null;

    const hoy = Date.now();
    const pendientes = [];
    let credito = 0;

    const consumir = (importe) => {
      let rest = importe;
      while (rest > 0.004 && pendientes.length) {
        const p = pendientes[0];
        const aplicar = Math.min(rest, p.importe);
        p.importe -= aplicar;
        rest -= aplicar;
        if (p.importe < 0.004) pendientes.shift();
      }
      return rest;
    };

    for (const m of movs) {
      const debe = Number(m.debe || 0);
      const haber = Number(m.haber || 0);
      if (debe > 0) {
        pendientes.push({
          importe: debe,
          dias: (hoy - new Date(m.created_at || m.fecha).getTime()) / 86400000,
        });
        if (credito > 0.004) credito = consumir(credito);
      }
      if (haber > 0) {
        credito += haber;
        credito = consumir(credito);
      }
    }

    let vencido = 0;
    let aVencer = 0;
    for (const p of pendientes) {
      if (p.dias > 30) vencido += p.importe;
      else aVencer += p.importe;
    }

    return {
      saldo: pendientes.reduce((n, p) => n + p.importe, 0),
      vencido,
      aVencer,
      hayMovimientos: true,
    };
  }

  money(value) {
    return Number(value || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  renderBlock({ empresaId, cuit, dni }) {
    const estado = this.estadoCuentaCliente({ empresaId, cuit, dni });

    if (!estado) return "";

    const vencidoClase = estado.vencido > 0 ? " cc-vencido" : "";
    const { saldo, vencido, aVencer } = estado;

    return `
      <div class="cc-saldo-block">
        <div class="cc-line">
          <span>SALDO ACTUAL</span>
          <strong>$ ${this.money(saldo)}</strong>
        </div>
        <div class="cc-line${vencidoClase}">
          <span>Saldos vencidos (&gt;30 días):</span>
          <em>$ ${this.money(vencido)}</em>
        </div>
        <div class="cc-line">
          <span>Saldo a vencer:</span>
          <em>$ ${this.money(aVencer)}</em>
        </div>
      </div>
    `;
  }
}

module.exports = new CuentaCorrienteService();
