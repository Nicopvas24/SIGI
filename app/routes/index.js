// Rutas de la API SIGI - conectan controladores, autenticación y roles
import { Router } from 'express';
import multer from 'multer';
import { autenticar } from '../middleware/auth.js';
import { permitirRoles } from '../middleware/roles.js';
import { AuthController } from '../controllers/AuthController.js';
import { RecepcionController } from '../controllers/RecepcionController.js';
import { VerificacionController } from '../controllers/VerificacionController.js';
import { TranscripcionController } from '../controllers/TranscripcionController.js';
import { CobroController } from '../controllers/CobroController.js';
import { JuridicoController } from '../controllers/JuridicoController.js';
import { ConciliacionController } from '../controllers/ConciliacionController.js';
import { MonitoreoController } from '../controllers/MonitoreoController.js';
import { ArchivoController } from '../controllers/ArchivoController.js';
import { UsuarioController } from '../controllers/UsuarioController.js';
import { EstadisticasController } from '../controllers/EstadisticasController.js';

const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 10 } });
const evidencia = subir.single('evidencia');
export const rutas = Router();

const AUX = 'AUXILIAR';
const GESTION = ['RECEPCIONISTA', AUX];

// ---------- Sesión ----------
rutas.post('/auth/login', AuthController.login);
rutas.post('/auth/refrescar', AuthController.refrescar);
rutas.use(autenticar); // todo lo demás requiere sesión
rutas.get('/auth/perfil', AuthController.perfil);
rutas.get('/notificaciones', AuthController.notificaciones);
rutas.post('/notificaciones/leidas', AuthController.marcarTodas);
rutas.post('/notificaciones/:id/leida', AuthController.marcarLeida);

// ---------- Reporte y recepción ----------
rutas.get('/entidades', RecepcionController.entidades);
rutas.get('/colaboradores', RecepcionController.colaboradores);
rutas.get('/incapacidades', RecepcionController.listar);
rutas.get('/incapacidades/:id', RecepcionController.detalle);
rutas.post('/incapacidades', RecepcionController.informar);
rutas.put('/incapacidades/:id', RecepcionController.modificar);
rutas.delete('/incapacidades/:id', RecepcionController.eliminar);
rutas.post('/incapacidades/:id/documentos', subir.any(), RecepcionController.remitirDocumentacion);
rutas.post('/incapacidades/:id/recibir', permitirRoles(...GESTION), RecepcionController.recibir);
rutas.get('/documentos/:id/url', RecepcionController.verDocumento);
rutas.post('/ia/leer-certificado', subir.single('archivo'), RecepcionController.leerCertificadoIA);

// ---------- Verificación documental ----------
rutas.get('/verificacion/pendientes', permitirRoles(AUX), VerificacionController.pendientes);
rutas.get('/incapacidades/:id/liquidacion', permitirRoles(AUX, 'CONTABILIDAD'), VerificacionController.liquidacion);
rutas.post('/incapacidades/:id/verificar', permitirRoles(AUX), VerificacionController.verificar);
rutas.post('/incapacidades/:id/segundo-llamado', permitirRoles(AUX), VerificacionController.segundoLlamado);
rutas.post('/ia/analizar-soportes/:id', permitirRoles(AUX), VerificacionController.analizarSoportesIA);

// ---------- Transcripción, radicación y SG-SST ----------
rutas.get('/transcripcion/pendientes', permitirRoles(AUX), TranscripcionController.pendientes);
rutas.post('/incapacidades/:id/transcribir', permitirRoles(AUX), evidencia, TranscripcionController.transcribir);
rutas.post('/incapacidades/:id/radicar', permitirRoles(AUX), evidencia, TranscripcionController.radicar);
rutas.post('/incapacidades/:id/rechazar', permitirRoles(AUX), TranscripcionController.rechazar);
rutas.post('/incapacidades/:id/subsanar', permitirRoles(AUX), TranscripcionController.subsanar);
rutas.get('/sgsst/reporte', permitirRoles(AUX), TranscripcionController.reporteAusentismo);

// ---------- Cobro ----------
rutas.get('/cobro/tablero', permitirRoles(AUX, 'CONTABILIDAD'), CobroController.tablero);
rutas.post('/incapacidades/:id/aceptacion', permitirRoles(AUX), CobroController.notificarAceptacion);
rutas.post('/incapacidades/:id/solicitar-pago', permitirRoles(AUX), evidencia, CobroController.solicitarPago);
rutas.post('/incapacidades/:id/seguimiento', permitirRoles(AUX), evidencia, CobroController.seguimiento);
rutas.post('/incapacidades/:id/requerimiento', permitirRoles(AUX), evidencia, CobroController.requerimiento);
rutas.post('/incapacidades/:id/pago', permitirRoles(AUX, 'CONTABILIDAD'), subir.single('soporte'), CobroController.registrarPago);

