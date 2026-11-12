# Genera documentos FICTICIOS para probar SIGI (recepción, verificación, IA y gestiones).
# Todos llevan marca de agua y pie "documento ficticio": no tienen validez alguna.
import io
import os
import random
import sys
from datetime import date, timedelta

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

SALIDA = sys.argv[1]
ANCHO, ALTO = letter
TINTA = HexColor('#1E1538')
GRIS = HexColor('#6E6987')
AVISO = 'DOCUMENTO FICTICIO GENERADO PARA PRUEBAS DEL SISTEMA SIGI · SIN VALIDEZ LEGAL NI MÉDICA'

HOY = date(2026, 11, 11)
f = lambda d: d.strftime('%Y-%m-%d')
fin = lambda ini, dias: ini + timedelta(days=dias - 1)

# Colaboradores sembrados en la base (documento = el registrado en SIGI)
CARLOS = ('Carlos Colaborador', '1001')
JORGE = ('Jorge Iván Castaño', '1010')
PAULA = ('Paula Andrea Gómez', '1011')
SANTIAGO = ('Santiago Herrera', '1012')
MARIA = ('María Fernanda Ríos', '1009')
VALENTINA = ('Valentina Ortiz Rendón', '1098765432')  # pareja de Santiago (no es colaboradora)


def ruta(*partes):
    p = os.path.join(SALIDA, *partes)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def marca(c):
    c.saveState()
    c.setFillColor(Color(0.85, 0.12, 0.1, alpha=0.10))
    c.setFont('Helvetica-Bold', 54)
    c.translate(ANCHO / 2, ALTO / 2)
    c.rotate(35)
    c.drawCentredString(0, 0, 'FICTICIO · PRUEBA SIGI')
    c.restoreState()
    c.setFillColor(HexColor('#B42318'))
    c.setFont('Helvetica-Bold', 7.5)
    c.drawCentredString(ANCHO / 2, 22, AVISO)


def pdf(path, entidad, subtitulo, titulo, numero, filas, parrafos=(), firma=None, sello=None):
    """Documento de una página: encabezado, tabla de campos, párrafos y firma."""
    c = canvas.Canvas(path, pagesize=letter)
    c.setTitle(f'{titulo} - ficticio')
    y = ALTO - 56
    c.setFillColor(TINTA)
    c.setFont('Helvetica-Bold', 16)
    c.drawString(50, y, entidad)
    c.setFont('Helvetica', 9)
    c.setFillColor(GRIS)
    c.drawString(50, y - 14, subtitulo)
    c.setFont('Helvetica-Bold', 9)
    c.drawRightString(ANCHO - 50, y, f'No. {numero}')
    c.setStrokeColor(TINTA)
    c.setLineWidth(1.2)
    c.line(50, y - 24, ANCHO - 50, y - 24)
    y -= 52
    c.setFillColor(TINTA)
    c.setFont('Helvetica-Bold', 13)
    c.drawCentredString(ANCHO / 2, y, titulo)
    y -= 26
    for etiqueta, valor in filas:
        c.setFont('Helvetica-Bold', 9.5)
        c.setFillColor(GRIS)
        c.drawString(56, y, etiqueta.upper())
        c.setFont('Helvetica', 11)
        c.setFillColor(TINTA)
        lineas = envolver(str(valor), 58)
        for i, linea in enumerate(lineas):
            c.drawString(230, y - i * 14, linea)
        y -= 14 * len(lineas) + 8
        c.setStrokeColor(HexColor('#E4E1EC'))
        c.setLineWidth(0.5)
        c.line(56, y + 4, ANCHO - 56, y + 4)
    y -= 10
    for p in parrafos:
        c.setFont('Helvetica', 10.5)
        for linea in envolver(p, 95):
            c.drawString(56, y, linea)
            y -= 14
        y -= 8
    if firma:
        y = max(y - 40, 110)
        c.setStrokeColor(TINTA)
        c.line(56, y, 260, y)
        c.setFont('Helvetica', 9.5)
        for i, linea in enumerate(firma):
            c.drawString(56, y - 13 - i * 12, linea)
    if sello:
        c.saveState()
        c.setStrokeColor(HexColor('#5537C0'))
        c.setFillColor(HexColor('#5537C0'))
        c.setLineWidth(2)
        c.translate(ANCHO - 150, 150)
        c.rotate(-12)
        c.roundRect(-75, -30, 150, 60, 8)
        c.setFont('Helvetica-Bold', 11)
        c.drawCentredString(0, 8, sello[0])
        c.setFont('Helvetica', 8.5)
        for i, linea in enumerate(sello[1:]):
            c.drawCentredString(0, -6 - i * 11, linea)
        c.restoreState()
    marca(c)
    c.showPage()
    c.save()


