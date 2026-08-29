const db = require("../db/database");

/*
 * Convierte una fila de la tabla clientes
 * al formato utilizado por el dominio.
 */
function mapCliente(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,

    id: row.id,

    empresaId: row.empresa_id,

    cuit: row.cuit,

    dni: row.dni,

    razonSocial: row.razon_social || row.apellido_nombre || row.nombre || null,

    apellidoNombre: row.apellido_nombre || null,

    nombre: row.nombre || null,

    condicionIVA: row.condicion_iva || row.tipo_iva || null,

    domicilio: row.domicilio || row.direccion || null,

    localidad: row.localidad,

    provincia: row.provincia,

    email: row.email,

    telefono: row.telefono,

    ultimaActualizacionPadron: row.ultima_actualizacion_padron,
    descuento: Number(row.descuento_porcentaje || 0),
  };
}

/*
 * Obtiene las columnas reales disponibles
 * en la tabla clientes.
 */
function getClienteColumns() {
  const columns = db.prepare("PRAGMA table_info(clientes)").all();

  return new Set(
    columns.map((column) =>
      String(column.name || "")
        .trim()
        .toLowerCase(),
    ),
  );
}

/*
 * Obtiene un cliente por ID.
 */
function getClienteById(id) {
  const row = db
    .prepare(
      `
      SELECT *
      FROM clientes
      WHERE id = ?
      LIMIT 1
      `,
    )
    .get(id);

  return mapCliente(row);
}

/*
 * Obtiene un cliente por CUIT.
 *
 * Cuando se informa empresaId, limita
 * la búsqueda a la empresa actual.
 */
function getClienteByCuit(cuit, empresaId = null) {
  const normalizedCuit = normalizeDocument(cuit);

  if (!normalizedCuit) {
    return null;
  }

  const normalizedCuitSql = `
    REPLACE(
      REPLACE(
        REPLACE(
          COALESCE(cuit, ''),
          '-',
          ''
        ),
        '.',
        ''
      ),
      ' ',
      ''
    )
  `;

  let row;

  if (empresaId) {
    row = db
      .prepare(
        `
        SELECT *
        FROM clientes
        WHERE empresa_id = ?
          AND ${normalizedCuitSql} = ?
        LIMIT 1
        `,
      )
      .get(empresaId, normalizedCuit);
  } else {
    row = db
      .prepare(
        `
        SELECT *
        FROM clientes
        WHERE ${normalizedCuitSql} = ?
        LIMIT 1
        `,
      )
      .get(normalizedCuit);
  }

  return mapCliente(row);
}

/*
 * Obtiene un cliente por CUIT o DNI normalizado.
 *
 * Cuando se informa empresaId, limita la búsqueda a la empresa actual.
 * Prioriza el CUIT cuando ambos documentos están presentes.
 */
function getClienteByDocumento({ cuit, dni, empresaId = null }) {
  const cuitNorm = cuit ? normalizeDocument(cuit) : null;
  const dniNorm = dni ? normalizeDocument(dni) : null;
  const column = cuitNorm ? "cuit" : dniNorm ? "dni" : null;
  if (!column) return null;
  const value = cuitNorm || dniNorm;
  const normalizedSql = `
    REPLACE(
      REPLACE(
        REPLACE(
          COALESCE(${column}, ''),
          '-',
          ''
        ),
        '.',
        ''
      ),
      ' ',
      ''
    )
  `;
  let row;
  if (empresaId) {
    row = db
      .prepare(
        `
        SELECT *
        FROM clientes
        WHERE empresa_id = ?
          AND ${normalizedSql} = ?
        LIMIT 1
        `,
      )
      .get(empresaId, value);
  } else {
    row = db
      .prepare(
        `
        SELECT *
        FROM clientes
        WHERE ${normalizedSql} = ?
        LIMIT 1
        `,
      )
      .get(value);
  }
  return mapCliente(row);
}

/*
 * Busca clientes por:
 *
 * - razón social;
 * - apellido y nombre;
 * - nombre;
 * - nombre y apellido separados;
 * - CUIT;
 * - DNI;
 * - teléfono.
 */
