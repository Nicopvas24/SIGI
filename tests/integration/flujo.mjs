// Pruebas de flujo de SIGI contra la API en ejecución.
// Recorre el proceso completo con los documentos ficticios de tests/fixtures/documentos y
// deja casos de prueba en distintos estados (sirve también para sembrar datos limpios).
//
//   npm run dev                (en otra terminal, con DEMO_MODE=true)
//   npm run test:flujo         (o: API_URL=http://localhost:4000 node tests/integration/flujo.mjs)
//
// Recomendado ejecutarlo sobre datos limpios: node database/limpiar-datos.mjs --confirmar
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = (process.env.API_URL || 'http://localhost:4000') + '/api';
const CLAVE = 'Sigi2026!';
const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/documentos');
const doc = (ruta) => path.join(DOCS, ruta);
const PERIODO = new Date().toISOString().slice(0, 7);
const HOY = new Date().toISOString().slice(0, 10);

// ---------- Sesiones ----------
const sesiones = {};
async function como(correo) {
  if (sesiones[correo]) return sesiones[correo];
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo, password: CLAVE }) });
  const d = await r.json();
  if (!r.ok) throw new Error(`No se pudo ingresar como ${correo}: ${d.error}`);
  sesiones[correo] = d.token ? { Authorization: `Bearer ${d.token}` } : { 'x-demo-correo': correo };
  return sesiones[correo];
}

// ---------- Cliente con medición de tiempos ----------
const tiempos = [];
async function llamar(correo, metodo, ruta, { body, archivos, esperado } = {}) {
  const headers = { ...(await como(correo)) };
  let cuerpo;
  if (archivos) {
    cuerpo = new FormData();
    for (const [k, v] of Object.entries(body || {})) [].concat(v).forEach((x) => cuerpo.append(k, String(x)));
    for (const [campo, ruta] of Object.entries(archivos)) {
      const tipo = ruta.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf';
      cuerpo.append(campo, new Blob([fs.readFileSync(ruta)], { type: tipo }), path.basename(ruta));
    }
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    cuerpo = JSON.stringify(body);
  }
  const t0 = performance.now();
  const res = await fetch(API + ruta, { method: metodo, headers, body: cuerpo });
  const ms = Math.round(performance.now() - t0);
  tiempos.push({ metodo, ruta: ruta.replace(/[0-9a-f-]{36}/g, ':id'), ms });
  const datos = await res.json().catch(() => ({}));
  const ok = esperado ? res.status === esperado : res.ok;
  if (!ok) throw new Error(`${metodo} ${ruta} -> ${res.status} (esperado ${esperado || '2xx'}): ${datos.error || datos.advertencia || JSON.stringify(datos).slice(0, 200)}`);
  return datos;
}
const get = (c, r, o) => llamar(c, 'GET', r, o);
const post = (c, r, body, o = {}) => llamar(c, 'POST', r, { ...o, body });

// ---------- Registro de resultados ----------
const resultados = [];
let escenario = '';
function igual(real, esperado, que) {
  if (real !== esperado) throw new Error(`${que}: se esperaba ${JSON.stringify(esperado)} y llegó ${JSON.stringify(real)}`);
}
function cierto(cond, que) { if (!cond) throw new Error(que); }
async function paso(nombre, fn) {
  try {
    const r = await fn();
    resultados.push({ escenario, nombre, ok: true });
    console.log(`   ✔ ${nombre}`);
    return r;
  } catch (e) {
    resultados.push({ escenario, nombre, ok: false, error: e.message });
    console.log(`   ✘ ${nombre}\n       ${e.message}`);
    throw e;
  }
}
async function escenarioDe(nombre, fn) {
  escenario = nombre;
  console.log(`\n▶ ${nombre}`);
  try { await fn(); } catch { console.log('   (escenario interrumpido)'); }
}

