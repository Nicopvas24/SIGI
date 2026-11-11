// Autorización por rol (actores de la sección 2). ADMIN siempre pasa.
export function permitirRoles(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
    if (req.usuario.rol === 'ADMIN' || roles.includes(req.usuario.rol)) return next();
    return res.status(403).json({
      error: `Acceso denegado. Rol requerido: ${roles.join(' o ')}. Rol actual: ${req.usuario.rol}`,
    });
  };
}
