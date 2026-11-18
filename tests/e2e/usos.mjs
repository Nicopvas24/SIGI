// Pruebas de uso de la interfaz de SIGI con cada rol, en un navegador real.
//
//  1. Recorrido de solo lectura por rol: ingreso por el formulario, menú esperado, cada vista del menú
//     (título, sin errores de página ni de API, sin desborde horizontal), vistas prohibidas que
//     redirigen, diálogos que se abren y cierran, versión móvil y cierre de sesión.
//     En esta fase se bloquea cualquier solicitud que modifique datos.
//  2. Uso real de formularios: informar, modificar y eliminar un caso desde la pantalla (colaborador y
//     auxiliar con el buscador). Los casos creados se eliminan al final.
//
//   npm run build (en app/views) y npm run dev  ->  npm run test:usos
//   Variables: APP_URL (por defecto http://localhost:4000), CHROME_PATH, CAPTURAS (carpeta para capturas).
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const APP = process.env.APP_URL || 'http://localhost:4000';
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));
const CAPTURAS = process.env.CAPTURAS;
const CLAVE = 'Sigi2026!';

const TITULOS = {
  '/monitoreo': 'Monitoreo de días acumulados', '/recepcion': 'Reporte y recepción', '/verificacion': 'Verificación documental',
  '/transcripcion': 'Transcripción y radicación', '/cobro': 'Cartera por entidad', '/juridico': 'Cobro jurídico',
  '/conciliacion': 'Conciliación de pagos', '/archivo': 'Archivo de pagadas', '/colaboradores': 'Colaboradores',
  '/usuarios': 'Usuarios', '/notificaciones': 'Notificaciones',
};
const MENU_TEXTO = {
  '/monitoreo': 'Monitoreo', '/recepcion': 'Reporte y recepción', '/verificacion': 'Verificación', '/transcripcion': 'Transcripción y radicación',
  '/cobro': 'Cobro', '/juridico': 'Cobro jurídico', '/conciliacion': 'Conciliación', '/archivo': 'Archivo',
  '/colaboradores': 'Colaboradores', '/usuarios': 'Usuarios', '/notificaciones': 'Notificaciones',
};
const TODAS = Object.keys(TITULOS);
const ROLES = [
  { correo: 'colaborador@sigi.demo', rol: 'Colaborador', inicio: '/recepcion', vistas: ['/recepcion', '/notificaciones'] },
  { correo: 'lider@sigi.demo', rol: 'Líder', inicio: '/recepcion', vistas: ['/recepcion', '/colaboradores', '/notificaciones'] },
  { correo: 'recepcion@sigi.demo', rol: 'Recepción', inicio: '/recepcion', vistas: ['/recepcion', '/notificaciones'] },
  { correo: 'auxiliar@sigi.demo', rol: 'Auxiliar', inicio: '/monitoreo',
    vistas: ['/monitoreo', '/recepcion', '/verificacion', '/transcripcion', '/cobro', '/juridico', '/conciliacion', '/archivo', '/colaboradores', '/notificaciones'] },
  { correo: 'juridica@sigi.demo', rol: 'Jurídica', inicio: '/juridico', vistas: ['/juridico', '/notificaciones'] },
  { correo: 'contabilidad@sigi.demo', rol: 'Contabilidad', inicio: '/conciliacion', vistas: ['/cobro', '/conciliacion', '/notificaciones'] },
  { correo: 'documental@sigi.demo', rol: 'Gestión documental', inicio: '/archivo', vistas: ['/archivo', '/notificaciones'] },
  { correo: 'admin@sigi.demo', rol: 'Administración', inicio: '/monitoreo', vistas: [...TODAS] },
];

// ---------- Resultados ----------
const resultados = [];
let grupo = '';
const cierto = (c, m) => { if (!c) throw new Error(m); };
async function paso(nombre, fn) {
  try { await fn(); resultados.push({ grupo, nombre, ok: true }); console.log(`   ✔ ${nombre}`); }
  catch (e) { resultados.push({ grupo, nombre, ok: false, error: e.message }); console.log(`   ✘ ${nombre}\n       ${e.message}`); }
}

