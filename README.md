# SIGI – Sistema Integral de Gestión de Incapacidades

Sistema para llevar el procedimiento de Gestión Humana de incapacidades de origen común y laboral y de licencias de maternidad y paternidad. Cubre el reporte del colaborador, la verificación de soportes, la transcripción ante la EPS o ARL, el cobro, la conciliación del pago y el archivo del expediente.

**Tecnologías:** React para las vistas, Node.js con Express para la API, Supabase (PostgreSQL, Auth y Storage) para los datos y la IA de OVHcloud (gratuita) o Google Gemini para leer documentos.

## Estructura del proyecto (MVC)

```
sigi/
├── app/
│   ├── controllers/      # Uno por módulo: Auth, Recepcion, Verificacion, Transcripcion,
│   │                     #   Cobro, Juridico, Conciliacion, Monitoreo, Archivo
│   ├── models/           # Entidades, estados y transiciones permitidas
│   ├── services/         # ReglasIncapacidadService, NotificacionService, DocumentoService, IaOcrService
│   ├── repositories/     # Persistencia sobre Supabase
│   ├── middleware/       # Autenticación y permisos por rol
│   ├── routes/           # Rutas REST de la API
│   └── views/            # Vistas React por módulo (layouts/ y pages/)
├── config/               # Configuración (BD, plazos del procedimiento)
├── database/
│   ├── migrations/       # 001_esquema_inicial.sql
│   └── seeders/          # EPS, ARL y usuarios de prueba
├── public/               # Punto de entrada: build de las vistas React
├── resources/plantillas/ # Requerimiento de cobro y derecho de petición
├── storage/              # documentos/ y logs/
├── tests/unit/           # Pruebas de las reglas de negocio
├── docs/uml/
└── server.js
```

## Puesta en marcha

1. Configurar Supabase. Crear un token personal en <https://supabase.com/dashboard/account/tokens> y ejecutar:
   ```bash
   SUPABASE_ACCESS_TOKEN=sbp_... npm run db:setup -- <project-ref>
   ```
   El script aplica `database/migrations/*.sql` y `database/seeders/*.sql` (cada uno una sola vez, registrado en `_sigi_migraciones`), crea el bucket privado `documentos`, activa RLS en todas las tablas y escribe `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en `.env`. El token no se guarda.
   *(Alternativa manual: ejecutar los `.sql` en orden en el SQL Editor y copiar `.env.example` a `.env`.)*
2. IA: `IA_PROVEEDOR=ovh` (valor por defecto en `.env.example`) usa modelos gratuitos de OVHcloud sin clave ni registro. Para usar Google Gemini: `IA_PROVEEDOR=gemini` y `GEMINI_API_KEY` (gratis en https://aistudio.google.com/apikey). Con `IA_PROVEEDOR` vacío el sistema funciona sin IA y esas funciones aparecen como "sin configurar". `GET /api/salud` indica `"ia": "activa"` o `"pendiente"`. Dejar `DEMO_MODE=true` para probar sin configurar Supabase Auth.
3. Instalar y ejecutar:

```bash
npm install
npm test                      # 12 pruebas de reglas de negocio
npm run dev                   # API en http://localhost:4000

