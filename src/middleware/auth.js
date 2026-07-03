// src/middleware/auth.js

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ ok: false, errors: ['Please log in.'] });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).json({ ok: false, errors: ['Admin access required.'] });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
