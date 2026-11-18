// Limpia los datos de operación de SIGI para empezar con datos de prueba nuevos.
// Borra: incapacidades y todo lo que depende de ellas (soportes, recepciones, reemplazos,
// formatos, gestiones, evidencias, procesos jurídicos, conceptos), pagos, conciliaciones,
// notificaciones, bitácora y los archivos del bucket.
// Conserva: usuarios, colaboradores, entidades y las cuentas de acceso.
//
// Antes de borrar guarda un respaldo en database/respaldos/. Sin --confirmar solo hace el respaldo.
//   node database/limpiar-datos.mjs              -> solo respaldo y conteo
//   node database/limpiar-datos.mjs --confirmar  -> respaldo y limpieza
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUCKET = process.env.SUPABASE_BUCKET || 'documentos';
const confirmar = process.argv.includes('--confirmar');

const TABLAS = [
  'incapacidades', 'documentos_soporte', 'recepciones', 'reemplazos', 'formatos_seguimiento', 'gestiones', 'evidencias',
  'procesos_juridicos', 'conceptos_rehabilitacion', 'pagos', 'conciliaciones', 'notificaciones', 'bitacora',
];

async function todo(tabla) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(tabla).select('*').range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...data);
    if (data.length < 1000) return filas;
  }
}

async function archivosDelBucket(prefijo = '') {
  const { data, error } = await sb.storage.from(BUCKET).list(prefijo, { limit: 1000 });
  if (error) throw new Error(`bucket: ${error.message}`);
  const rutas = [];
  for (const item of data) {
    const ruta = prefijo ? `${prefijo}/${item.name}` : item.name;
    if (item.id) rutas.push(ruta); else rutas.push(...await archivosDelBucket(ruta)); // sin id = carpeta
  }
  return rutas;
}

// ---- 1. Respaldo ----
const respaldo = { fecha: new Date().toISOString(), tablas: {}, archivos: [] };
for (const t of TABLAS) respaldo.tablas[t] = await todo(t);
respaldo.archivos = await archivosDelBucket();
const dir = path.join(raiz, 'database', 'respaldos');
fs.mkdirSync(dir, { recursive: true });
const archivo = path.join(dir, `respaldo-${respaldo.fecha.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2));
console.log(`Respaldo: ${archivo}`);
for (const t of TABLAS) console.log(`  ${t.padEnd(26)} ${respaldo.tablas[t].length}`);
console.log(`  ${'archivos del bucket'.padEnd(26)} ${respaldo.archivos.length}`);

if (!confirmar) {
  console.log('\nNo se borró nada. Para limpiar, ejecute de nuevo con --confirmar');
  process.exit(0);
}

// ---- 2. Limpieza (en orden por las llaves foráneas) ----
const borrar = async (tabla, columna = 'id') => {
  const { error } = await sb.from(tabla).delete().not(columna, 'is', null);
  if (error) throw new Error(`${tabla}: ${error.message}`);
};
await borrar('pagos');
await borrar('conciliaciones');
await sb.from('incapacidades').update({ prorroga_de: null }).not('prorroga_de', 'is', null); // prórrogas apuntan a otros casos
await borrar('incapacidades'); // el resto de tablas del caso se borra en cascada
await borrar('notificaciones');
await borrar('bitacora');
for (let i = 0; i < respaldo.archivos.length; i += 100) {
  const { error } = await sb.storage.from(BUCKET).remove(respaldo.archivos.slice(i, i + 100));
  if (error) throw new Error(`bucket: ${error.message}`);
}

const quedan = await Promise.all(TABLAS.map(async (t) => [t, (await sb.from(t).select('*', { count: 'exact', head: true })).count]));
console.log('\nLimpieza terminada. Registros que quedan:', Object.fromEntries(quedan));
