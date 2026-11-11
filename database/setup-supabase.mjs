// SIGI - Configura el proyecto de Supabase vía Management API:
//   1. aplica database/migrations/*.sql y database/seeders/*.sql (una sola vez cada uno)
//   2. obtiene URL y claves del proyecto y escribe .env (conserva valores existentes)
//
// Uso:
//   SUPABASE_ACCESS_TOKEN=sbp_... node database/setup-supabase.mjs [project-ref]
// El token se crea en https://supabase.com/dashboard/account/tokens y NO se guarda.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) salir('Defina SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens).');

const API = 'https://api.supabase.com/v1';
async function api(ruta, opciones = {}) {
  const res = await fetch(API + ruta, {
    ...opciones,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opciones.headers },
  });
  const cuerpo = await res.text();
  if (!res.ok) throw new Error(`${opciones.method || 'GET'} ${ruta} -> ${res.status}: ${cuerpo}`);
  return cuerpo ? JSON.parse(cuerpo) : null;
}
const sql = (ref, query) => api(`/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });

// ---- 1. Proyecto ----
const proyectos = await api('/projects');
let ref = process.argv[2];
if (!ref) {
  if (proyectos.length !== 1) {
    console.log('Proyectos disponibles:');
    for (const p of proyectos) console.log(`  ${p.id}  ${p.name}  (${p.region}, ${p.status})`);
    salir('Indique el project-ref como argumento.');
  }
  ref = proyectos[0].id;
}
const proyecto = proyectos.find((p) => p.id === ref) || salir(`No existe el proyecto ${ref}`);
console.log(`Proyecto: ${proyecto.name} (${ref}) - ${proyecto.status}`);

// ---- 2. Migraciones y seeders ----
await sql(ref, `create table if not exists public._sigi_migraciones (
  archivo text primary key, aplicada_en timestamptz not null default now());
  alter table public._sigi_migraciones enable row level security;`);
const aplicadas = new Set((await sql(ref, 'select archivo from public._sigi_migraciones')).map((f) => f.archivo));

for (const carpeta of ['migrations', 'seeders']) {
  const dir = path.join(raiz, 'database', carpeta);
  for (const archivo of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const clave = `${carpeta}/${archivo}`;
    if (aplicadas.has(clave)) { console.log(`  = ${clave} (ya aplicada)`); continue; }
    const contenido = fs.readFileSync(path.join(dir, archivo), 'utf8');
    // Cada archivo en una transacción: o se aplica completo o nada.
    await sql(ref, `begin;\n${contenido}\ninsert into public._sigi_migraciones(archivo) values ('${clave}');\ncommit;`);
    console.log(`  + ${clave}`);
  }
}

// ---- 3. Claves y .env ----
const claves = await api(`/projects/${ref}/api-keys?reveal=true`);
const buscar = (nombre, tipo) =>
  claves.find((k) => k.name === nombre && k.api_key)?.api_key ||
  claves.find((k) => k.type === tipo && k.api_key)?.api_key; // claves nuevas sb_publishable_/sb_secret_
const anon = buscar('anon', 'publishable');
const service = buscar('service_role', 'secret');
if (!anon || !service) salir('No se pudieron obtener las claves anon/service_role.');

const rutaEnv = path.join(raiz, '.env');
const base = fs.existsSync(rutaEnv) ? fs.readFileSync(rutaEnv, 'utf8') : fs.readFileSync(path.join(raiz, '.env.example'), 'utf8');
const valores = {
  SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: service,
  SUPABASE_BUCKET: 'documentos',
};
let env = base;
for (const [k, v] of Object.entries(valores)) {
  const linea = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${k}=.*$`, 'm'), linea) : `${env.trimEnd()}\n${linea}\n`;
}
// Sin servicio de IA en esta fase: no dejar el placeholder como si fuera una clave.
env = env.replace(/^ANTHROPIC_API_KEY=sk-ant-\.\.\.$/m, 'ANTHROPIC_API_KEY=');
fs.writeFileSync(rutaEnv, env);
console.log(`.env actualizado (${rutaEnv})`);

function salir(msj) { console.error(msj); process.exit(1); }