// ---------- Datos de referencia ----------
const AUX = 'auxiliar@sigi.demo', REC = 'recepcion@sigi.demo', CONT = 'contabilidad@sigi.demo';
const JUR = 'juridica@sigi.demo', DOCU = 'documental@sigi.demo', ADMIN = 'admin@sigi.demo';
const CARLOS = 'colaborador@sigi.demo', JORGE = 'jorge.castano@sigi.demo', LUIS = 'luis.montoya@sigi.demo';
const PERSONAL = [AUX, REC, CONT, JUR, DOCU, ADMIN];

const colaboradores = await get(ADMIN, '/colaboradores');
const entidades = await get(ADMIN, '/entidades');
const colab = (correo) => colaboradores.find((c) => c.usuario?.correo === correo) || (() => { throw new Error(`No existe el colaborador ${correo}`); })();
const entidad = (nombre) => entidades.find((e) => e.nombre === nombre) || (() => { throw new Error(`No existe la entidad ${nombre}`); })();
const caso = (id) => get(AUX, `/incapacidades/${id}`);
const EVID = '08_evidencias_gestion';

/** Lleva un caso RECIBIDO hasta COBRADA: verificar, transcribir, radicar, aceptación y solicitud de pago. */
async function hastaCobrada(id) {
  const c = await caso(id);
  await paso('Auxiliar verifica la documentación (todos conformes)', async () => {
    const r = await post(AUX, `/incapacidades/${id}/verificar`, { conformes: c.documentos.map((d) => d.id) });
    cierto(r.completa, `quedó incompleta: ${r.mensaje}`);
  });
  await paso('Auxiliar transcribe con constancia', () =>
    post(AUX, `/incapacidades/${id}/transcribir`, { numero_transcripcion: `TR-${c.numero_caso}` }, { archivos: { evidencia: doc(`${EVID}/constancia_transcripcion_portal.pdf`) } }));
  await paso('Auxiliar radica con evidencia', () =>
    post(AUX, `/incapacidades/${id}/radicar`, { numero_radicado: `RAD-${c.numero_caso}`, medio: 'WEB' }, { archivos: { evidencia: doc(`${EVID}/radicado_sellado.pdf`) } }));
  await paso('Se registra la aceptación de la entidad con fecha promesa', () =>
    post(AUX, `/incapacidades/${id}/aceptacion`, { fecha_promesa_pago: '2026-12-15' }));
  await paso('Auxiliar solicita el pago con constancia de envío', () =>
    post(AUX, `/incapacidades/${id}/solicitar-pago`, {}, { archivos: { evidencia: doc(`${EVID}/constancia_solicitud_pago.pdf`) } }));
  const final = await caso(id);
  igual(final.estado, 'COBRADA', 'estado tras solicitar el pago');
  return final;
}

console.log(`SIGI · pruebas de flujo contra ${API} (periodo ${PERIODO})`);