function buscarClientes({ empresaId, texto, limit = 10 }) {
  const value = cleanCustomerSearchText(texto);

  if (!value) {
    return [];
  }

  const columns = getClienteColumns();

  const nameSearch = `%${value}%`;

  const normalizedDocument = normalizeDocument(value);

  const documentSearch = `%${normalizedDocument}%`;

  const conditions = [];

  const params = [];

  /*
   * Busca siempre por razón social.
   */
  if (columns.has("razon_social")) {
    conditions.push("razon_social LIKE ? COLLATE NOCASE");

    params.push(nameSearch);
  }

  /*
   * Busca por apellido_nombre cuando existe.
   */
  if (columns.has("apellido_nombre")) {
    conditions.push("apellido_nombre LIKE ? COLLATE NOCASE");

    params.push(nameSearch);
  }

  /*
   * Busca por nombre individual.
   */
  if (columns.has("nombre")) {
    conditions.push("nombre LIKE ? COLLATE NOCASE");

    params.push(nameSearch);
  }

  /*
   * Busca nombre + apellido y apellido + nombre
   * cuando ambas columnas existen.
   */
  if (columns.has("nombre") && columns.has("apellido")) {
    conditions.push(
      `
      TRIM(
        COALESCE(nombre, '') ||
        ' ' ||
        COALESCE(apellido, '')
      ) LIKE ? COLLATE NOCASE
      `,
    );

    params.push(nameSearch);

    conditions.push(
      `
      TRIM(
        COALESCE(apellido, '') ||
        ' ' ||
        COALESCE(nombre, '')
      ) LIKE ? COLLATE NOCASE
      `,
    );

    params.push(nameSearch);
  }

  /*
   * Busca CUIT sin puntos, espacios o guiones.
   */
  if (columns.has("cuit")) {
    conditions.push(
      `
      REPLACE(
        REPLACE(
          REPLACE(
            COALESCE(cuit, ''),
            '-',
            ''
          ),
          '.',
          ''
        ),
        ' ',
        ''
      ) LIKE ?
      `,
    );

    params.push(documentSearch);
  }

  /*
   * Busca DNI normalizado.
   */
  if (columns.has("dni")) {
    conditions.push(
      `
      REPLACE(
        REPLACE(
          REPLACE(
            COALESCE(dni, ''),
            '-',
            ''
          ),
          '.',
          ''
        ),
        ' ',
        ''
      ) LIKE ?
      `,
    );

    params.push(documentSearch);
  }

  /*
   * Busca teléfono normalizado.
   */
  if (columns.has("telefono")) {
    conditions.push(
      `
      REPLACE(
        REPLACE(
          REPLACE(
            COALESCE(telefono, ''),
            '-',
            ''
          ),
          ' ',
          ''
        ),
        '+',
        ''
      ) LIKE ?
      `,
    );

    params.push(documentSearch);
  }

  if (conditions.length === 0) {
    return [];
  }

  const orderParts = [];

  const orderParams = [];

  /*
   * Prioriza coincidencia exacta por CUIT.
   */
  if (columns.has("cuit")) {
    orderParts.push(
      `
      WHEN REPLACE(
        REPLACE(
          REPLACE(
            COALESCE(cuit, ''),
            '-',
            ''
          ),
          '.',
          ''
        ),
        ' ',
        ''
      ) = ?
      THEN 0
      `,
    );

    orderParams.push(normalizedDocument);
  }

  /*
   * Prioriza coincidencia exacta por DNI.
   */
  if (columns.has("dni")) {
    orderParts.push(
      `
      WHEN REPLACE(
        REPLACE(
          REPLACE(
            COALESCE(dni, ''),
            '-',
            ''
          ),
          '.',
          ''
        ),
        ' ',
        ''
      ) = ?
      THEN 0
      `,
    );

    orderParams.push(normalizedDocument);
  }

  /*
   * Prioriza coincidencia exacta
   * por razón social.
   */
  if (columns.has("razon_social")) {
    orderParts.push(
      `
      WHEN UPPER(
        TRIM(
          COALESCE(razon_social, '')
        )
      ) = UPPER(?)
      THEN 1
      `,
    );

    orderParams.push(value);
  }

  const orderByName = columns.has("razon_social") ? "razon_social" : "id";

  const rows = db
    .prepare(
      `
      SELECT *
      FROM clientes
      WHERE empresa_id = ?
        AND (
          ${conditions.join("\n OR ")}
        )
      ORDER BY
        CASE
          ${orderParts.join("\n")}
          ELSE 2
        END,
        ${orderByName}
      LIMIT ?
      `,
    )
    .all(empresaId, ...params, ...orderParams, Number(limit));

  return rows.map(mapCliente);
}

