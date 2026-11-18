// Pruebas unitarias de ReglasIncapacidadService (RN-06, documentos, transiciones)
import test from 'node:test';
import assert from 'node:assert/strict';
import { ReglasIncapacidadService as R } from '../../app/services/ReglasIncapacidadService.js';

test('RN-06: días 1-2 al 100% a cargo de la empresa', () => {
  const r = R.liquidar({ tipo: 'ENFERMEDAD_GENERAL', dias: 2, ibc: 3000000 });
  assert.equal(r.diasEmpresa, 2);
  assert.equal(r.diasEntidad, 0);
  assert.equal(r.valorEmpresa, 200000); // 2 * (3'000.000/30)
});

test('RN-06: días 3-90 al 66.67% a cargo de la EPS', () => {
  const r = R.liquidar({ tipo: 'ENFERMEDAD_GENERAL', dias: 10, ibc: 3000000 });
  assert.equal(r.diasEmpresa, 2);
  assert.equal(r.diasEntidad, 8);
  assert.equal(r.valorEntidad, Math.round(8 * 100000 * (2 / 3))); // pesos enteros
});

test('RN-06: prórroga aplica el tramo según días acumulados (91-180 al 50%)', () => {
  const r = R.liquidar({ tipo: 'ENFERMEDAD_GENERAL', dias: 10, ibc: 3000000, diasAcumulados: 90 });
  assert.equal(r.diasEmpresa, 0);
  assert.equal(r.diasEntidad, 10);
  assert.equal(r.valorEntidad, 10 * 100000 * 0.5);
});

test('RN-06: desde el día 181 el trámite pasa al fondo de pensiones', () => {
  const r = R.liquidar({ tipo: 'ENFERMEDAD_GENERAL', dias: 10, ibc: 3000000, diasAcumulados: 175 });
  assert.equal(r.diasEntidad, 5);       // días 176-180
  assert.equal(r.diasFondoPension, 5);  // días 181-185
  assert.equal(r.advertencias.length, 1);
});

test('Licencia de maternidad: 100% a cargo de la EPS', () => {
  const r = R.liquidar({ tipo: 'LICENCIA_MATERNIDAD', dias: 126, ibc: 3000000 });
  assert.equal(r.diasEntidad, 126);
  assert.equal(r.diasEmpresa, 0);
});

test('Documentos: accidente de tránsito exige FURIPS', () => {
  const docs = R.documentosRequeridos('ACCIDENTE_TRANSITO', { dias: 5 });
  assert.ok(docs.includes('FURIPS'));
  assert.ok(docs.includes('EPICRISIS'));
});

test('Documentos: enfermedad general <=2 días no exige epicrisis', () => {
  const docs = R.documentosRequeridos('ENFERMEDAD_GENERAL', { dias: 2 });
  assert.ok(!docs.includes('EPICRISIS'));
});

test('Documentos: si la EPS ya transcribió, no se exige epicrisis', () => {
  const docs = R.documentosRequeridos('ENFERMEDAD_GENERAL', { dias: 10, transcritaPorEPS: true });
  assert.ok(!docs.includes('EPICRISIS'));
});

test('DE-01: transición válida RECIBIDA -> VERIFICADA', () => {
  assert.doesNotThrow(() => R.validarTransicion('RECIBIDA', 'VERIFICADA'));
});

test('DE-01: transición inválida REPORTADA -> PAGADA', () => {
  assert.throws(() => R.validarTransicion('REPORTADA', 'PAGADA'));
});

test('Monitoreo 5.5.3: umbral correcto para 125 días', () => {
  assert.equal(R.umbralMonitoreo(125), 120);
  assert.equal(R.umbralMonitoreo(89), null);
  assert.equal(R.umbralMonitoreo(200), 180);
});

test('Días hábiles: suma 3 días hábiles saltando fin de semana', () => {
  const viernes = new Date('2026-11-13'); // viernes
  const limite = R.sumarDiasHabiles(viernes, 3);
  assert.equal(limite.getDay() === 0 || limite.getDay() === 6, false);
});