// =====================================================================
await escenarioDe('1. Enfermedad general de Carlos: del reporte al archivo', async () => {
  const salud = entidad('Salud Total');
  const { caso: c } = await paso('El colaborador informa su incapacidad', () =>
    post(CARLOS, '/incapacidades', { tipo: 'ENFERMEDAD_GENERAL', entidad_id: salud.id, fecha_inicio: '2026-11-10', dias: 5, diagnostico_cie10: 'J06.9' }));
  globalThis.casoCarlos = c;
  await paso('El colaborador adjunta certificado y epicrisis', async () => {
    await post(CARLOS, `/incapacidades/${c.id}/documentos`, {}, { archivos: {
      CERTIFICADO: doc('01_enfermedad_general_carlos/certificado_incapacidad.pdf'), EPICRISIS: doc('01_enfermedad_general_carlos/epicrisis.pdf') } });
    igual((await caso(c.id)).estado, 'DOCUMENTACION_REMITIDA', 'estado');
  });
  await paso('El colaborador NO puede verificar su propio caso (permiso)', () =>
    post(CARLOS, `/incapacidades/${c.id}/verificar`, { conformes: [] }, { esperado: 403 }));
  await paso('Recepción registra la entrega', async () => {
    await post(REC, `/incapacidades/${c.id}/recibir`, { canal: 'PRESENCIAL' });
    igual((await caso(c.id)).estado, 'RECIBIDA', 'estado');
  });
  const cobrada = await hastaCobrada(c.id);
  await paso('La liquidación quedó calculada (valor solicitado > 0)', () => cierto(Number(cobrada.valor_solicitado) > 0, 'valor_solicitado en cero'));
  await paso('Aparece en el tablero de Cobro', async () => {
    const t = await get(CONT, '/cobro/tablero');
    cierto(Object.values(t).some((e) => e.casos.some((x) => x.id === c.id)), 'no está en el tablero');
  });
  await paso('Contabilidad registra el pago con soporte de liquidación', () =>
    post(CONT, `/incapacidades/${c.id}/pago`, { valor: cobrada.valor_solicitado, fecha_pago: HOY }, { archivos: { soporte: doc(`${EVID}/soporte_liquidacion_pago.pdf`) } }));
  const avisos = await paso('El pago aparece en Conciliación para confirmar', async () => {
    const e = await get(CONT, `/conciliacion?periodo=${PERIODO}`);
    const a = e.avisos.find((x) => x.incapacidad_id === c.id);
    cierto(a, 'el caso no aparece en "Pagos registrados en Cobro"');
    return a;
  });
  await paso('Contabilidad confirma la consignación y el caso queda pagado', async () => {
    const r = await post(CONT, '/conciliacion/confirmar-pago', { pago_id: avisos.pago_id, periodo: PERIODO });
    igual(r.saldo_pendiente, 0, 'saldo');
    igual((await caso(c.id)).estado, 'PAGADA', 'estado');
  });
  await paso('La consignación aparece como identificada con su número de caso', async () => {
    const e = await get(CONT, `/conciliacion?periodo=${PERIODO}`);
    const p = e.consignaciones.find((x) => x.incapacidad?.id === c.id);
    cierto(p && p.estado === 'IDENTIFICADO', 'no aparece identificada en el periodo');
  });
  await paso('Gestión Documental cruza los físicos y archiva', async () => {
    const pagadas = await get(DOCU, '/archivo/pagadas');
    cierto(pagadas.find((x) => x.id === c.id)?.tiene_soporte_liquidacion, 'no tiene soporte de liquidación');
    const cruce = await post(DOCU, '/archivo/verificar-fisicos', { fisicos_encontrados: [c.id] });
    cierto(cruce.aptas_para_envio.includes(c.numero_caso), 'no quedó apta para envío');
    await post(DOCU, `/incapacidades/${c.id}/archivar`, { confirmacion_destruccion_epicrisis: true, ubicacion_fisica: 'Salud Total/2026/Caja 1' });
    igual((await caso(c.id)).estado, 'ARCHIVADA', 'estado');
  });
  await paso('Los auxiliares fueron notificados del caso nuevo', async () => {
    const n = await get(AUX, '/notificaciones');
    cierto(n.some((x) => `${x.asunto} ${x.mensaje}`.includes(c.numero_caso)), 'el auxiliar no recibió el aviso del caso');
  });
});