/*
 * Lista clientes para ofrecer como sugerencias
 * cuando la búsqueda no produjo coincidencias.
 *
 * Excluye nombres genéricos como SIN NOMBRE.
 */
function listarClientesSugeridos({ empresaId, limit = 5 }) {
  const columns = getClienteColumns();

  const nameExpression = columns.has("razon_social")
    ? "razon_social"
    : columns.has("apellido_nombre")
      ? "apellido_nombre"
      : columns.has("nombre")
        ? "nombre"
        : "NULL";

  if (nameExpression === "NULL") {
    return [];
  }

  const rows = db
    .prepare(
      `
      SELECT *
      FROM clientes
      WHERE empresa_id = ?
        AND TRIM(
          COALESCE(
            ${nameExpression},
            ''
          )
        ) <> ''
        AND UPPER(
          TRIM(
            COALESCE(
              ${nameExpression},
              ''
            )
          )
        ) NOT IN (
          'SIN NOMBRE',
          'CLIENTE GENERICO',
          'CLIENTE GENÉRICO',
          'CONSUMIDOR FINAL',
          'VARIOS'
        )
      ORDER BY
        ${nameExpression}
      LIMIT ?
      `,
    )
    .all(empresaId, Number(limit));

  return rows.map(mapCliente);
}

const NOMBRES_GENERICOS = new Set([
  "SIN NOMBRE",
  "CONSUMIDOR FINAL",
  "CLIENTE GENERICO",
  "CLIENTE GENÉRICO",
  "VARIOS",
]);

/*
 * Considera un nombre como utilizable solo cuando no es un
 * valor genérico de relleno del sistema.
 */
function nombreUtil(value) {
  const texto = String(value || "").trim();
  if (!texto || NOMBRES_GENERICOS.has(texto.toUpperCase())) {
    return null;
  }
  return texto;
}

/*
 * Guarda o actualiza un cliente.
 */