// ---------- Cobro jurídico ----------
rutas.get('/juridico/casos', permitirRoles('JURIDICA', AUX), JuridicoController.casos);
rutas.post('/incapacidades/:id/trasladar-juridica', permitirRoles(AUX), JuridicoController.trasladar);
rutas.post('/incapacidades/:id/decision-juridica', permitirRoles('JURIDICA'), JuridicoController.decidir);
rutas.post('/incapacidades/:id/derecho-peticion', permitirRoles('JURIDICA'), JuridicoController.derechoPeticion);
rutas.post('/incapacidades/:id/accion-tutela', permitirRoles('JURIDICA'), JuridicoController.accionTutela);
rutas.post('/procesos/:procesoId/resultado', permitirRoles('JURIDICA'), JuridicoController.registrarResultado);

// ---------- Conciliación ----------
rutas.get('/conciliacion', permitirRoles(AUX, 'CONTABILIDAD'), ConciliacionController.estado);
rutas.post('/conciliacion/consignaciones', permitirRoles('CONTABILIDAD', AUX), ConciliacionController.cargarConsignaciones);
rutas.get('/conciliacion/coincidencias', permitirRoles(AUX, 'CONTABILIDAD'), ConciliacionController.proponerCoincidencias);
rutas.post('/conciliacion/confirmar', permitirRoles(AUX, 'CONTABILIDAD'), ConciliacionController.confirmarCoincidencia);
rutas.post('/conciliacion/confirmar-pago', permitirRoles(AUX, 'CONTABILIDAD'), ConciliacionController.confirmarAviso);
rutas.post('/conciliacion/cerrar', permitirRoles('CONTABILIDAD'), ConciliacionController.cerrarPeriodo);

// ---------- Monitoreo, colaboradores e IA ----------
rutas.get('/monitoreo/reporte', permitirRoles(AUX), MonitoreoController.reporte);
rutas.post('/incapacidades/:id/concepto-rehabilitacion', permitirRoles(AUX), MonitoreoController.conceptoRehabilitacion);
rutas.post('/incapacidades/:id/suspension-nomina', permitirRoles(AUX), MonitoreoController.suspensionNomina);
rutas.get('/monitoreo/colaboradores', permitirRoles(AUX), MonitoreoController.colaboradores);
rutas.get('/monitoreo/colaboradores/:id', permitirRoles(AUX), MonitoreoController.historialColaborador);
rutas.post('/ia/resumen-colaborador/:id', permitirRoles(AUX), MonitoreoController.resumenColaboradorIA);
rutas.post('/ia/prediccion-180', permitirRoles(AUX), MonitoreoController.prediccionIA);

// ---------- Estadísticas ----------
rutas.get('/estadisticas', permitirRoles(AUX), EstadisticasController.resumen);

// ---------- Archivo ----------
rutas.get('/archivo/pagadas', permitirRoles(AUX, 'GESTION_DOCUMENTAL'), ArchivoController.pagadas);
rutas.post('/archivo/verificar-fisicos', permitirRoles(AUX, 'GESTION_DOCUMENTAL'), ArchivoController.verificarFisicos);
rutas.post('/incapacidades/:id/archivar', permitirRoles(AUX, 'GESTION_DOCUMENTAL'), ArchivoController.archivar);
rutas.post('/incapacidades/:id/soporte-liquidacion', permitirRoles(AUX, 'GESTION_DOCUMENTAL', 'CONTABILIDAD'),
  subir.single('soporte'), ArchivoController.adjuntarLiquidacion);
rutas.get('/incapacidades/:id/soporte-liquidacion', permitirRoles(AUX, 'GESTION_DOCUMENTAL', 'CONTABILIDAD'), ArchivoController.verLiquidacion);

// ---------- Administración de usuarios (solo ADMIN) ----------
rutas.get('/admin/usuarios', permitirRoles('ADMIN'), UsuarioController.listar);
rutas.post('/admin/usuarios', permitirRoles('ADMIN'), UsuarioController.crear);
rutas.put('/admin/usuarios/:id', permitirRoles('ADMIN'), UsuarioController.actualizar);
rutas.delete('/admin/usuarios/:id', permitirRoles('ADMIN'), UsuarioController.eliminar);
