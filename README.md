# SIGI – Sistema Integral de Gestión de Incapacidades

Digitaliza el procedimiento de Gestión Humana para incapacidades de origen común y laboral y licencias de maternidad/paternidad: desde que el colaborador informa la novedad hasta que el pago se concilia y el expediente se archiva.

**Stack:** React (vistas) · Node.js + Express (controladores, servicios) · Supabase / PostgreSQL (base de datos relacional, Auth y Storage) · Claude (IA para análisis de información).

## Estructura MVC (sección 12 de la Documentación de Análisis y Diseño)

```
sigi/
├── app/
│   ├── controllers/      # Uno por módulo: Auth, Recepcion, Verificacion, Transcripcion,
│   │                     #   Cobro, Juridico, Conciliacion, Monitoreo, Archivo
│   ├── models/           # Entidades del dominio (sección 7) y enumeraciones / transiciones DE-01
│   ├── services/         # ReglasIncapacidadService, NotificacionService, DocumentoService, IaOcrService
│   ├── repositories/     # Persistencia sobre Supabase
│   ├── middleware/       # Autenticación y permisos por rol
│   ├── routes/           # Rutas REST de la API
│   └── views/            # Vistas React por módulo (layouts/ y pages/)
├── config/               # Configuración (BD, plazos del procedimiento)
├── database/
│   ├── migrations/       # 001_esquema_inicial.sql
│   └── seeders/          # Entidades EPS/ARL (tabla 5.2.1) y usuarios demo
├── public/               # Punto de entrada: build de las vistas React
├── resources/plantillas/ # Requerimiento de cobro y derecho de petición
├── storage/              # documentos/ y logs/
├── tests/unit/           # Pruebas de reglas de negocio (RN-06, documentos, DE-01)
├── docs/uml/
└── server.js
```

## Puesta en marcha

1. **Crear el proyecto en Supabase** y, en el *SQL Editor*, ejecutar en orden:
   - `database/migrations/001_esquema_inicial.sql`
   - `database/seeders/001_datos_iniciales.sql`
2. En *Storage*, crear un bucket llamado `documentos` (para los soportes escaneados).
3. Copiar `.env.example` a `.env` y completar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY`. Dejar `DEMO_MODE=true` para probar sin configurar Supabase Auth.
4. Instalar y ejecutar:

```bash
npm install
npm test                      # 12 pruebas de reglas de negocio
npm run dev                   # API en http://localhost:4000

cd app/views
npm install
npm run dev                   # Interfaz en http://localhost:5173 (desarrollo)
npm run build                 # Publica las vistas en public/ (Express las sirve en :4000)
```

En modo demo se ingresa con cualquiera de los usuarios del seeder (`auxiliar@sigi.demo`, `colaborador@sigi.demo`, `juridica@sigi.demo`, …) sin contraseña. Para producción: `DEMO_MODE=false`, crear los usuarios en Supabase Auth y guardar su id en `usuarios.auth_id`.

## Casos de uso implementados

| Módulo | Casos de uso | Controlador |
|---|---|---|
| Reporte y recepción | CU-01 informar (con detección de prórroga), CU-02 remitir soportes (extemporaneidad 2 días), CU-03 reemplazo (conflicto de fechas), CU-04/05/06 recibir (presencial / correo + IA/OCR) | `RecepcionController` |
| Verificación documental | CU-07 verificar, CU-08 formato de seguimiento con liquidación RN-06 («include»), CU-09 faltantes con plazo de 3 días hábiles y segundo llamado («extend»), CU-10 archivo digital | `VerificacionController` |
| Transcripción y radicación | CU-11/12/13 transcripción con plazos por entidad (tabla 5.2.1, prioritario ≤15 días, bloqueo si vence), CU-14 radicar + CU-15 evidencia obligatoria, CU-16 informe SG-SST | `TranscripcionController` |
| Cobro | CU-31 aceptación y fecha promesa, CU-17 solicitud de pago, CU-18 seguimiento y tablero de cartera, CU-19 requerimientos persuasivos, CU-32 registro de pago | `CobroController` |
| Cobro jurídico | CU-20 traslado y decisión, CU-22 derecho de petición (15 días hábiles), CU-23 tutela (solo si la petición fue negada o sin respuesta) | `JuridicoController` |
| Conciliación | CU-24 consignaciones, cruce de coincidencias, pagos parciales, cierre de periodo; CU-25 registro en base de datos | `ConciliacionController` |
| Monitoreo | CU-26 reporte 90/120/150/180 días acumulando prórrogas, CU-27 concepto de rehabilitación (hitos 120/150), CU-28 suspensión de pago por nómina | `MonitoreoController` |
| Archivo | CU-29 archivar pagadas (exige soporte de liquidación, destruye epicrisis), CU-30 pagadas vs. físicas | `ArchivoController` |

Cada cambio de estado se valida contra el diagrama de estados **DE-01** (`app/models/enums.js`) y queda en la tabla `bitacora`.

## Inteligencia artificial para análisis de información

`app/services/IaOcrService.js` usa la API de Claude (modelo configurable con `ANTHROPIC_MODEL`) en cuatro puntos del proceso:

| Función | Dónde se usa | Endpoint |
|---|---|---|
| Extraer datos del certificado (fechas, días, CIE-10, entidad, confianza) | CU-06 paso 4 | `POST /api/ia/extraer-certificado` |
| Preverificar soportes y resaltar inconsistencias | CU-07 (sugerencia) | `GET /api/incapacidades/:id/preverificar-ia` |
| Analizar el ausentismo mensual (hallazgos, patrones, recomendaciones) | CU-16 | `GET /api/sgsst/reporte?ia=true` |
| Predecir qué casos podrían superar 180 días | CU-26 (sugerencia) | `GET /api/ia/prediccion-180` |

Para proteger la reserva clínica, a la IA solo se envía el código CIE-10 agrupado (3 caracteres) y los registros de ausentismo van sin nombre del colaborador.

## Reglas de negocio clave (`ReglasIncapacidadService`)

- **RN-06 / 5.5.2:** días 1–2 al 100 % del IBC (empresa); días 3–90 a dos tercios del IBC (EPS); días 91–180 al 50 % (EPS); desde el día 181 el trámite pasa al fondo de pensiones. Las prórrogas aplican el tramo según los días acumulados. Licencias: 100 % a cargo de la EPS.
- **Documentos por tipo (5.1.2):** la epicrisis no se exige en enfermedad general de 2 días o menos, ni cuando la EPS ya transcribió.
- **Plazos de transcripción (5.2.1)** por entidad, con la excepción de 15 días para accidentes de tránsito en Salud Total y 30 días calendario para licencias de paternidad.