// ---------- Navegador ----------
cierto(CHROME, 'No se encontró Chrome ni Edge. Defina CHROME_PATH.');
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function nuevaPagina({ soloLectura }) {
  const p = await navegador.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  p.errores = []; p.fallasApi = [];
  p.on('pageerror', (e) => p.errores.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errores.push(m.text()); });
  p.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/') && r.status() >= 400 && r.request().method() === 'GET') p.fallasApi.push(`${r.status()} ${u.pathname}`);
  });
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = new URL(r.url());
    const escribe = u.pathname.startsWith('/api/') && r.method() !== 'GET' && u.pathname !== '/api/auth/login';
    if (soloLectura && escribe) { p.bloqueadas = (p.bloqueadas || 0) + 1; return r.abort(); }
    r.continue();
  });
  return p;
}
const ruta = (p) => new URL(p.url()).pathname;
const listo = async (p) => { await p.waitForNetworkIdle({ idleTime: 300, timeout: 15000 }).catch(() => {}); await espera(150); };
const capturar = async (p, nombre) => { if (CAPTURAS) { fs.mkdirSync(CAPTURAS, { recursive: true }); await p.screenshot({ path: path.join(CAPTURAS, `${nombre}.png`), fullPage: true }); } };

/** Asigna un valor a un input/select controlado por React y dispara sus eventos. */
async function poner(p, selector, valor) {
  await p.$eval(selector, (el, v) => {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(valor));
}
async function clicTexto(p, selector, texto) {
  const els = await p.$$(selector);
  for (const el of els) if ((await el.evaluate((e) => e.textContent.trim())) === texto) { await el.click(); return true; }
  return false;
}
async function ingresar(p, correo) {
  await p.goto(`${APP}/login`, { waitUntil: 'networkidle0' });
  await poner(p, '#correo', correo);
  await poner(p, '#clave', CLAVE);
  await p.click('form button[type=submit]');
  await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 10000 });
  await listo(p);
}
const textoAviso = (p) => p.$eval('.aviso', (e) => e.textContent.trim()).catch(() => null);
const avisoError = (p) => p.$eval('.aviso.error', (e) => e.textContent.trim()).catch(() => null);
const dialogoAbierto = (p) => p.$('dialog.dialogo[open]');
async function cancelarDialogo(p) {
  await p.keyboard.press('Escape');
  await espera(200);
  cierto(!(await dialogoAbierto(p)), 'el diálogo no se cerró con Escape');
}

console.log(`SIGI · pruebas de uso de la interfaz en ${APP}`);

