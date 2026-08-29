require("dotenv").config();

const db = require("../../src/db/database");

db.prepare(
  `
  UPDATE empresas SET
    razon_social = @razon_social,
    nombre_fantasia = @nombre_fantasia,
    direccion = @direccion,
    localidad = @localidad,
    provincia = @provincia,
    codigo_postal = @codigo_postal,
    telefono = @telefono,
    whatsapp = @whatsapp,
    email = @email,
    web = @web,
    ingresos_brutos = @ingresos_brutos,
    inicio_actividad = @inicio_actividad,
    logo = @logo,
    pie_factura = @pie_factura,
    observaciones = @observaciones
  WHERE nombre = @nombre
`,
).run({
  nombre: "empresa1",
  razon_social: "Empresa S.R.L",
  nombre_fantasia: "Empresa S.R.L",
  direccion: "MONS. TAVELLA 0000 - (3200) CONCORDIA - ENTRE RIOS",
  localidad: "CONCORDIA",
  provincia: "ENTRE RIOS",
  codigo_postal: "3200",
  telefono: "(0345) 421-0000",
  whatsapp: "3454000000",
  email: "mail@hotmail.com",
  web: "",
  ingresos_brutos: "30705552548",
  inicio_actividad: "01/04/2025",
  logo: "logo.png",
  pie_factura: "",
  observaciones: "",
});

console.log("Perfil de empresa actualizado");
