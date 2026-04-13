const express = require('express');
const router  = express.Router();
const db      = require('../database/db');
const { log } = require('../services/logger');

// ── Rota receptora (lado BuscaPhone — para testes) ────────────────────────
// POST /buscaphone/receber
router.post('/receber', (req, res) => {
  const payload = req.body;

  log({
    service:      'buscaphone',
    direction:    'inbound',
    method:       'POST',
    endpoint:     '/buscaphone/receber',
    status_code:  200,
    request_body: {
      processed_id:   payload?.origem?.processed_id,
      grupo:          payload?.origem?.grupo,
      fornecedor:     payload?.origem?.fornecedor,
      total_produtos: payload?.total_produtos,
    },
    success: true,
  });

  console.log(`[buscaphone] ✓ Recebido | processed_id: ${payload?.origem?.processed_id} | ${payload?.total_produtos} produtos`);

  return res.json({
    success:        true,
    message:        'Lista recebida com sucesso',
    processed_id:   payload?.origem?.processed_id,
    total_produtos: payload?.total_produtos,
    recebido_em:    new Date().toISOString(),
  });
});

// ── GET /api/buscaphone/preview/:id — Visualizar payload antes de enviar
router.get('/preview/:id', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Não autorizado' });

  const { buildPayload } = require('../services/buscaphone');

  const row = db.prepare(`
    SELECT pm.*, m.group_name, m.sender_name, m.sender_phone, m.sent_at
    FROM processed_messages pm
    LEFT JOIN messages m ON m.id = pm.message_id
    WHERE pm.id = ?
  `).get(req.params.id);

  if (!row) return res.status(404).json({ error: 'Não encontrado' });
  if (!row.processed_text) return res.status(400).json({ error: 'Mensagem sem resultado processado' });

  const payload = buildPayload({
    processedId:   row.id,
    groupName:     row.group_name,
    senderName:    row.sender_name,
    senderPhone:   row.sender_phone,
    sentAt:        row.sent_at,
    processedText: row.processed_text,
  });

  res.json(payload);
});

// ── POST /api/buscaphone/send/:id — Enviar manualmente para BuscaPhone
router.post('/send/:id', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Não autorizado' });

  const { sendToBuscaPhone } = require('../services/buscaphone');

  const row = db.prepare(`
    SELECT pm.*, m.group_name, m.sender_name, m.sender_phone, m.sent_at
    FROM processed_messages pm
    LEFT JOIN messages m ON m.id = pm.message_id
    WHERE pm.id = ?
  `).get(req.params.id);

  if (!row) return res.status(404).json({ error: 'Não encontrado' });
  if (!row.processed_text) return res.status(400).json({ error: 'Mensagem sem resultado processado' });

  try {
    const result = await sendToBuscaPhone({
      processedId:   row.id,
      groupName:     row.group_name,
      senderName:    row.sender_name,
      senderPhone:   row.sender_phone,
      sentAt:        row.sent_at,
      processedText: row.processed_text,
    });

    db.prepare(`UPDATE processed_messages SET sent_to_buscaphone = 1, buscaphone_status = ?, buscaphone_response = ? WHERE id = ?`)
      .run(result.status, JSON.stringify(result.response), row.id);

    res.json({ success: true, result });
  } catch (err) {
    db.prepare(`UPDATE processed_messages SET buscaphone_status = ?, buscaphone_response = ? WHERE id = ?`)
      .run(err.response?.status || 0, JSON.stringify(err.message), row.id);

    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