function saveCliente(cliente) {
  const columns = getClienteColumns();

  /*
   * Deduplica por CUIT o DNI: si el documento ya pertenece a un
   * cliente de la misma empresa, completa sus datos faltantes y
   * devuelve el existente en lugar de crear un duplicado.
   */
  const existente = getClienteByDocumento({
    cuit: cliente.cuit,
    dni: cliente.dni,
    empresaId: cliente.empresaId || cliente.empresa_id || null,
  });

  if (existente) {
    const error = new Error(`Ya existe un cliente cargado con ese documento: ${existente.razonSocial} (${existente.cuit || existente.dni || "s/doc"})`);
    error.statusCode = 409;
    throw error;
  }

  const fields = [];

  const values = [];

  const params = {};

  /*
   * Agrega solamente las columnas
   * que realmente existen en la tabla.
   */
  addField({
    columns,
    fields,
    values,
    params,
    field: "empresa_id",
    parameter: "empresa_id",
    value: cliente.empresaId || cliente.empresa_id || null,
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "cuit",
    parameter: "cuit",
    value: cliente.cuit ? normalizeDocument(cliente.cuit) : null,
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "dni",
    parameter: "dni",
    value: cliente.dni ? normalizeDocument(cliente.dni) : null,
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "razon_social",
    parameter: "razon_social",
    value:
      cliente.razonSocial ||
      cliente.razon_social ||
      cliente.apellidoNombre ||
      cliente.apellido_nombre ||
      cliente.nombre ||
      "SIN NOMBRE",
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "apellido_nombre",
    parameter: "apellido_nombre",
    value:
      cliente.apellidoNombre ||
      cliente.apellido_nombre ||
      cliente.razonSocial ||
      cliente.razon_social ||
      cliente.nombre ||
      null,
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "nombre",
    parameter: "nombre",
    value: cliente.nombre || null,
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "apellido",
    parameter: "apellido",
    value: cliente.apellido || null,
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "condicion_iva",
    parameter: "condicion_iva",
    value: cliente.condicionIVA || cliente.condicion_iva || null,
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "domicilio",
    parameter: "domicilio",
    value: cliente.domicilio || cliente.direccion || null,
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "localidad",
    parameter: "localidad",
    value: cliente.localidad || null,
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "provincia",
    parameter: "provincia",
    value: cliente.provincia || null,
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "email",
    parameter: "email",
    value: cliente.email || null,
  });

  addField({
    columns,
    fields,
    values,
    params,
    field: "telefono",
    parameter: "telefono",
    value: cliente.telefono || null,
  });

  addField({
    columns, fields, values, params,
    field: "descuento_porcentaje", parameter: "descuento_porcentaje",
    value: Number(cliente.descuento ?? cliente.descuento_porcentaje ?? 0),
  });

  /*
   * Las fechas se escriben directamente
   * mediante CURRENT_TIMESTAMP.
   */
  if (columns.has("ultima_actualizacion_padron")) {
    fields.push("ultima_actualizacion_padron");

    values.push("CURRENT_TIMESTAMP");
  }

  if (columns.has("updated_at")) {
    fields.push("updated_at");

    values.push("CURRENT_TIMESTAMP");
  }

  if (fields.length === 0) {
    throw new Error("La tabla clientes no contiene columnas compatibles.");
  }

  db.prepare(
    `
    INSERT INTO clientes (
      ${fields.join(", ")}
    )
    VALUES (
      ${values.join(", ")}
    )
    `,
  ).run(params);

  if (cliente.cuit) {
    return getClienteByCuit(
      cliente.cuit,
      cliente.empresaId || cliente.empresa_id || null,
    );
  }

  return null;
}

/*
 * Agrega un campo al INSERT cuando
 * la columna existe en SQLite.
 */
function addField({
  columns,
  fields,
  values,
  params,
  field,
  parameter,
  value,
}) {
  if (!columns.has(field)) {
    return;
  }

  fields.push(field);

  values.push(`@${parameter}`);

  params[parameter] = value;
}

/*
 * Limpia frases que no pertenecen
 * al nombre del cliente.
 */