def envolver(texto, ancho):
    palabras, lineas, actual = texto.split(), [], ''
    for p in palabras:
        if len(actual) + len(p) + 1 > ancho:
            lineas.append(actual)
            actual = p
        else:
            actual = f'{actual} {p}'.strip()
    return lineas + [actual] if actual else lineas or ['']


def certificado(path, entidad, persona, origen, ini, dias, cie, desc, ips, medico, tipo='Inicial', numero=None, extra=()):
    pdf(path, entidad, f'Certificado expedido por {ips}', 'CERTIFICADO DE INCAPACIDAD TEMPORAL',
        numero or f'INC-{random.randint(100000, 999999)}',
        [('Paciente', persona[0]), ('Tipo y número de documento', f'CC {persona[1]}'),
         ('Origen', origen), ('Tipo de incapacidad', tipo),
         ('Fecha de inicio', f(ini)), ('Fecha de terminación', f(fin(ini, dias))), ('Días otorgados', f'{dias} ({numero_letras(dias)})'),
         ('Diagnóstico CIE-10', f'{cie} - {desc}'), ('Fecha de expedición', f(ini)), *extra],
        ['Se expide el presente certificado para fines laborales. Válido únicamente con la firma del profesional tratante.'],
        firma=[medico, 'Médico tratante · Registro médico 00-00000 (ficticio)'])


def numero_letras(n):
    return {2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 10: 'diez', 14: 'catorce', 15: 'quince', 20: 'veinte', 30: 'treinta', 126: 'ciento veintiséis'}.get(n, str(n))


def epicrisis(path, entidad, persona, ingreso, motivo, hallazgos, plan, dias, cie, extra=''):
    pdf(path, entidad, 'Resumen de atención · Información clínica reservada', 'EPICRISIS',
        f'EPI-{random.randint(10000, 99999)}',
        [('Paciente', persona[0]), ('Documento', f'CC {persona[1]}'), ('Fecha de ingreso', f(ingreso)),
         ('Fecha de egreso', f(ingreso)), ('Diagnóstico principal', cie)],
        [f'Motivo de consulta: {motivo}', f'Hallazgos: {hallazgos}', f'Plan: {plan} Se otorga incapacidad por {dias} días.', extra],
        firma=['Dra. Laura Méndez Ficticia', 'Medicina general · Reg. 00-11111 (ficticio)'])


# ---------------------------------------------------------------- escenarios
random.seed(2026)

# 01 · Enfermedad general (Carlos, Salud Total, 5 días) - camino feliz
i1 = date(2026, 11, 10)
certificado(ruta('01_enfermedad_general_carlos', 'certificado_incapacidad.pdf'), 'SALUD TOTAL EPS-S', CARLOS,
            'Enfermedad general', i1, 5, 'J06.9', 'Infección aguda de las vías respiratorias superiores',
            'IPS Clínica Ficticia del Café', 'Dr. Andrés Ficticio Zuluaga', numero='ST-2026-458812')
