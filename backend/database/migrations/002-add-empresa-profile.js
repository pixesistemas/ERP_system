const db = require("../../src/db/database");

function addColumn(table, name, sql) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((c) => c.name === name);

  if (!exists) {
    db.exec(sql);
    console.log(`Columna agregada: ${table}.${name}`);
  } else {
    console.log(`Columna ya existe: ${table}.${name}`);
  }
}

addColumn(
  "empresas",
  "razon_social",
  "ALTER TABLE empresas ADD COLUMN razon_social TEXT",
);
addColumn(
  "empresas",
  "nombre_fantasia",
  "ALTER TABLE empresas ADD COLUMN nombre_fantasia TEXT",
);
addColumn(
  "empresas",
  "direccion",
  "ALTER TABLE empresas ADD COLUMN direccion TEXT",
);
addColumn(
  "empresas",
  "localidad",
  "ALTER TABLE empresas ADD COLUMN localidad TEXT",
);
addColumn(
  "empresas",
  "provincia",
  "ALTER TABLE empresas ADD COLUMN provincia TEXT",
);
addColumn(
  "empresas",
  "codigo_postal",
  "ALTER TABLE empresas ADD COLUMN codigo_postal TEXT",
);
addColumn(
  "empresas",
  "telefono",
  "ALTER TABLE empresas ADD COLUMN telefono TEXT",
);
addColumn(
  "empresas",
  "whatsapp",
  "ALTER TABLE empresas ADD COLUMN whatsapp TEXT",
);
addColumn("empresas", "email", "ALTER TABLE empresas ADD COLUMN email TEXT");
addColumn("empresas", "web", "ALTER TABLE empresas ADD COLUMN web TEXT");
addColumn(
  "empresas",
  "ingresos_brutos",
  "ALTER TABLE empresas ADD COLUMN ingresos_brutos TEXT",
);
addColumn(
  "empresas",
  "inicio_actividad",
  "ALTER TABLE empresas ADD COLUMN inicio_actividad TEXT",
);
addColumn("empresas", "logo", "ALTER TABLE empresas ADD COLUMN logo TEXT");
addColumn(
  "empresas",
  "pie_factura",
  "ALTER TABLE empresas ADD COLUMN pie_factura TEXT",
);
addColumn(
  "empresas",
  "observaciones",
  "ALTER TABLE empresas ADD COLUMN observaciones TEXT",
);

console.log("Migración empresa profile finalizada");