function cleanCustomerSearchText(value) {
  return String(value || "")
    .trim()
    .replace(/^(?:PARA\s+)?(?:EL\s+CLIENTE|LA\s+CLIENTE|CLIENTE)\s+/i, "")
    .replace(/^(?:RAZON\s+SOCIAL|RAZÓN\s+SOCIAL)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * Conserva solamente los dígitos.
 */
function normalizeDocument(value) {
  return String(value || "").replace(/\D/g, "");
}

/*
 * Lista clientes de una empresa para el módulo visual del ERP.
 */
function listarClientes({ empresaId, texto = "", limit = 100 }) {
  const value = String(texto || "").trim();

  if (value) {
    return buscarClientes({ empresaId, texto: value, limit });
  }

  const columns = getClienteColumns();
  const where = columns.has("empresa_id") ? "WHERE empresa_id = ?" : "";
  const params = columns.has("empresa_id") ? [empresaId, Number(limit)] : [Number(limit)];
  const orderFields = ["razon_social", "apellido_nombre", "nombre", "apellido"].filter((name) => columns.has(name));
  const orderBy = orderFields.length ? `ORDER BY COALESCE(${orderFields.join(", ")}, '')` : "ORDER BY id";

  const rows = db.prepare(`
    SELECT *
    FROM clientes
    ${where}
    ${orderBy}
    LIMIT ?
  `).all(...params);

  return rows.map(mapCliente);
}

/* Actualiza un cliente existente respetando las columnas reales de la base. */
function updateCliente(id, empresaId, cliente = {}) {
  const columns = getClienteColumns();
  const empresaScope = columns.has("empresa_id") && empresaId ? " AND empresa_id = ?" : "";
  const empresaParams = columns.has("empresa_id") && empresaId ? [empresaId] : [];

  /*
   * No permite asignar un CUIT/DNI que ya pertenece a otro cliente:
   * evita crear duplicados o pisar el documento de otro registro.
   */
  const documentoChecks = [];
  const documentoParams = [];
  const documentoColumns = ["cuit", "dni"].filter((name) => columns.has(name));
  for (const name of documentoColumns) {
    const raw = name === "cuit" ? cliente.cuit : cliente.dni;
    if (!raw) continue;
    const normalized = normalizeDocument(raw);
    if (!normalized) continue;
    documentoChecks.push(`
      REPLACE(
        REPLACE(
          REPLACE(
            COALESCE(${name}, ''),
            '-',
            ''
          ),
          '.',
          ''
        ),
        ' ',
        ''
      ) = ?
    `);
    documentoParams.push(normalized);
  }

  if (documentoChecks.length) {
    const otro = db
      .prepare(
        `
        SELECT id, razon_social
        FROM clientes
        WHERE id <> ?
          ${empresaScope}
          AND (${documentoChecks.join(" OR ")})
        LIMIT 1
        `,
      )
      .get(id, ...empresaParams, ...documentoParams);
    if (otro) {
      const error = new Error(
        `El documento ya está registrado en el cliente "${otro.razon_social || `#${otro.id}`}". Editá ese cliente o usá otro documento.`,
      );
      error.statusCode = 409;
      throw error;
    }
  }

  const mappings = {
    razon_social: cliente.razonSocial,
    apellido_nombre: cliente.razonSocial,
    cuit: cliente.cuit ? normalizeDocument(cliente.cuit) : null,
    dni: cliente.dni ? normalizeDocument(cliente.dni) : null,
    condicion_iva: cliente.condicionIVA,
    tipo_iva: cliente.condicionIVA,
    domicilio: cliente.domicilio,
    direccion: cliente.domicilio,
    telefono: cliente.telefono,
    email: cliente.email,
    localidad: cliente.localidad,
    provincia: cliente.provincia,
    descuento_porcentaje: Number(cliente.descuento ?? cliente.descuento_porcentaje ?? 0),
  };
  const sets = [];
  const params = [];
  for (const [column, value] of Object.entries(mappings)) {
    if (columns.has(column)) { sets.push(`${column} = ?`); params.push(value ?? null); }
  }
  if (columns.has("updated_at")) sets.push("updated_at = CURRENT_TIMESTAMP");
  if (!sets.length) throw new Error("La tabla clientes no contiene columnas editables");
  let sql = `UPDATE clientes SET ${sets.join(', ')} WHERE id = ?`;
  params.push(id);
  sql += empresaScope;
  params.push(...empresaParams);
  const result = db.prepare(sql).run(...params);
  if (!result.changes) { const error = new Error("Cliente no encontrado"); error.statusCode = 404; throw error; }
  return getClienteById(id);
}

/* Elimina un cliente solamente cuando no tiene referencias comerciales. */
function deleteCliente(id, empresaId) {
  const columns = getClienteColumns();
  let sql = "DELETE FROM clientes WHERE id = ?";
  const params = [id];
  if (columns.has("empresa_id")) { sql += " AND empresa_id = ?"; params.push(empresaId); }
  const result = db.prepare(sql).run(...params);
  if (!result.changes) { const error = new Error("Cliente no encontrado o asociado a movimientos"); error.statusCode = 409; throw error; }
  return true;
}

module.exports = {
  getClienteByCuit,
  getClienteByDocumento,
  getClienteById,
  saveCliente,
  buscarClientes,
  listarClientesSugeridos,
  listarClientes,
  updateCliente,
  deleteCliente,
};