epicrisis(ruta('01_enfermedad_general_carlos', 'epicrisis.pdf'), 'IPS CLÍNICA FICTICIA DEL CAFÉ', CARLOS, i1,
          'Fiebre, odinofagia y malestar general de 3 días de evolución.', 'Faringe eritematosa, sin signos de alarma.',
          'Manejo sintomático, hidratación y reposo.', 5, 'J06.9')

# 02 · Accidente de tránsito (Jorge, Salud Total: plazo de transcripción 15 días)
i2 = date(2026, 11, 3)
certificado(ruta('02_accidente_transito_jorge', 'certificado_incapacidad.pdf'), 'SALUD TOTAL EPS-S', JORGE,
            'Accidente de tránsito', i2, 15, 'S82.2', 'Fractura de la diáfisis de la tibia',
            'IPS Hospital Ficticio San Rafael', 'Dr. Camilo Ficticio Ríos', numero='ST-2026-459931')
epicrisis(ruta('02_accidente_transito_jorge', 'epicrisis.pdf'), 'IPS HOSPITAL FICTICIO SAN RAFAEL', JORGE, i2,
          'Paciente conductor de motocicleta, colisión con vehículo particular.', 'Dolor y deformidad en pierna derecha. Radiografía con fractura de tibia.',
          'Inmovilización, analgesia y control por ortopedia.', 15, 'S82.2')
pdf(ruta('02_accidente_transito_jorge', 'furips.pdf'), 'FORMULARIO ÚNICO DE RECLAMACIÓN (FURIPS)',
    'Reclamación de IPS por atención a víctima de accidente de tránsito', 'FURIPS · DATOS DEL ACCIDENTE', 'FUR-2026-77120',
    [('Víctima', JORGE[0]), ('Documento', f'CC {JORGE[1]}'), ('Fecha del accidente', f(i2)),
     ('Lugar', 'Avenida 30 de Agosto, Pereira (ficticio)'), ('Vehículo involucrado', 'Motocicleta placa FIC12A'),
     ('Póliza SOAT', '000-PRUEBA-0001 (ficticia)'), ('IPS que atendió', 'IPS Hospital Ficticio San Rafael'),
     ('Condición de la víctima', 'Conductor')],
    firma=['Representante legal IPS (ficticio)'])

# 03 · Licencia de maternidad (Paula, Sanitas, 126 días)
i3 = date(2026, 11, 8)
certificado(ruta('03_licencia_maternidad_paula', 'certificado_licencia.pdf'), 'EPS SANITAS', PAULA,
            'Licencia de maternidad', i3, 126, 'O80', 'Parto único espontáneo', 'IPS Clínica Ficticia Los Rosales',
            'Dra. Natalia Ficticia Gómez', tipo='Licencia de maternidad', numero='SAN-LM-2026-1188')
epicrisis(ruta('03_licencia_maternidad_paula', 'epicrisis_parto.pdf'), 'IPS CLÍNICA FICTICIA LOS ROSALES', PAULA, i3,
          'Gestante de 39 semanas en trabajo de parto.', 'Parto vaginal sin complicaciones. Recién nacido vivo, sexo femenino, 3.150 g.',
          'Egreso en buenas condiciones, controles posparto.', 126, 'O80', 'Semanas de gestación al momento del parto: 39.')
pdf(ruta('03_licencia_maternidad_paula', 'certificado_nacido_vivo.pdf'), 'CERTIFICADO DE NACIDO VIVO',
    'Antecedente para el registro civil de nacimiento', 'CERTIFICADO DE NACIDO VIVO', 'NV-2026-00042 (ficticio)',
    [('Nombre de la madre', PAULA[0]), ('Documento de la madre', f'CC {PAULA[1]}'), ('Fecha de nacimiento', f(i3)),
     ('Hora', '04:35'), ('Sexo', 'Femenino'), ('Peso al nacer', '3.150 g'), ('Talla', '50 cm'),
     ('Semanas de gestación', '39'), ('Institución', 'IPS Clínica Ficticia Los Rosales · Pereira')],
    firma=['Dra. Natalia Ficticia Gómez', 'Médica que certifica'])