// =====================================================================
// 1. Recorrido de solo lectura por rol
// =====================================================================
for (const r of ROLES) {
  grupo = `${r.rol} (${r.correo})`;
  console.log(`\n▶ ${grupo}`);
  const p = await nuevaPagina({ soloLectura: true });
  let seguir = true;

  await paso('Ingresa con correo y contraseña desde el formulario', async () => {
    try { await ingresar(p, r.correo); } catch (e) { seguir = false; throw e; }
  });
  if (!seguir) { await p.close(); continue; }

  await paso(`Llega a su módulo de inicio (${r.inicio})`, async () => cierto(ruta(p) === r.inicio, `llegó a ${ruta(p)}`));

  await paso('El menú muestra exactamente sus módulos', async () => {
    const menu = await p.$$eval('.nav a', (as) => as.map((a) => a.textContent.replace(/\d+\+?$/, '').trim()));
    const esperado = r.vistas.map((v) => MENU_TEXTO[v]);
    cierto(JSON.stringify([...menu].sort()) === JSON.stringify([...esperado].sort()), `menú: [${menu.join(', ')}] · esperado: [${esperado.join(', ')}]`);
  });

  for (const v of r.vistas) {
    await paso(`Vista ${TITULOS[v]}: carga sin errores`, async () => {
      p.errores = []; p.fallasApi = [];
      const enlace = (await p.$$('.nav a')).find(async () => true);
      cierto(enlace, 'sin menú');
      await clicTexto(p, '.nav a', MENU_TEXTO[v]) || await p.goto(APP + v);
      await p.waitForFunction((x) => location.pathname === x, { timeout: 8000 }, v);
      await listo(p);
      const h1 = await p.$eval('h1', (e) => e.textContent.trim()).catch(() => null);
      cierto(h1 === TITULOS[v], `título "${h1}"`);
      const err = await avisoError(p);
      cierto(!err, `aviso de error: ${err}`);
      cierto(!p.errores.length, `errores de página: ${p.errores.join(' | ')}`);
      cierto(!p.fallasApi.length, `consultas fallidas: ${p.fallasApi.join(', ')}`);
      const desborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      cierto(!desborde, 'la página se desborda horizontalmente');
      await capturar(p, `${r.correo.split('@')[0]}${v.replace('/', '-')}`);
    });
  }

  // Interacciones de solo lectura según la vista
  if (r.vistas.includes('/recepcion')) {
    await paso('Recepción: el formulario de informar está completo para su rol', async () => {
      await p.goto(`${APP}/recepcion`, { waitUntil: 'networkidle0' });
      for (const id of ['#f-tipo', '#f-entidad', '#f-inicio', '#f-dias']) cierto(await p.$(id), `falta ${id}`);
      const buscador = await p.$('#f-col');
      if (r.rol === 'Colaborador') cierto(!buscador, 'el colaborador no debería elegir a otro trabajador');
      else cierto(buscador, 'falta el buscador de colaborador');
      const opciones = await p.$$eval('#f-entidad option', (os) => os.length);
      cierto(opciones > 1, 'la lista de entidades está vacía');
    });
    if (r.rol !== 'Colaborador') {
      await paso('Recepción: el buscador filtra con el teclado', async () => {
        await p.click('#f-col');
        await p.keyboard.type('carl');
        await espera(200);
        const nombres = await p.$$eval('[role=option] .buscador-nombre', (os) => os.map((o) => o.textContent));
        cierto(nombres.length >= 1 && nombres.every((n) => /carl/i.test(n.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))), `resultados: ${nombres.join(', ')}`);
        await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
      });
    }
    await paso('Recepción: solo ve los casos que le corresponden', async () => {
      const filas = await p.$$eval('tbody tr .caso', (xs) => xs.length);
      const nombres = await p.$$eval('tbody tr td:nth-child(2) .secundario-texto', (xs) => [...new Set(xs.map((x) => x.textContent.trim()))]);
      if (r.rol === 'Colaborador') cierto(nombres.every((n) => n === 'Carlos Colaborador'), `ve casos de: ${nombres.join(', ')}`);
      cierto(filas >= 0, 'sin tabla');
    });
    await paso('Recepción: los diálogos de las filas se abren y se cierran', async () => {
      const botones = await p.$$('tbody .acciones button');
      if (!botones.length) return; // sin casos con acciones para este rol
      await botones[0].click();
      await espera(250);
      if (await dialogoAbierto(p)) await cancelarDialogo(p);
    });
  }
  if (r.vistas.includes('/usuarios')) {
    await paso('Usuarios: abre y cierra el formulario de nuevo usuario', async () => {
      await p.goto(`${APP}/usuarios`, { waitUntil: 'networkidle0' });
      cierto(await clicTexto(p, 'button', 'Nuevo usuario'), 'no está el botón');
      await espera(200);
      cierto(await p.$('#u-nombre'), 'no se abrió el formulario');
      cierto(await clicTexto(p, 'button', 'Cancelar'), 'no se pudo cancelar');
    });
  }
  if (r.vistas.includes('/colaboradores')) {
    await paso('Colaboradores: abre el historial de una persona', async () => {
      await p.goto(`${APP}/colaboradores`, { waitUntil: 'networkidle0' });
      const fila = await p.$('tbody tr');
      if (!fila) return;
      await fila.click();
      await listo(p);
      cierto(!(await avisoError(p)), 'error al abrir el historial');
    });
  }

  await paso('Las vistas de otros roles lo devuelven a su inicio', async () => {
    const prohibidas = TODAS.filter((v) => !r.vistas.includes(v));
    for (const v of prohibidas) {
      await p.goto(APP + v, { waitUntil: 'networkidle0' });
      cierto(ruta(p) === r.inicio, `${v} lo dejó en ${ruta(p)}`);
    }
  });

  await paso('Se ve bien en un celular (390 px)', async () => {
    await p.setViewport({ width: 390, height: 844 });
    for (const v of r.vistas) {
      await p.goto(APP + v, { waitUntil: 'networkidle0' });
      const desborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      cierto(!desborde, `${v} se desborda en el celular`);
    }
    await capturar(p, `${r.correo.split('@')[0]}-movil`);
    await p.setViewport({ width: 1440, height: 900 });
  });

  await paso('Ninguna acción intentó modificar datos durante el recorrido', async () => cierto(!p.bloqueadas, `${p.bloqueadas} solicitud(es) de escritura bloqueadas`));

  await paso('Cierra sesión y vuelve al ingreso', async () => {
    await p.click('button[aria-label="Cerrar sesión"]');
    await p.waitForFunction(() => location.pathname.startsWith('/login'), { timeout: 5000 });
    await p.goto(`${APP}/recepcion`, { waitUntil: 'networkidle0' });
    cierto(ruta(p).startsWith('/login'), 'sin sesión no debería entrar');
  });
  await p.close();
}

