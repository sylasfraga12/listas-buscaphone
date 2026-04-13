const express = require('express');
const router = express.Router();

// Credenciais temporárias (será substituído por banco de dados)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@buscaphone.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.user = { email, role: 'admin' };
    return res.json({ success: true });
  }

  return res.status(401).json({ success: false, message: 'E-mail ou senha inválidos.' });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