pdf(ruta('03_licencia_maternidad_paula', 'registro_civil.pdf'), 'REGISTRO CIVIL DE NACIMIENTO (COPIA FICTICIA)',
    'Notaría Ficticia Primera de Pereira', 'REGISTRO CIVIL DE NACIMIENTO', 'Indicativo serial 00000001 (ficticio)',
    [('Inscrito', 'Sofía Gómez Ficticia'), ('NUIP', '0000000001 (ficticio)'), ('Fecha de nacimiento', f(i3)),
     ('Lugar de nacimiento', 'Pereira, Risaralda'), ('Madre', f'{PAULA[0]} · CC {PAULA[1]}'),
     ('Padre', 'Julián Ficticio Pérez · CC 0000000002'), ('Fecha de inscripción', f(i3 + timedelta(days=2)))],
    firma=['Notario ficticio'])
pdf(ruta('03_licencia_maternidad_paula', 'documento_identidad.pdf'), 'COPIA DE DOCUMENTO DE IDENTIDAD (FICTICIA)',
    'Fotocopia simulada para pruebas', 'DOCUMENTO DE IDENTIDAD', f'CC {PAULA[1]}',
    [('Nombres', 'Paula Andrea'), ('Apellidos', 'Gómez'), ('Número', PAULA[1]), ('Fecha de nacimiento', '1994-03-12'),
     ('Lugar de expedición', 'Pereira')])

# 04 · Licencia de paternidad (Santiago, SOS, 14 días; documentos de la madre)
i4 = date(2026, 11, 6)
epicrisis(ruta('04_licencia_paternidad_santiago', 'epicrisis_parto_madre.pdf'), 'IPS CLÍNICA FICTICIA COMFAMILIAR', VALENTINA, i4,
          'Gestante de 38 semanas, cesárea programada.', 'Cesárea sin complicaciones. Recién nacido vivo, sexo masculino, 3.020 g.',
          'Egreso con controles posparto.', 14, 'O82', f'Padre del recién nacido: {SANTIAGO[0]}, CC {SANTIAGO[1]}. Semanas de gestación: 38.')
pdf(ruta('04_licencia_paternidad_santiago', 'certificado_nacido_vivo.pdf'), 'CERTIFICADO DE NACIDO VIVO',
    'Antecedente para el registro civil de nacimiento', 'CERTIFICADO DE NACIDO VIVO', 'NV-2026-00057 (ficticio)',
    [('Nombre de la madre', VALENTINA[0]), ('Documento de la madre', f'CC {VALENTINA[1]}'), ('Padre', f'{SANTIAGO[0]} · CC {SANTIAGO[1]}'),
     ('Fecha de nacimiento', f(i4)), ('Sexo', 'Masculino'), ('Peso al nacer', '3.020 g'), ('Semanas de gestación', '38')],
    firma=['Médico que certifica (ficticio)'])
pdf(ruta('04_licencia_paternidad_santiago', 'registro_civil.pdf'), 'REGISTRO CIVIL DE NACIMIENTO (COPIA FICTICIA)',
    'Notaría Ficticia Segunda de Dosquebradas', 'REGISTRO CIVIL DE NACIMIENTO', 'Indicativo serial 00000002 (ficticio)',
    [('Inscrito', 'Tomás Herrera Ortiz'), ('NUIP', '0000000003 (ficticio)'), ('Fecha de nacimiento', f(i4)),
     ('Madre', f'{VALENTINA[0]} · CC {VALENTINA[1]}'), ('Padre', f'{SANTIAGO[0]} · CC {SANTIAGO[1]}')],
    firma=['Notario ficticio'])