// =====================================================================
await escenarioDe('2. Prórroga de Carlos', async () => {
  const base = globalThis.casoCarlos;
  cierto(base, 'requiere el caso del escenario 1');
  const salud = entidad('Salud Total');
  const datos = { tipo: 'ENFERMEDAD_GENERAL', entidad_id: salud.id, fecha_inicio: '2026-11-15', dias: 10, diagnostico_cie10: 'J06.9' };
  await paso('El sistema detecta que puede ser prórroga (409)', async () => {
    const r = await post(CARLOS, '/incapacidades', datos, { esperado: 409 });
    igual(r.caso_existente_id, base.id, 'caso relacionado');
  });
  const { caso: p } = await paso('Se registra como prórroga', () => post(CARLOS, '/incapacidades', { ...datos, prorroga_de: base.id }));
  await paso('Adjunta el certificado de prórroga', () =>
    post(CARLOS, `/incapacidades/${p.id}/documentos`, {}, { archivos: { CERTIFICADO: doc('06_prorroga_carlos/certificado_prorroga.pdf'), EPICRISIS: doc('06_prorroga_carlos/epicrisis.pdf') } }));
  await paso('El historial del colaborador suma los días de la prórroga', async () => {
    const h = await get(AUX, `/monitoreo/colaboradores/${colab(CARLOS).id}`);
    cierto(JSON.stringify(h).includes(p.numero_caso), 'la prórroga no aparece en el historial');
  });
});

// =====================================================================
await escenarioDe('3. Accidente de tránsito de Jorge: soportes incompletos, rechazo y subsanación', async () => {
  const { caso: c } = await paso('El auxiliar informa la incapacidad por el colaborador', () =>
    post(AUX, '/incapacidades', { colaborador_id: colab(JORGE).id, tipo: 'ACCIDENTE_TRANSITO', entidad_id: entidad('Salud Total').id, fecha_inicio: '2026-11-03', dias: 15, diagnostico_cie10: 'S82.2' }));
  await paso('Se entrega solo el certificado y Recepción lo recibe', async () => {
    await post(JORGE, `/incapacidades/${c.id}/documentos`, {}, { archivos: { CERTIFICADO: doc('02_accidente_transito_jorge/certificado_incapacidad.pdf') } });
    await post(REC, `/incapacidades/${c.id}/recibir`, {});
  });
  await paso('La verificación detecta faltantes (FURIPS y epicrisis)', async () => {
    const d = await caso(c.id);
    const r = await post(AUX, `/incapacidades/${c.id}/verificar`, { conformes: d.documentos.map((x) => x.id) });
    cierto(!r.completa && r.faltantes.length, 'debía quedar incompleta');
    igual((await caso(c.id)).estado, 'DOCUMENTACION_INCOMPLETA', 'estado');
  });
  await paso('El auxiliar envía el segundo llamado', () => post(AUX, `/incapacidades/${c.id}/segundo-llamado`, {}));
  await paso('El colaborador entrega los faltantes y el caso vuelve a verificación', async () => {
    await post(JORGE, `/incapacidades/${c.id}/documentos`, {}, { archivos: {
      FURIPS: doc('02_accidente_transito_jorge/furips.pdf'), EPICRISIS: doc('02_accidente_transito_jorge/epicrisis.pdf') } });
    igual((await caso(c.id)).estado, 'RECIBIDA', 'estado');
  });
  await paso('Se verifica completo', async () => {
    const d = await caso(c.id);
    const r = await post(AUX, `/incapacidades/${c.id}/verificar`, { conformes: d.documentos.map((x) => x.id) });
    cierto(r.completa, r.mensaje);
  });
  await paso('Se radica directo y la entidad lo rechaza', async () => {
    await post(AUX, `/incapacidades/${c.id}/radicar`, { numero_radicado: 'RAD-JORGE-1' }, { archivos: { evidencia: doc(`${EVID}/radicado_sellado.pdf`) } });
    await post(AUX, `/incapacidades/${c.id}/aceptacion`, { rechazo: true, causal: 'FURIPS sin firma del médico' });
    igual((await caso(c.id)).estado, 'RECHAZADA', 'estado');
  });
  await paso('Se subsana y vuelve a la bandeja de transcripción', async () => {
    await post(AUX, `/incapacidades/${c.id}/subsanar`, { descripcion: 'Se obtuvo el FURIPS firmado' });
    igual((await caso(c.id)).estado, 'VERIFICADA', 'estado');
    const b = await get(AUX, '/transcripcion/pendientes');
    cierto(b.some((x) => x.id === c.id), 'no aparece en la bandeja');
  });
});

