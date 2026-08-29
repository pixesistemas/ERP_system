require("dotenv").config();

const { AFIPClient } = require("../src/afip");

async function main() {
  const afip = await AFIPClient.create(empresa);

  const cuits = [33711540879, 33707509029, 20312113385];

  for (const cuit of cuits) {
    try {
      console.log("Consultando:", cuit);

      const persona = await afip.padron.getPersona(cuit);

      console.dir(persona, { depth: null });
    } catch (err) {
      console.log("No encontrado o error:", cuit);
      console.log(err.message);
    }
  }
}

main().catch(console.error);
