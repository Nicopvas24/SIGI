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
import { NotificacionService } from '../services/NotificacionService.js';

const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
export const rutas = Router();

const AUX = 'AUXILIAR';

// ---------- Autenticación ----------
rutas.post('/auth/login', AuthController.login);
rutas.use(autenticar); // todo lo demás requiere sesión
rutas.get('/auth/perfil', AuthController.perfil);
rutas.get('/auth/usuarios', AuthController.usuarios);
rutas.post('/notificaciones/:id/leida', (req, res, next) =>
  NotificacionService.marcarLeida(req.params.id).then((n) => res.json(n)).catch(next));

// ---------- Reporte y recepción (CU-01..06) ----------
rutas.get('/entidades', RecepcionController.entidades);
rutas.get('/incapacidades', RecepcionController.listar);
rutas.get('/incapacidades/:id', RecepcionController.detalle);
rutas.post('/incapacidades', RecepcionController.informar); // CU-01
rutas.post('/incapacidades/:id/documentos', subir.array('archivos'), RecepcionController.remitirDocumentacion); // CU-02
rutas.post('/incapacidades/:id/reemplazo', permitirRoles('LIDER'), RecepcionController.asignarReemplazo); // CU-03
rutas.post('/incapacidades/:id/recibir', permitirRoles('RECEPCIONISTA', AUX), RecepcionController.recibir); // CU-04/05/06
rutas.post('/ia/extraer-certificado', permitirRoles('RECEPCIONISTA', AUX), RecepcionController.extraerDatosIA); // IA/OCR

// ---------- Verificación documental (CU-07..10) ----------
rutas.get('/verificacion/pendientes', permitirRoles(AUX), VerificacionController.pendientes);
rutas.post('/incapacidades/:id/verificar', permitirRoles(AUX), VerificacionController.verificar); // CU-07 (+CU-08/09)
rutas.post('/incapacidades/:id/segundo-llamado', permitirRoles(AUX), VerificacionController.segundoLlamado); // CU-09
rutas.post('/incapacidades/:id/archivar-digital', permitirRoles(AUX), VerificacionController.archivarDigital); // CU-10
rutas.get('/incapacidades/:id/preverificar-ia', permitirRoles(AUX), VerificacionController.preverificarIA);

// ---------- Transcripción, radicación y SG-SST (CU-11..16) ----------
rutas.get('/transcripcion/pendientes', permitirRoles(AUX), TranscripcionController.pendientes);
rutas.post('/incapacidades/:id/transcribir', permitirRoles(AUX), TranscripcionController.transcribir); // CU-11/12/13
rutas.post('/incapacidades/:id/radicar', permitirRoles(AUX), TranscripcionController.radicar); // CU-14 (+CU-15)
rutas.post('/incapacidades/:id/rechazar', permitirRoles(AUX), TranscripcionController.rechazar);
rutas.post('/incapacidades/:id/subsanar', permitirRoles(AUX), TranscripcionController.subsanar);
rutas.get('/sgsst/reporte', permitirRoles(AUX), TranscripcionController.reporteAusentismo); // CU-16

// ---------- Cobro (CU-17..19, 31, 32) ----------
rutas.get('/cobro/tablero', permitirRoles(AUX, 'CONTABILIDAD', 'JURIDICA'), CobroController.tablero);
rutas.post('/incapacidades/:id/aceptacion', permitirRoles(AUX), CobroController.notificarAceptacion); // CU-31
rutas.post('/incapacidades/:id/solicitar-pago', permitirRoles(AUX), CobroController.solicitarPago); // CU-17
rutas.post('/incapacidades/:id/seguimiento', permitirRoles(AUX), CobroController.seguimiento); // CU-18
rutas.post('/incapacidades/:id/requerimiento', permitirRoles(AUX), CobroController.requerimiento); // CU-19
rutas.post('/incapacidades/:id/pago', permitirRoles(AUX, 'CONTABILIDAD'), CobroController.registrarPago); // CU-32

// ---------- Cobro jurídico (CU-20..23) ----------
rutas.get('/juridico/casos', permitirRoles('JURIDICA', AUX), JuridicoController.casos);
rutas.post('/incapacidades/:id/trasladar-juridica', permitirRoles(AUX, 'JURIDICA'), JuridicoController.trasladar); // CU-20
rutas.post('/incapacidades/:id/decision-juridica', permitirRoles('JURIDICA'), JuridicoController.decidir);
rutas.post('/incapacidades/:id/derecho-peticion', permitirRoles('JURIDICA'), JuridicoController.derechoPeticion); // CU-22
rutas.post('/incapacidades/:id/accion-tutela', permitirRoles('JURIDICA'), JuridicoController.accionTutela); // CU-23
rutas.post('/procesos/:procesoId/resultado', permitirRoles('JURIDICA'), JuridicoController.registrarResultado);

// ---------- Conciliación (CU-24, 25) ----------
rutas.get('/conciliacion', permitirRoles(AUX, 'CONTABILIDAD'), ConciliacionController.estado);
rutas.post('/conciliacion/consignaciones', permitirRoles('CONTABILIDAD', AUX), ConciliacionController.cargarConsignaciones);
rutas.get('/conciliacion/coincidencias', permitirRoles(AUX, 'CONTABILIDAD'), ConciliacionController.proponerCoincidencias);
rutas.post('/conciliacion/confirmar', permitirRoles(AUX), ConciliacionController.confirmarCoincidencia);
rutas.post('/conciliacion/cerrar', permitirRoles('CONTABILIDAD'), ConciliacionController.cerrarPeriodo);

// ---------- Monitoreo (CU-26..28) + IA ----------
rutas.get('/monitoreo/reporte', permitirRoles(AUX), MonitoreoController.reporte); // CU-26
rutas.post('/incapacidades/:id/concepto-rehabilitacion', permitirRoles(AUX), MonitoreoController.conceptoRehabilitacion); // CU-27
rutas.post('/incapacidades/:id/suspension-nomina', permitirRoles(AUX), MonitoreoController.suspensionNomina); // CU-28
rutas.get('/ia/prediccion-180', permitirRoles(AUX), MonitoreoController.prediccionIA);

// ---------- Archivo (CU-29, 30) ----------
rutas.get('/archivo/pagadas', permitirRoles(AUX, 'GESTION_DOCUMENTAL'), ArchivoController.pagadas);
rutas.post('/archivo/verificar-fisicos', permitirRoles(AUX), ArchivoController.verificarFisicos); // CU-30
rutas.post('/incapacidades/:id/archivar', permitirRoles(AUX, 'GESTION_DOCUMENTAL'), ArchivoController.archivar); // CU-29
