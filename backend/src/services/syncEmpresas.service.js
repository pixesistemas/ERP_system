const db = require("../db/database");

/*
 * Sincronización entre empresas conectadas (se administra desde superadmin).
 *
 * Cuando dos empresas están conectadas, los cambios de catálogo y clientes
 * se replican en la otra: productos (alta, edición, baja y precios), rubros,
 * marcas, subrubros y clientes.
 *
 * Los productos se vinculan por código; los clientes por CUIT o DNI; los
 * rubros por nombre (tabla rubros_productos) y las marcas/subrubros por
 * nombre dentro de los catálogos de la empresa (afip_catalogs_v34).
 */

function conectadasDe(empresaId) {
  return db
    .prepare("SELECT conectada_id id FROM empresas_conectadas WHERE empresa_id=?")
    .all(Number(empresaId))
    .map((r) => Number(r.id));
}

function leerCatalogos(empresaId) {
  const row = db
    .prepare("SELECT valor_json FROM app_state WHERE empresa_id=? AND clave='afip_catalogs_v34'")
    .get(Number(empresaId));
  try {
    const valor = JSON.parse(row?.valor_json || "[]");
    return Array.isArray(valor) ? valor : [];
  } catch (error) {
    return [];
  }
}

function guardarCatalogos(empresaId, lista) {
  db.prepare(
    `INSERT INTO app_state(empresa_id,clave,valor_json,updated_at) VALUES(?,'afip_catalogs_v34',?,CURRENT_TIMESTAMP)
     ON CONFLICT(empresa_id,clave) DO UPDATE SET valor_json=excluded.valor_json,updated_at=CURRENT_TIMESTAMP`,
  ).run(Number(empresaId), JSON.stringify(lista));
}

function siguienteIdCatalogo(lista) {
  const max = lista.reduce((n, c) => Math.max(n, Number(c.id) || 0), 0);
  return max > 0 ? max + 1 : Date.now();
}

function idCatalogoEnLista(lista, tipo, nombre, rubroId = null) {
  const t = String(tipo || "").toUpperCase();
  const nom = String(nombre || "").trim();
  if (!nom) return null;
  let item = lista.find(
    (c) => String(c.tipo || "").toUpperCase() === t && String(c.nombre || "").trim().toLowerCase() === nom.toLowerCase(),
  );
  if (!item) {
    item = { id: siguienteIdCatalogo(lista), tipo: t, nombre: nom };
    if (t !== "RUBRO") item.rubroId = rubroId || null;
    lista.push(item);
  } else if (t !== "RUBRO" && String(item.rubroId || "") !== String(rubroId || "")) {
    item.rubroId = rubroId || null;
  }
  return item.id;
}

function asegurarRubro(empresaId, nombre) {
  const nom = String(nombre || "").trim();
  if (!nom) return null;
  const row = db
    .prepare("SELECT id FROM rubros_productos WHERE empresa_id=? AND nombre=? COLLATE NOCASE")
    .get(Number(empresaId), nom);
  if (row) return Number(row.id);
  return Number(
    db.prepare("INSERT INTO rubros_productos(empresa_id,nombre,activo) VALUES(?,?,1)").run(Number(empresaId), nom)
      .lastInsertRowid,
  );
}

