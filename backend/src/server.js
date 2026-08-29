require("dotenv").config();
process.env.TZ = process.env.TZ || "America/Argentina/Buenos_Aires";
const app = require("./app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
