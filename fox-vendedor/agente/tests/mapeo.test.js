const assert = require("assert");
const { mapearArticulo, mapearPresupuestoAFox } = require("../mapeo");

const articulo = mapearArticulo({
  idart: 5,
  codprove: "  ",
  codfabri: "103       ",
  descrip: "  KONGO PERRO ADULTO  ",
  detalle: " BOLSA ",
  unidad: "UNIDAD   ",
  stock: 0,
  iva: 21,
  pfinal1: 36800,
  pfinal2: 36000,
  pfinal3: 0,
  pfinal4: 0,
  idrubro: 1,
  idmarca: 2,
  codbarra: "",
  fultact: "07/04/2026",
});
assert.strictEqual(articulo.codigo, "103");
assert.strictEqual(articulo.descripcion, "KONGO PERRO ADULTO");
assert.strictEqual(articulo.detalle, "BOLSA");
assert.strictEqual(articulo.iva, 21);
assert.strictEqual(articulo.pfinal2, 36000);

const { compro, items } = mapearPresupuestoAFox(
  {
    cliente: "  Autoservicio Norte ",
    observaciones: "Entregar por la tarde",
    items: [
      { idart: 1, codigo: "A001", descripcion: "Yerba 1 kg", cantidad: 1, puni: 1210, iva: 21, idrubro: 3, unidad: "UN" },
      { idart: 4, codigo: "102", descripcion: "Nutribon", cantidad: 1, puni: 2400, iva: 0, idrubro: 1, unidad: "UN" },
    ],
  },
  { pv: 2, letra: "P", tipo: "PRESUPUESTO", tipodoc: "99", idvendedor: 7 },
);

assert.strictEqual(compro.compro, "PRESUPUESTO");
assert.strictEqual(compro.letra, "P");
assert.strictEqual(compro.pv, 2);
assert.strictEqual(compro.apnom, "AUTOSERVICIO NORTE");
assert.strictEqual(compro.varios, "Entregar por la tarde");
assert.strictEqual(compro.neto, 1000);
assert.strictEqual(compro.subtotal, 3400);
assert.strictEqual(compro.iva21, 210);
assert.strictEqual(compro.total, 3610);
assert.strictEqual(compro.importe, 3610);
assert.strictEqual(compro.sub21, 1000);
assert.strictEqual(compro.nogravado, 2400);
assert.strictEqual(compro.idvendedor, 7);
assert.match(compro.fecha, /^\d{2}\/\d{2}\/\d{4}$/);
assert.strictEqual(items.length, 2);
assert.strictEqual(items[0].ptotal, 1210);
assert.strictEqual(items[0].neto, 1000);
assert.strictEqual(items[0].iva21, 210);
assert.strictEqual(items[0].subtotal, 1210);
assert.strictEqual(items[0].subtotal21, 1000);
assert.strictEqual(items[1].ptotal, 2400);
assert.strictEqual(items[1].neto, 0);
assert.strictEqual(items[1].subtotal, 2400);
assert.strictEqual(items[1].nogravado, 2400);

console.log("OK agente: mapeo de artículos y presupuestos a compro/detcompro.");