cd app/views
npm install
npm run dev                   # Interfaz en http://localhost:5173 (desarrollo)
npm run build                 # Publica las vistas en public/ (Express las sirve en :4000)
```

Los usuarios de prueba (`auxiliar@sigi.demo`, `colaborador@sigi.demo`, `juridica@sigi.demo`, `admin@sigi.demo`, etc.) entran con la contraseña `Sigi2026!`. Con `DEMO_MODE=true` el servidor no valida la contraseña; para producción se pone `DEMO_MODE=false`. Los usuarios nuevos se crean desde el menú **Usuarios** del administrador.

## Módulos

| Módulo | Qué hace | Controlador |
|---|---|---|
| Reporte y recepción | El colaborador o su líder informan la incapacidad (detecta prórrogas), se adjuntan los soportes y se registra su recepción. | `RecepcionController` |
| Verificación | Revisión de soportes, formato de seguimiento con la liquidación y aviso de documentos faltantes (3 días hábiles). | `VerificacionController` |
| Transcripción y radicación | Trámite ante cada entidad con su plazo, evidencia obligatoria y reporte mensual de ausentismo al SG-SST. | `TranscripcionController` |
| Cobro | Respuesta de la entidad, solicitud de pago, seguimiento, requerimientos y registro del pago. | `CobroController` |
| Cobro jurídico | Decisión de recuperar o dar de baja, derecho de petición (15 días hábiles) y tutela. | `JuridicoController` |
| Conciliación | Cruce de las consignaciones de cada entidad con los casos cobrados y cierre del periodo. | `ConciliacionController` |
| Monitoreo | Casos que pasan de 90, 120, 150 y 180 días sumando prórrogas, concepto de rehabilitación y suspensión de pago por nómina. | `MonitoreoController` |
| Archivo | Soporte de liquidación, cruce con los expedientes físicos y transferencia a Gestión Documental. | `ArchivoController` |
| Usuarios | Creación, edición, desactivación y eliminación de cuentas (solo administrador). | `UsuarioController` |

Cada cambio de estado se valida contra el diagrama de estados (`app/models/enums.js`) y queda registrado en la tabla `bitacora`.

## Inteligencia artificial para análisis de información

`app/services/IaOcrService.js` admite dos proveedores (variable `IA_PROVEEDOR`):

| Proveedor | Costo y acceso | Modelos | Límite |
|---|---|---|---|
| `ovh` (OVHcloud AI Endpoints) | Gratuito, **sin clave** | Mistral Small 3.2 (texto) y Qwen2.5-VL 72B (documentos con imagen); configurables con `OVH_AI_MODELO` y `OVH_AI_MODELO_VISION` | unas 2 solicitudes por minuto; si se llega al límite, reintenta una vez tras 1 s. `OVH_AI_KEY` (opcional) sube el límite |
| `gemini` (Google Gemini) | Gratuito con `GEMINI_API_KEY` | `GEMINI_MODEL` (por defecto `gemini-flash-latest`) | Cuota gratuita de Google |

Con OVHcloud, los PDF se envían como texto extraído (`unpdf`); si el PDF es escaneado, sus dos primeras páginas se convierten en imagen. Las fotos se reducen a 1600 px.

OVHcloud limita el acceso sin clave con un cupo anual. Cuando se agota, SIGI pasa solo a **Pollinations** (gratuito, sin clave, una respuesta cada 45 s por IP), que lee textos y PDF con texto pero no fotos ni PDF escaneados. Para no depender de cupos gratuitos, configure `IA_PROVEEDOR=gemini` con una `GEMINI_API_KEY`.

| Función | Dónde se usa | Endpoint |
|---|---|---|
| Leer un certificado (PDF o imagen) y proponer los datos del caso | Recepción | `POST /api/ia/leer-certificado` |
| Analizar los soportes digitales de un caso (tipo, legibilidad, coherencia) | Verificación | `POST /api/ia/analizar-soportes/:id` |
| Resumir el historial de incapacidades de un colaborador | Colaboradores | `POST /api/ia/resumen-colaborador/:id` |
| Analizar el ausentismo mensual | Reporte SG-SST | `GET /api/sgsst/reporte?ia=true` |
| Predecir qué casos podrían superar 180 días | Monitoreo | `POST /api/ia/prediccion-180` |

Reserva clínica: las epicrisis no se envían a la IA, a los análisis solo va el código CIE-10 agrupado y los registros de ausentismo van sin nombre. Los certificados y soportes sí contienen datos personales: antes de usar datos reales, revisen los términos del proveedor elegido (Ley 1581 de 2012, los datos de salud son datos sensibles).

## Reglas de negocio (`ReglasIncapacidadService`)

- Liquidación: los días 1 y 2 los paga la empresa al 100 % del IBC; del día 3 al 90 la EPS paga dos tercios del IBC y del 91 al 180, el 50 %. Desde el día 181 el trámite pasa al fondo de pensiones. En las prórrogas el porcentaje depende de los días acumulados. Las licencias las paga la EPS al 100 %.
- Documentos: la epicrisis no se pide en enfermedad general de 2 días o menos, ni cuando la EPS ya hizo la transcripción.
- Plazos de transcripción: cada entidad tiene el suyo. Las excepciones son 15 días para accidentes de tránsito en Salud Total y 30 días calendario para licencias de paternidad.