// =====================================================================
await escenarioDe('4. Licencia de maternidad de Paula: cobro persuasivo y jurídico', async () => {
  const { caso: c } = await paso('El auxiliar informa la licencia', () =>
    post(AUX, '/incapacidades', { colaborador_id: colab('paula.gomez@sigi.demo').id, tipo: 'LICENCIA_MATERNIDAD', entidad_id: entidad('Sanitas').id, fecha_inicio: '2026-11-08', dias: 126, diagnostico_cie10: 'O80' }));
  await paso('Se adjuntan los 5 soportes y Recepción los recibe', async () => {
    const d = '03_licencia_maternidad_paula';
    await post(AUX, `/incapacidades/${c.id}/documentos`, {}, { archivos: {
      CERTIFICADO: doc(`${d}/certificado_licencia.pdf`), NACIDO_VIVO: doc(`${d}/certificado_nacido_vivo.pdf`),
      REGISTRO_CIVIL: doc(`${d}/registro_civil.pdf`), DOC_IDENTIDAD: doc(`${d}/documento_identidad.pdf`), EPICRISIS: doc(`${d}/epicrisis_parto.pdf`) } });
    await post(REC, `/incapacidades/${c.id}/recibir`, {});
  });
  await hastaCobrada(c.id);
  await paso('Dos requerimientos de cobro pasan el caso a cobro persuasivo', async () => {
    await post(AUX, `/incapacidades/${c.id}/requerimiento`, {}, { archivos: { evidencia: doc(`${EVID}/acuse_requerimiento_cobro.pdf`) } });
    await post(AUX, `/incapacidades/${c.id}/requerimiento`, {}, { archivos: { evidencia: doc(`${EVID}/acuse_requerimiento_cobro.pdf`) } });
    igual((await caso(c.id)).estado, 'EN_COBRO_PERSUASIVO', 'estado');
  });
  await paso('Se traslada a jurídica', async () => {
    await post(AUX, `/incapacidades/${c.id}/trasladar-juridica`, { causal: 'Incumplimiento de la fecha promesa de pago' });
    igual((await caso(c.id)).estado, 'EN_COBRO_JURIDICO', 'estado');
  });
  await paso('Jurídica radica derecho de petición y registra que no hubo respuesta', async () => {
    await post(JUR, `/incapacidades/${c.id}/derecho-peticion`, { radicado: 'DP-2026-001', causal_negacion: 'Sin respuesta a la solicitud' });
    const procesos = (await caso(c.id)).procesos;
    await post(JUR, `/procesos/${procesos[0].id}/resultado`, { resultado: 'SIN_RESPUESTA' });
  });
  await paso('Jurídica radica la acción de tutela', () => post(JUR, `/incapacidades/${c.id}/accion-tutela`, { radicado: '2026-00123', juzgado: 'Juzgado 3 Civil Municipal de Pereira' }));
  await paso('Aparece en la bandeja de Jurídica con sus dos procesos', async () => {
    const j = await get(JUR, '/juridico/casos');
    igual(j.find((x) => x.id === c.id)?.procesos?.length, 2, 'procesos');
  });
  await paso('Con 126 días aparece en Monitoreo (más de 90)', async () => {
    const m = await get(AUX, '/monitoreo/reporte');
    cierto(m.filas.some((f) => f.incapacidad_id === c.id), 'no aparece en el reporte');
  });
});