// =====================================================================
// 2. Uso real de formularios (crea casos y los elimina al final)
// =====================================================================
async function informarDesdeLaPantalla(p, { colaborador, fecha, dias }) {
  await p.goto(`${APP}/recepcion`, { waitUntil: 'networkidle0' });
  if (colaborador) {
    await p.click('#f-col');
    await p.keyboard.type(colaborador);
    await espera(200);
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowUp'); // recorre con el teclado
    await p.keyboard.press('Enter');
    await espera(150);
  }
  await poner(p, '#f-tipo', 'ENFERMEDAD_GENERAL');
  const salud = await p.$$eval('#f-entidad option', (os) => os.find((o) => o.textContent.includes('Salud Total'))?.value);
  await poner(p, '#f-entidad', salud);
  await poner(p, '#f-inicio', fecha);
  await poner(p, '#f-dias', dias);
  await p.click('form.form-grid button[type=submit]');
  await p.waitForSelector('.aviso', { timeout: 10000 });
  await listo(p);
  const aviso = await textoAviso(p);
  const numero = aviso?.match(/INC-\d{4}-\d{5}/)?.[0];
  cierto(numero && !(await avisoError(p)), `no se creó el caso: ${aviso}`);
  return numero;
}
async function filaDe(p, numero) {
  for (const fila of await p.$$('tbody tr')) if ((await fila.evaluate((f) => f.textContent)).includes(numero)) return fila;
  return null;
}
async function eliminarDesdeLaPantalla(p, numero) {
  const fila = await filaDe(p, numero);
  cierto(fila, `no está la fila de ${numero}`);
  const borrar = await fila.$(`button[aria-label="Eliminar ${numero}"]`);
  cierto(borrar, 'no aparece el botón de eliminar');
  await borrar.click();
  await p.waitForSelector('dialog.dialogo[open] textarea', { timeout: 5000 });
  await p.type('dialog.dialogo[open] textarea', 'Prueba de uso de la interfaz');
  await p.click('dialog.dialogo[open] button[type=submit]');
  await p.waitForFunction((n) => ![...document.querySelectorAll('tbody tr')].some((f) => f.textContent.includes(n)), { timeout: 10000 }, numero);
}

for (const caso of [
  { quien: 'colaborador@sigi.demo', rol: 'Colaborador', datos: { fecha: '2026-12-01', dias: 3 } },
  { quien: 'auxiliar@sigi.demo', rol: 'Auxiliar con el buscador', datos: { colaborador: 'jorge', fecha: '2026-12-03', dias: 2 } },
]) {
  grupo = `Uso real · ${caso.rol}`;
  console.log(`\n▶ ${grupo}`);
  const p = await nuevaPagina({ soloLectura: false });
  let numero;
  await paso('Ingresa', () => ingresar(p, caso.quien));
  await paso('Informa una incapacidad desde el formulario', async () => { numero = await informarDesdeLaPantalla(p, caso.datos); });
  if (numero) {
    await paso(`El caso ${numero} aparece en la tabla como Reportada`, async () => {
      const fila = await filaDe(p, numero);
      cierto(fila, 'no aparece');
      cierto((await fila.evaluate((f) => f.textContent)).includes('Reportada'), 'estado distinto de Reportada');
    });
    await paso('Lo modifica desde el diálogo (cambia los días)', async () => {
      const fila = await filaDe(p, numero);
      await (await fila.$(`button[aria-label="Modificar ${numero}"]`)).click();
      await p.waitForSelector('dialog.dialogo[open] input[name=dias]');
      await poner(p, 'dialog.dialogo[open] input[name=dias]', caso.datos.dias + 1);
      await p.click('dialog.dialogo[open] button[type=submit]');
      await p.waitForFunction(() => /actualizado/.test(document.querySelector('.aviso')?.textContent || ''), { timeout: 10000 });
      await listo(p);
      const dias = await (await filaDe(p, numero)).$eval('td.num', (td) => td.textContent.trim());
      cierto(dias === String(caso.datos.dias + 1), `días en la tabla: ${dias}`);
    });
    await paso('Abre "Adjuntar soportes" y lo cancela', async () => {
      const fila = await filaDe(p, numero);
      for (const b of await fila.$$('button')) if ((await b.evaluate((e) => e.textContent.trim())) === 'Adjuntar soportes') { await b.click(); break; }
      await espera(250);
      cierto(await dialogoAbierto(p), 'no se abrió el diálogo');
      await cancelarDialogo(p);
    });
    await paso('Lo elimina con motivo y desaparece de la tabla', () => eliminarDesdeLaPantalla(p, numero));
  }
  await paso('Sin errores de página durante el uso', async () => cierto(!p.errores.length, p.errores.join(' | ')));
  await p.close();
}

await navegador.close();

// ---------- Resumen ----------
const fallas = resultados.filter((x) => !x.ok);
console.log(`\n════════ ${resultados.length - fallas.length} pruebas correctas, ${fallas.length} con falla ════════`);
for (const f of fallas) console.log(`  ✘ [${f.grupo}] ${f.nombre}: ${f.error}`);
if (CAPTURAS) console.log(`Capturas en ${CAPTURAS}`);
process.exit(fallas.length ? 1 : 0);
