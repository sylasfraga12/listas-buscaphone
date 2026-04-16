const express = require('express');
const router = express.Router();
const db = require('../database/db');

function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  res.status(401).json({ error: 'Não autorizado' });
}

// ── GET /api/stats ─────────────────────────────────────
router.get('/stats', requireAuth, (req, res) => {
  const totalProcessed = db.prepare(`
    SELECT COUNT(*) as count FROM processed_messages WHERE error IS NULL
  `).get();

  const costStats = db.prepare(`
    SELECT
      COALESCE(SUM(cost_usd), 0)  as total_cost,
      COALESCE(AVG(cost_usd), 0)  as avg_cost
    FROM processed_messages WHERE error IS NULL
  `).get();

  const totalGroups = db.prepare(`
    SELECT COUNT(*) as count FROM groups
  `).get();

  const todayMessages = db.prepare(`
    SELECT COUNT(*) as count FROM messages
    WHERE date(received_at) = date('now')
  `).get();

  const errorsToday = db.prepare(`
    SELECT COUNT(*) as count FROM processed_messages
    WHERE error IS NOT NULL AND date(processed_at) = date('now')
  `).get();

  res.json({
    total_processed: totalProcessed.count,
    total_cost_usd:  costStats.total_cost,
    avg_cost_usd:    costStats.avg_cost,
    total_groups:    totalGroups.count,
    today_messages:  todayMessages.count,
    errors_today:    errorsToday.count,
  });
});

// ── GET /api/logs ──────────────────────────────────────
router.get('/logs', requireAuth, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const service = req.query.service || null;

  let query = `
    SELECT id, service, direction, method, endpoint, status_code,
           duration_ms, success, error_msg, created_at
    FROM api_logs
  `;
  const params = [];
  if (service) { query += ' WHERE service = ?'; params.push(service); }
  query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const logs  = db.prepare(query).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as c FROM api_logs${service ? ' WHERE service = ?' : ''}`).get(...(service ? [service] : []));

  res.json({ logs, total: total.c });
});

// ── GET /api/logs/:id ──────────────────────────────────
router.get('/logs/:id', requireAuth, (req, res) => {
  const entry = db.prepare('SELECT * FROM api_logs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Log não encontrado' });
  res.json(entry);
});

// ── GET /api/logs/:id/message ──────────────────────────
router.get('/logs/:id/message', requireAuth, (req, res) => {
  const entry = db.prepare('SELECT * FROM api_logs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Log não encontrado' });

  let eventId;
  try { eventId = JSON.parse(entry.request_body)?.event_id; } catch {}
  if (!eventId) return res.status(404).json({ error: 'Este log não tem event_id associado' });

  const row = db.prepare(`
    SELECT m.content, m.sender_name, m.sender_phone, m.group_name, m.sent_at,
           pm.processed_text, pm.input_tokens, pm.output_tokens, pm.cost_usd, pm.error
    FROM messages m
    LEFT JOIN processed_messages pm ON pm.message_id = m.id
    WHERE m.event_id = ?
    ORDER BY pm.id DESC LIMIT 1
  `).get(eventId);

  if (!row) return res.status(404).json({ error: 'Mensagem não encontrada no banco' });
  res.json(row);
});

// ── GET /api/processed ─────────────────────────────────
router.get('/processed', requireAuth, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  const items = db.prepare(`
    SELECT
      pm.id, pm.message_id, pm.original_text, pm.processed_text,
      pm.input_tokens, pm.output_tokens, pm.cost_usd,
      pm.processed_at, pm.sent_to_buscaphone, pm.buscaphone_status,
      pm.error,
      m.group_name, m.group_type, m.is_community,
      m.sender_name, m.sender_phone, m.sent_at
    FROM processed_messages pm
    LEFT JOIN messages m ON m.id = pm.message_id
    ORDER BY pm.id DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as c FROM processed_messages').get();

  res.json({ items, total: total.c });
});

// ── GET /api/groups ────────────────────────────────────
router.get('/groups', requireAuth, (req, res) => {
  const groups = db.prepare(`
    SELECT g.*, COUNT(m.id) as message_count
    FROM groups g
    LEFT JOIN messages m ON m.group_id = g.group_id
    GROUP BY g.id
    ORDER BY g.last_msg_at DESC
  `).all();
  res.json({ groups });
});

// ── GET /api/settings ──────────────────────────────────
router.get('/settings', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

// ── POST /api/settings ──────────────────────────────────
router.post('/settings', requireAuth, (req, res) => {
  const allowed = ['buscaphone_url', 'buscaphone_token', 'auto_send'];
  const update  = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  for (const [key, value] of Object.entries(req.body)) {
    if (allowed.includes(key)) update.run(key, String(value));
  }
  res.json({ success: true });
});

module.exports = router;