// =====================================================================
await escenarioDe('5. Licencia de paternidad de Santiago: consignación cargada por Contabilidad', async () => {
  const sos = entidad('SOS');
  const { caso: c } = await paso('El colaborador informa la licencia', () =>
    post('santiago.herrera@sigi.demo', '/incapacidades', { tipo: 'LICENCIA_PATERNIDAD', entidad_id: sos.id, fecha_inicio: '2026-11-06', dias: 14 }));
  await paso('Adjunta soportes y Recepción los recibe', async () => {
    const d = '04_licencia_paternidad_santiago';
    await post('santiago.herrera@sigi.demo', `/incapacidades/${c.id}/documentos`, {}, { archivos: {
      NACIDO_VIVO: doc(`${d}/certificado_nacido_vivo.pdf`), REGISTRO_CIVIL: doc(`${d}/registro_civil.pdf`),
      DOC_IDENTIDAD: doc(`${d}/documento_identidad_madre.pdf`), EPICRISIS: doc(`${d}/epicrisis_parto_madre.pdf`) } });
    await post(REC, `/incapacidades/${c.id}/recibir`, {});
  });
  const cobrada = await hastaCobrada(c.id);
  await paso('Contabilidad carga la consignación de la entidad', () =>
    post(CONT, '/conciliacion/consignaciones', { periodo: PERIODO, consignaciones: [{ entidad_id: sos.id, valor: Number(cobrada.valor_solicitado), fecha_pago: HOY }] }));
  await paso('El sistema propone el caso de Santiago como coincidencia y se confirma', async () => {
    const props = await get(CONT, '/conciliacion/coincidencias');
    const prop = props.find((p) => p.candidatos.some((x) => x.incapacidad_id === c.id));
    cierto(prop, 'no se propuso el caso');
    const r = await post(CONT, '/conciliacion/confirmar', { pago_id: prop.pago.id, incapacidad_id: c.id });
    igual(r.saldo_pendiente, 0, 'saldo');
    igual((await caso(c.id)).estado, 'PAGADA', 'estado');
  });
  await paso('En Archivo falta el soporte; Gestión Documental lo adjunta', async () => {
    let a = (await get(DOCU, '/archivo/pagadas')).find((x) => x.id === c.id);
    igual(a.tiene_soporte_liquidacion, false, 'soporte antes');
    await post(DOCU, `/incapacidades/${c.id}/soporte-liquidacion`, {}, { archivos: { soporte: doc(`${EVID}/soporte_liquidacion_pago.pdf`) } });
    a = (await get(DOCU, '/archivo/pagadas')).find((x) => x.id === c.id);
    igual(a.tiene_soporte_liquidacion, true, 'soporte después');
  });
});

// =====================================================================
await escenarioDe('6. Accidente laboral de María: pago parcial', async () => {
  const arl = entidad('ARL SURA');
  const { caso: c } = await paso('La colaboradora informa la incapacidad', () =>
    post('maria.rios@sigi.demo', '/incapacidades', { tipo: 'ACCIDENTE_LABORAL', entidad_id: arl.id, fecha_inicio: '2026-11-09', dias: 10, diagnostico_cie10: 'S93.4' }));
  await paso('Adjunta soportes y Recepción los recibe', async () => {
    await post('maria.rios@sigi.demo', `/incapacidades/${c.id}/documentos`, {}, { archivos: {
      CERTIFICADO: doc('05_accidente_laboral_maria/certificado_incapacidad_arl.pdf'), EPICRISIS: doc('05_accidente_laboral_maria/epicrisis.pdf') } });
    await post(REC, `/incapacidades/${c.id}/recibir`, {});
  });
  const cobrada = await hastaCobrada(c.id);
  const parcial = Math.round(Number(cobrada.valor_solicitado) / 2);
  await paso('Contabilidad registra un pago parcial (50 %)', () =>
    post(CONT, `/incapacidades/${c.id}/pago`, { valor: parcial, fecha_pago: HOY }, { archivos: { soporte: doc(`${EVID}/soporte_liquidacion_pago.pdf`) } }));
  await paso('Al confirmarlo en Conciliación el saldo vuelve a cobro', async () => {
    const e = await get(CONT, `/conciliacion?periodo=${PERIODO}`);
    const a = e.avisos.find((x) => x.incapacidad_id === c.id);
    cierto(a, 'no aparece en Conciliación');
    const r = await post(CONT, '/conciliacion/confirmar-pago', { pago_id: a.pago_id, periodo: PERIODO });
    cierto(r.saldo_pendiente > 0, 'debía quedar saldo');
    const d = await caso(c.id);
    igual(d.estado, 'COBRADA', 'estado');
    igual(Number(d.valor_pagado), parcial, 'valor pagado');
  });
});