pdf(ruta('04_licencia_paternidad_santiago', 'documento_identidad_madre.pdf'), 'COPIA DE DOCUMENTO DE IDENTIDAD (FICTICIA)',
    'Fotocopia simulada para pruebas', 'DOCUMENTO DE IDENTIDAD DE LA MADRE', f'CC {VALENTINA[1]}',
    [('Nombres', 'Valentina'), ('Apellidos', 'Ortiz Rendón'), ('Número', VALENTINA[1]), ('Fecha de nacimiento', '1996-07-21')])

# 05 · Accidente laboral (María, ARL SURA, 10 días)
i5 = date(2026, 11, 9)
certificado(ruta('05_accidente_laboral_maria', 'certificado_incapacidad_arl.pdf'), 'ARL SURA', MARIA,
            'Accidente de trabajo', i5, 10, 'S61.0', 'Herida de dedo de la mano sin daño de la uña',
            'IPS Ficticia Salud Ocupacional', 'Dr. Felipe Ficticio Arango', numero='ARL-2026-90311',
            extra=[('Reporte FURAT', 'FURAT-2026-5521 (ficticio)')])
epicrisis(ruta('05_accidente_laboral_maria', 'epicrisis.pdf'), 'IPS FICTICIA SALUD OCUPACIONAL', MARIA, i5,
          'Herida cortante en mano izquierda con material de empaque durante la jornada laboral.', 'Herida de 3 cm en dedo índice, sin compromiso tendinoso.',
          'Sutura, curaciones y control en 7 días.', 10, 'S61.0')

# 06 · Prórroga del caso 01 (Carlos, empieza el día siguiente al fin del caso 01)
i6 = fin(i1, 5) + timedelta(days=1)
certificado(ruta('06_prorroga_carlos', 'certificado_prorroga.pdf'), 'SALUD TOTAL EPS-S', CARLOS,
            'Enfermedad general', i6, 10, 'J18.9', 'Neumonía, no especificada', 'IPS Clínica Ficticia del Café',
            'Dr. Andrés Ficticio Zuluaga', tipo='Prórroga', numero='ST-2026-460107',
            extra=[('Certificado anterior', 'ST-2026-458812')])
epicrisis(ruta('06_prorroga_carlos', 'epicrisis.pdf'), 'IPS CLÍNICA FICTICIA DEL CAFÉ', CARLOS, i6,
          'Persistencia de fiebre y tos productiva.', 'Radiografía de tórax con consolidación basal derecha.',
          'Antibiótico oral y control en 10 días.', 10, 'J18.9')

# 07 · Casos con errores
# a) El nombre no corresponde al colaborador del caso (subir en un caso de Carlos)
certificado(ruta('07_casos_con_errores', 'a_certificado_de_otra_persona.pdf'), 'SALUD TOTAL EPS-S', ('Pedro Ficticio Salazar', '7654321'),
            'Enfermedad general', i1, 5, 'A09', 'Diarrea y gastroenteritis de presunto origen infeccioso',
            'IPS Clínica Ficticia del Café', 'Dr. Andrés Ficticio Zuluaga', numero='ST-2026-458999')
# b) Fechas incoherentes: dice 3 días pero la terminación implica 8
pdf(ruta('07_casos_con_errores', 'b_certificado_fechas_incoherentes.pdf'), 'NUEVA EPS', 'Certificado expedido por IPS Ficticia Centro',
    'CERTIFICADO DE INCAPACIDAD TEMPORAL', 'NEPS-2026-33001',
    [('Paciente', MARIA[0]), ('Tipo y número de documento', f'CC {MARIA[1]}'), ('Origen', 'Enfermedad general'),
     ('Fecha de inicio', f(date(2026, 11, 2))), ('Fecha de terminación', f(date(2026, 11, 9))), ('Días otorgados', '3 (tres)'),
     ('Diagnóstico CIE-10', 'M54.5 - Lumbago no especificado')],
    firma=['Dr. Ficticio Centro'])

