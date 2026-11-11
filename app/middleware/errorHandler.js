// Manejador central de errores
export function manejadorErrores(err, _req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error('[SIGI error]', err);
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
}