// =====================================================================
await escenarioDe('7. Modificar y eliminar una incapacidad', async () => {
  const luis = colab(LUIS);
  const { caso: c } = await paso('El auxiliar registra un caso con un error en los días', () =>
    post(AUX, '/incapacidades', { colaborador_id: luis.id, tipo: 'ENFERMEDAD_GENERAL', entidad_id: entidad('Salud Total').id, fecha_inicio: '2026-11-12', dias: 3, confirmar_no_prorroga: true }));
  await paso('Se corrigen los días y la fecha final se recalcula', async () => {
    // Se envían todos los campos, como lo hace el diálogo de la pantalla
    await llamar(AUX, 'PUT', `/incapacidades/${c.id}`, { body: {
      tipo: 'ENFERMEDAD_GENERAL', entidad_id: entidad('Salud Total').id, fecha_inicio: '2026-11-11', dias: 4,
      diagnostico_cie10: 'A09', observaciones: 'Corregido según el certificado' } });
    const d = await caso(c.id);
    igual(d.dias, 4, 'días');
    igual(d.fecha_inicio, '2026-11-11', 'fecha de inicio');
    igual(d.fecha_fin, '2026-11-14', 'fecha final');
  });
  await paso('Otro colaborador no puede modificarlo (permiso)', () =>
    llamar(CARLOS, 'PUT', `/incapacidades/${c.id}`, { body: { dias: 9 }, esperado: 403 }));
  await paso('Eliminar exige un motivo', () => llamar(AUX, 'DELETE', `/incapacidades/${c.id}`, { body: {}, esperado: 400 }));
  await paso('Se elimina con motivo y ya no existe', async () => {
    await llamar(AUX, 'DELETE', `/incapacidades/${c.id}`, { body: { motivo: 'Registrado dos veces' } });
    await get(AUX, `/incapacidades/${c.id}`, { esperado: 404 });
  });
  await paso('Un caso ya verificado no se puede eliminar', async () => {
    const verificado = (await get(AUX, '/transcripcion/pendientes'))[0];
    cierto(verificado, 'no hay casos verificados para probar');
    await llamar(AUX, 'DELETE', `/incapacidades/${verificado.id}`, { body: { motivo: 'prueba' }, esperado: 422 });
  });
  await paso('Queda un caso de Luis pendiente de recepción', () =>
    post(AUX, '/incapacidades', { colaborador_id: luis.id, tipo: 'ENFERMEDAD_GENERAL', entidad_id: entidad('Salud Total').id, fecha_inicio: '2026-11-16', dias: 2, diagnostico_cie10: 'A09', confirmar_no_prorroga: true }));
});

// =====================================================================
await escenarioDe('7b. El personal de la plataforma no se reporta como incapacitado', async () => {
  await paso('La lista para reportar solo trae usuarios con rol Colaborador', async () => {
    for (const quien of [ADMIN, REC, AUX]) {
      const lista = await get(quien, '/colaboradores');
      cierto(lista.length > 0, `${quien} no ve colaboradores`);
      const intruso = lista.find((x) => x.usuario?.rol !== 'COLABORADOR' || PERSONAL.includes(x.usuario?.correo));
      cierto(!intruso, `${quien} ve a ${intruso?.usuario?.nombre} (${intruso?.usuario?.rol})`);
    }
  });
  await paso('Tampoco se puede reportar a alguien del personal por la API', async () => {
    const usuarios = await get(ADMIN, '/admin/usuarios');
    const juridica = usuarios.find((u) => u.correo === JUR);
    cierto(juridica?.colaborador?.id, 'la usuaria de Jurídica no tiene datos laborales para probar');
    await llamar(AUX, 'POST', '/incapacidades', { body: { colaborador_id: juridica.colaborador.id, tipo: 'ENFERMEDAD_GENERAL', entidad_id: entidad('Sanitas').id, fecha_inicio: '2026-11-20', dias: 2, confirmar_no_prorroga: true }, esperado: 422 });
  });
});

