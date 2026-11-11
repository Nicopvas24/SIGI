// Manejador central de errores
export function manejadorErrores(err, _req, res, _next) {
  if (err.name === 'MulterError') {
    const mensaje = err.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo supera el tamaño máximo de 10 MB.'
      : `No se pudo recibir el archivo (${err.code}).`;
    return res.status(400).json({ error: mensaje });
  }
  const status = err.status || 500;
  if (!err.status) console.error('[SIGI error]', err);
  res.status(status).json({
    error: status >= 500 && !err.status ? 'Ocurrió un error interno. Intente de nuevo o contacte al administrador.' : err.message,
  });
}