# c) Certificado escaneado: PDF que es solo imagen (sin capa de texto) y d) foto del certificado
def imagen_certificado(persona, entidad, ini, dias, cie, numero):
    img = Image.new('RGB', (1275, 1650), '#FDFCF8')
    d = ImageDraw.Draw(img)
    fuente = lambda t, b=False: ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf' if b else 'C:/Windows/Fonts/arial.ttf', t)
    d.text((80, 80), entidad, fill='#1E1538', font=fuente(44, True))
    d.text((80, 140), 'CERTIFICADO DE INCAPACIDAD TEMPORAL', fill='#1E1538', font=fuente(34, True))
    d.text((900, 90), f'No. {numero}', fill='#333', font=fuente(26, True))
    d.line((80, 200, 1195, 200), fill='#1E1538', width=4)
    filas = [('Paciente', persona[0]), ('Documento', f'CC {persona[1]}'), ('Origen', 'Enfermedad general'),
             ('Fecha de inicio', f(ini)), ('Fecha de terminación', f(fin(ini, dias))), ('Días otorgados', str(dias)),
             ('Diagnóstico CIE-10', cie), ('IPS', 'IPS Ficticia Centro Médico')]
    y = 260
    for k, v in filas:
        d.text((90, y), k.upper(), fill='#6E6987', font=fuente(24, True))
        d.text((520, y), v, fill='#111', font=fuente(30))
        y += 80
    d.line((90, 1250, 560, 1250), fill='#111', width=2)
    d.text((90, 1265), 'Dr. Ficticio Centro · Médico tratante', fill='#111', font=fuente(24))
    d.text((90, 1560), AVISO, fill='#B42318', font=fuente(18, True))
    marca_img = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(marca_img).text((120, 760), 'FICTICIO · PRUEBA SIGI', fill=(200, 30, 20, 40), font=fuente(84, True))
    img = Image.alpha_composite(img.convert('RGBA'), marca_img.rotate(30, center=(640, 820))).convert('RGB')
    return img

esc = imagen_certificado(MARIA, 'NUEVA EPS', date(2026, 11, 10), 4, 'K29.7 - Gastritis no especificada', 'NEPS-2026-33017')
esc = esc.convert('L').filter(ImageFilter.GaussianBlur(0.6)).convert('RGB')  # aspecto de escáner
esc.save(ruta('07_casos_con_errores', 'c_certificado_escaneado_sin_texto.pdf'), 'PDF', resolution=150)

foto = imagen_certificado(JORGE, 'SALUD TOTAL EPS-S', date(2026, 11, 10), 3, 'H10.9 - Conjuntivitis no especificada', 'ST-2026-461200')
lienzo = Image.new('RGB', (1500, 1900), '#8A7F70')  # mesa
lienzo.paste(foto.rotate(4, expand=True, fillcolor='#8A7F70'), (60, 60))
ruido = Image.effect_noise(lienzo.size, 18).convert('RGB')
Image.blend(lienzo, ruido, 0.06).filter(ImageFilter.GaussianBlur(0.8)).save(
    ruta('07_casos_con_errores', 'd_foto_certificado_celular.jpg'), 'JPEG', quality=82)

# e) No es un certificado (factura)
pdf(ruta('07_casos_con_errores', 'e_no_es_certificado_factura.pdf'), 'RESTAURANTE FICTICIO EL MIRADOR', 'NIT 000.000.000-0 (ficticio)',
    'FACTURA DE VENTA', 'FV-000123',
    [('Cliente', 'Consumidor final'), ('Fecha', f(HOY)), ('Bandeja paisa x2', '$ 64.000'), ('Limonada x2', '$ 12.000'), ('Total', '$ 76.000')])

