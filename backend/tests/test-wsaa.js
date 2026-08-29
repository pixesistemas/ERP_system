require("dotenv").config();

const { AFIPClient } = require("../src/afip");

async function main() {
  const afip = await AFIPClient.create(empresa);

  const auth = await afip.login("wsfe");

  console.log("LOGIN OK");
  console.log("CUIT:", auth.cuit);
  console.log("TOKEN:", auth.token.substring(0, 80));
  console.log("SIGN:", auth.sign.substring(0, 80));
  console.log("VENCE:", auth.expirationTime);
}

main().catch(console.error);