function propagarProducto(empresaId, productoId, accion = "UPSERT") {
  const e = Number(empresaId);
  const producto = db.prepare("SELECT * FROM productos WHERE id=? AND empresa_id=?").get(Number(productoId), e);
  if (!producto) return;
  const destinos = conectadasDe(e);
  if (!destinos.length) return;

  const rubroNombre = producto.rubro_id
    ? db.prepare("SELECT nombre FROM rubros_productos WHERE id=? AND empresa_id=?").get(producto.rubro_id, e)?.nombre
    : null;
  const catalogsOrigen = leerCatalogos(e);
  const marca = catalogsOrigen.find(
    (c) => String(c.tipo || "").toUpperCase() === "MARCA" && String(c.id) === String(producto.marca_id),
  );
  const subrubro = catalogsOrigen.find(
    (c) => String(c.tipo || "").toUpperCase() === "SUBRUBRO" && String(c.id) === String(producto.subrubro_id),
  );
  const rubroPadre = subrubro
    ? catalogsOrigen.find(
        (c) => String(c.tipo || "").toUpperCase() === "RUBRO" && String(c.id) === String(subrubro.rubroId),
      )
    : null;

  for (const destino of destinos) {
    const existente = db
      .prepare("SELECT id FROM productos WHERE empresa_id=? AND codigo=?")
      .get(destino, producto.codigo);

    if (accion === "DELETE") {
      if (existente) {
        db.prepare("UPDATE productos SET activo=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(existente.id);
      }
      continue;
    }

    const rubroId = asegurarRubro(destino, rubroNombre);
    const catalogosDestino = leerCatalogos(destino);
    const antes = JSON.stringify(catalogosDestino);
    let marcaId = null;
    if (marca) marcaId = idCatalogoEnLista(catalogosDestino, "MARCA", marca.nombre, null);
    let subrubroId = null;
    if (subrubro) {
      const rubroPadreDestino = rubroPadre
        ? idCatalogoEnLista(catalogosDestino, "RUBRO", rubroPadre.nombre, null)
        : null;
      subrubroId = idCatalogoEnLista(catalogosDestino, "SUBRUBRO", subrubro.nombre, rubroPadreDestino);
    }
    if (JSON.stringify(catalogosDestino) !== antes) guardarCatalogos(destino, catalogosDestino);

    if (existente) {
      db.prepare(
        `UPDATE productos SET codigo_barra=?,descripcion=?,precio=?,iva=?,unidad=?,activo=?,costo=?,utilidad=?,
         rubro_id=?,subrubro_id=?,marca_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      ).run(
        producto.codigo_barra || null,
        producto.descripcion,
        producto.precio,
        producto.iva,
        producto.unidad,
        producto.activo,
        producto.costo,
        producto.utilidad,
        rubroId,
        subrubroId,
        marcaId,
        existente.id,
      );
    } else {
      db.prepare(
        `INSERT INTO productos(empresa_id,codigo,codigo_barra,descripcion,precio,iva,unidad,activo,costo,utilidad,
         rubro_id,subrubro_id,marca_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
      ).run(
        destino,
        producto.codigo,
        producto.codigo_barra || null,
        producto.descripcion,
        producto.precio,
        producto.iva,
        producto.unidad,
        producto.activo,
        producto.costo,
        producto.utilidad,
        rubroId,
        subrubroId,
        marcaId,
      );
    }
  }
}

function propagarProductoPorCodigo(empresaId, codigo) {
  const row = db
    .prepare("SELECT id FROM productos WHERE empresa_id=? AND codigo=?")
    .get(Number(empresaId), String(codigo || ""));
  if (row) propagarProducto(empresaId, row.id);
}

function propagarPrecios(empresaId, productoIds = []) {
  for (const id of productoIds) propagarProducto(empresaId, id);
}

function propagarCliente(empresaId, clienteId, accion = "UPSERT") {
  const e = Number(empresaId);
  const cliente = db.prepare("SELECT * FROM clientes WHERE id=? AND empresa_id=?").get(Number(clienteId), e);
  if (!cliente) return;
  const destinos = conectadasDe(e);
  if (!destinos.length) return;

  for (const destino of destinos) {
    const match = cliente.cuit
      ? db.prepare("SELECT id FROM clientes WHERE empresa_id=? AND cuit=?").get(destino, cliente.cuit)
      : cliente.dni
        ? db.prepare("SELECT id FROM clientes WHERE empresa_id=? AND dni=?").get(destino, cliente.dni)
        : null;

    if (accion === "DELETE") {
      if (match) db.prepare("DELETE FROM clientes WHERE id=?").run(match.id);
      continue;
    }

    if (match) {
      db.prepare(
        `UPDATE clientes SET razon_social=?,condicion_iva=?,domicilio=?,localidad=?,provincia=?,email=?,telefono=?,
         descuento_porcentaje=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      ).run(
        cliente.razon_social,
        cliente.condicion_iva,
        cliente.domicilio,
        cliente.localidad,
        cliente.provincia,
        cliente.email,
        cliente.telefono,
        cliente.descuento_porcentaje || 0,
        match.id,
      );
    } else {
      db.prepare(
        `INSERT INTO clientes(empresa_id,razon_social,cuit,dni,condicion_iva,domicilio,localidad,provincia,email,telefono,descuento_porcentaje,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
      ).run(
        destino,
        cliente.razon_social,
        cliente.cuit,
        cliente.dni,
        cliente.condicion_iva,
        cliente.domicilio,
        cliente.localidad,
        cliente.provincia,
        cliente.email,
        cliente.telefono,
        cliente.descuento_porcentaje || 0,
      );
    }
  }
}

/* Replica rubros, subrubros y marcas creados o renombrados en los catálogos. */
function sincronizarCatalogos(empresaId, catalogs) {
  const origen = Array.isArray(catalogs) ? catalogs : [];
  if (!origen.length) return;
  for (const destino of conectadasDe(empresaId)) {
    const lista = leerCatalogos(destino);
    const antes = JSON.stringify(lista);
    for (const it of origen) {
      const tipo = String(it.tipo || "").toUpperCase();
      if (!["RUBRO", "SUBRUBRO", "MARCA"].includes(tipo)) continue;
      const nombre = String(it.nombre || "").trim();
      if (!nombre) continue;

      let existente = lista.find(
        (c) => String(c.id) === String(it.id) && String(c.tipo || "").toUpperCase() === tipo,
      );
      if (!existente) {
        existente = lista.find(
          (c) =>
            String(c.tipo || "").toUpperCase() === tipo &&
            String(c.nombre || "").trim().toLowerCase() === nombre.toLowerCase(),
        );
      }

      let rubroId = null;
      if (tipo !== "RUBRO" && it.rubroId != null) {
        const padre = origen.find(
          (c) => String(c.id) === String(it.rubroId) && String(c.tipo || "").toUpperCase() === "RUBRO",
        );
        if (padre) rubroId = idCatalogoEnLista(lista, "RUBRO", padre.nombre, null);
      }

      if (existente) {
        existente.nombre = nombre;
        if (tipo !== "RUBRO") existente.rubroId = rubroId;
      } else {
        const idOcupado = lista.some((c) => String(c.id) === String(it.id));
        const id = idOcupado ? siguienteIdCatalogo(lista) : Number(it.id) || siguienteIdCatalogo(lista);
        const nuevo = { id, tipo, nombre };
        if (tipo !== "RUBRO") nuevo.rubroId = rubroId;
        lista.push(nuevo);
      }
    }
    if (JSON.stringify(lista) !== antes) guardarCatalogos(destino, lista);
  }
}

module.exports = {
  conectadasDe,
  propagarProducto,
  propagarProductoPorCodigo,
  propagarPrecios,
  propagarCliente,
  sincronizarCatalogos,
};