// =====================================================================
await escenarioDe('8. Reportes y consultas', async () => {
  await paso('Reporte de ausentismo SG-SST del periodo', async () => {
    const r = await get(AUX, `/sgsst/reporte?periodo=${PERIODO}`);
    cierto(r.resumen.total_incapacidades > 0, 'reporte vacío');
  });
  await paso('Lista de colaboradores con historial', async () => cierto((await get(AUX, '/monitoreo/colaboradores')).length > 0, 'vacía'));
  await paso('Un colaborador solo ve sus propios casos', async () => {
    const propios = await get(CARLOS, '/incapacidades');
    cierto(propios.length > 0 && propios.every((x) => x.colaborador?.usuario?.correo === CARLOS), 've casos de otros');
  });
  await paso('El rol Líder de área ya no existe', async () => {
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: 'lider@sigi.demo', password: CLAVE }) });
    cierto(!r.ok, 'lider@sigi.demo todavía puede ingresar');
  });
});

// =====================================================================
await escenarioDe('9. IA: lectura de un certificado (opcional)', async () => {
  await paso('Lee el certificado de Carlos', async () => {
    const fd = new FormData();
    fd.append('archivo', new Blob([fs.readFileSync(doc('01_enfermedad_general_carlos/certificado_incapacidad.pdf'))], { type: 'application/pdf' }), 'cert.pdf');
    const t0 = performance.now();
    const res = await fetch(`${API}/ia/leer-certificado`, { method: 'POST', headers: await como(AUX), body: fd });
    tiempos.push({ metodo: 'POST', ruta: '/ia/leer-certificado', ms: Math.round(performance.now() - t0) });
    const d = await res.json();
    if ([429, 503, 504].includes(res.status)) { console.log(`     (IA no disponible: ${d.error}; no cuenta como falla)`); return; }
    cierto(res.ok, d.error);
    igual(d.dias, 5, 'días leídos');
    igual(d.colaborador_sugerido?.id, colab(CARLOS).id, 'colaborador reconocido');
  });
});

// ---------- Resumen ----------
const ok = resultados.filter((r) => r.ok).length;
const fallas = resultados.filter((r) => !r.ok);
const acciones = tiempos.filter((t) => t.metodo !== 'GET' && !t.ruta.startsWith('/ia/'));
const consultas = tiempos.filter((t) => t.metodo === 'GET');
const prom = (xs) => Math.round(xs.reduce((s, t) => s + t.ms, 0) / (xs.length || 1));
console.log(`\n════════ ${ok} pasos correctos, ${fallas.length} con falla ════════`);
for (const f of fallas) console.log(`  ✘ [${f.escenario}] ${f.nombre}: ${f.error}`);
console.log(`\nTiempos: acciones promedio ${prom(acciones)} ms (máx ${Math.max(...acciones.map((t) => t.ms))} ms), consultas promedio ${prom(consultas)} ms`);
const lentas = Object.values(tiempos.reduce((m, t) => {
  const k = `${t.metodo} ${t.ruta}`; (m[k] ||= { k, n: 0, total: 0, max: 0 }); m[k].n++; m[k].total += t.ms; m[k].max = Math.max(m[k].max, t.ms); return m;
}, {})).sort((a, b) => b.total / b.n - a.total / a.n).slice(0, 8);
console.log('Más lentas (promedio):');
for (const l of lentas) console.log(`  ${String(Math.round(l.total / l.n)).padStart(5)} ms  ${l.k}  (x${l.n})`);
process.exit(fallas.length ? 1 : 0);
