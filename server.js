// server.js
import app from "./src/app.js";
import { config } from "dotenv";

config();

const PORT = process.env.PORT || 4001;

app.listen(PORT, () => {
  console.log(`🚀 ERP Botillería backend escuchando en puerto ${PORT}`);
});
