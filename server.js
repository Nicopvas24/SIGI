// SIGI - Punto de entrada del servidor (Express, arquitectura MVC)
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import { config } from './config/config.js';
import { rutas } from './app/routes/index.js';
import { manejadorErrores } from './app/middleware/errorHandler.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/salud', (_req, res) => res.json({ ok: true, sistema: 'SIGI', fecha: new Date().toISOString() }));
app.use('/api', rutas);

// Vistas compiladas (React) servidas desde public/
const publico = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
app.use(express.static(publico));
app.get(/^\/(?!api).*/, (_req, res, next) => {
  const indice = path.join(publico, 'index.html');
  fs.existsSync(indice) ? res.sendFile(indice) : next();
});

app.use(manejadorErrores);

app.listen(config.port, () => {
  console.log(`SIGI escuchando en http://localhost:${config.port} (demo=${config.demoMode})`);
});
