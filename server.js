require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path    = require('path');

const authRoutes        = require('./routes/auth');
const dashboardRoutes   = require('./routes/dashboard');
const webhookRoutes     = require('./routes/webhook');
const buscaphoneRoutes  = require('./routes/buscaphone');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'listas-buscaphone-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 8 }, // 8 horas
}));

// ── Auth middleware ────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  res.redirect('/');
}

// ── Rotas públicas ─────────────────────────────────────────────────────────
app.use('/auth',        authRoutes);
app.use('/webhook',     webhookRoutes);       // POST /webhook/zapster (sem auth)
app.use('/buscaphone',  buscaphoneRoutes);    // POST /buscaphone/receber (rota receptora de teste)

// ── Rotas protegidas ───────────────────────────────────────────────────────
app.use('/api',         dashboardRoutes);
app.use('/api/buscaphone', buscaphoneRoutes); // GET /api/buscaphone/preview/:id, POST /api/buscaphone/send/:id

// ── Páginas ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session?.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Listas BuscaPhone rodando em http://localhost:${PORT}`);
  console.log(`  Webhook:   POST http://localhost:${PORT}/webhook/zapster`);
  console.log(`  Dashboard: http://localhost:${PORT}/dashboard\n`);
});