# f) PDF dañado
buf = io.BytesIO()
c = canvas.Canvas(buf, pagesize=letter)
c.drawString(100, 700, 'Certificado incompleto')
c.save()
datos = buf.getvalue()
with open(ruta('07_casos_con_errores', 'f_pdf_danado.pdf'), 'wb') as fh:
    fh.write(datos[: len(datos) // 3])

# 08 · Evidencias de gestión (para transcribir, radicar, solicitar pago, requerimientos y pago)
ev = lambda nombre: ruta('08_evidencias_gestion', nombre)
pdf(ev('constancia_transcripcion_portal.pdf'), 'SALUD TOTAL EPS-S · PORTAL EMPRESAS', 'Constancia generada por el portal (simulada)',
    'CONSTANCIA DE TRANSCRIPCIÓN', 'TR-2026-0099812',
    [('Empresa', 'Empresa Ficticia S.A.S.'), ('Cotizante', f'{CARLOS[0]} · CC {CARLOS[1]}'), ('Certificado', 'ST-2026-458812'),
     ('Fecha de transcripción', f(HOY)), ('Estado', 'Transcrita - en verificación')])
pdf(ev('radicado_sellado.pdf'), 'SALUD TOTAL EPS-S · OFICINA PEREIRA', 'Copia de radicación física (simulada)',
    'RADICACIÓN DE INCAPACIDAD', 'RAD-2026-554410',
    [('Radicado por', 'Empresa Ficticia S.A.S.'), ('Cotizante', f'{CARLOS[0]} · CC {CARLOS[1]}'), ('Documentos', 'Certificado, epicrisis, formato de la entidad'),
     ('Fecha y hora', f'{f(HOY)} 10:42'), ('Funcionario que recibe', 'Funcionaria ficticia ventanilla 3')],
    sello=('RECIBIDO', f(HOY), 'Ventanilla 3 · ficticio'))
pdf(ev('constancia_solicitud_pago.pdf'), 'SALUD TOTAL EPS-S · PRESTACIONES ECONÓMICAS', 'Formulario de solicitud de pago (simulado)',
    'SOLICITUD DE PAGO DE PRESTACIONES ECONÓMICAS', 'SPE-2026-77310',
    [('Aportante', 'Empresa Ficticia S.A.S.'), ('Cotizante', f'{CARLOS[0]} · CC {CARLOS[1]}'), ('Certificado', 'ST-2026-458812'),
     ('Días a cargo de la EPS', '3'), ('Valor solicitado', '$ 166.667'), ('Cuenta para el pago', 'Ahorros 000-000000-00 (ficticia)'),
     ('Fecha de envío', f(HOY))])
pdf(ev('soporte_liquidacion_pago.pdf'), 'SALUD TOTAL EPS-S · TESORERÍA', 'Soporte de liquidación y pago (simulado)',
    'SOPORTE DE LIQUIDACIÓN DE INCAPACIDAD', 'LIQ-2026-120044',
    [('Beneficiario del pago', 'Empresa Ficticia S.A.S.'), ('Cotizante', f'{CARLOS[0]} · CC {CARLOS[1]}'), ('Certificado', 'ST-2026-458812'),
     ('Periodo liquidado', f'{f(i1 + timedelta(days=2))} a {f(fin(i1, 5))}'), ('Días pagados', '3'),
     ('IBC', '$ 2.500.000'), ('Porcentaje', '66,67 %'), ('Valor pagado', '$ 166.667'), ('Fecha de transferencia', f(HOY))])
pdf(ev('acuse_requerimiento_cobro.pdf'), 'SALUD TOTAL EPS-S · CORRESPONDENCIA', 'Acuse de recibo (simulado)',
    'ACUSE DE RECIBO DE REQUERIMIENTO', 'COR-2026-88112',
    [('Remitente', 'Empresa Ficticia S.A.S. · Administración de Personal'), ('Asunto', 'Requerimiento de pago de prestaciones económicas'),
     ('Fecha de recibo', f(HOY))], sello=('RECIBIDO', f(HOY), 'Correspondencia · ficticio'))

print('Listo:', SALIDA)
