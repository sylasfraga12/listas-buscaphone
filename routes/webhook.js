const express = require('express');
const router  = express.Router();
const db      = require('../database/db');
const { processMessage }   = require('../services/claude');
const { sendToBuscaPhone } = require('../services/buscaphone');
const { log } = require('../services/logger');

// ── Prepared statements ────────────────────────────────────────────────────
const upsertGroup = db.prepare(`
  INSERT INTO groups (group_id, name, type, is_community, total_participants, last_msg_at)
  VALUES (@group_id, @name, @type, @is_community, @total_participants, datetime('now'))
  ON CONFLICT(group_id) DO UPDATE SET
    name               = excluded.name,
    type               = excluded.type,
    is_community       = excluded.is_community,
    total_participants = excluded.total_participants,
    last_msg_at        = datetime('now')
`);

const insertMessage = db.prepare(`
  INSERT INTO messages
    (event_id, zapster_msg_id, group_id, group_name, group_type, is_community,
     sender_name, sender_phone, content, content_type, sent_at)
  VALUES
    (@event_id, @zapster_msg_id, @group_id, @group_name, @group_type, @is_community,
     @sender_name, @sender_phone, @content, @content_type, @sent_at)
`);

const insertProcessed = db.prepare(`
  INSERT INTO processed_messages
    (message_id, original_text, processed_text, input_tokens, output_tokens, cost_usd)
  VALUES
    (@message_id, @original_text, @processed_text, @input_tokens, @output_tokens, @cost_usd)
`);

const insertProcessedError = db.prepare(`
  INSERT INTO processed_messages (message_id, original_text, error)
  VALUES (@message_id, @original_text, @error)
`);

const markProcessed = db.prepare(`UPDATE messages SET processed = 1 WHERE id = ?`);

// ── POST /webhook/zapster ──────────────────────────────────────────────────
router.post('/zapster', async (req, res) => {
  const event = req.body;

  // ── 1. Log imediato de tudo que chega ─────────────────────────────────
  log({
    service:      'zapster',
    direction:    'inbound',
    method:       'POST',
    endpoint:     '/webhook/zapster',
    status_code:  200,
    request_body: {
      event_id:   event?.id,
      type:       event?.type,
      group_name: event?.data?.recipient?.name,
      group_id:   event?.data?.recipient?.id,
      group_type: event?.data?.recipient?.type,
      sender:     event?.data?.sender?.name,
      phone:      event?.data?.sender?.phone_number,
      msg_type:   event?.data?.type,
      chars:      event?.data?.content?.text?.length ?? 0,
    },
    success: true,
  });

  // ── 2. Só processar message.received ──────────────────────────────────
  if (event?.type !== 'message.received') {
    console.log(`[webhook] Evento ignorado: ${event?.type}`);
    return res.sendStatus(200);
  }

  const data      = event.data      || {};
  const recipient = data.recipient  || {};
  const sender    = data.sender     || {};
  const content   = data.content    || {};

  // ── 3. Extrair campos do payload real ─────────────────────────────────
  const groupId          = recipient.id          || 'unknown';
  const groupName        = recipient.name        || groupId;
  const groupType        = recipient.type        || 'unknown';        // 'group' | 'community' | ...
  const isCommunity      = recipient.is_community ? 1 : 0;
  const totalParticipants = recipient.total_participants || 0;

  const senderName  = sender.name         || sender.id || 'unknown';
  const senderPhone = sender.phone_number || sender.id || null;

  const messageText = content.text || '';
  const contentType = data.type    || 'text';              // 'text' | 'image' | ...
  const sentAt      = data.sent_at || event.created_at || null;
  const eventId     = event.id     || null;
  const zapsterMsgId = data.id     || null;

  // ── 4. Só processar mensagens de grupos ───────────────────────────────
  if (groupType !== 'group' && groupType !== 'community' && groupType !== 'chat') {
    console.log(`[webhook] Ignorado — não é grupo: ${groupType}`);
    return res.sendStatus(200);
  }

  if (!messageText.trim()) {
    console.log(`[webhook] Ignorado — mensagem vazia (${contentType})`);
    return res.sendStatus(200);
  }

  // ── 5. Persistir grupo ────────────────────────────────────────────────
  upsertGroup.run({
    group_id:           groupId,
    name:               groupName,
    type:               groupType,
    is_community:       isCommunity,
    total_participants: totalParticipants,
  });

  // ── 6. Persistir mensagem ─────────────────────────────────────────────
  const msgResult = insertMessage.run({
    event_id:       eventId,
    zapster_msg_id: zapsterMsgId,
    group_id:       groupId,
    group_name:     groupName,
    group_type:     groupType,
    is_community:   isCommunity,
    sender_name:    senderName,
    sender_phone:   senderPhone,
    content:        messageText,
    content_type:   contentType,
    sent_at:        sentAt,
  });

  const messageId = msgResult.lastInsertRowid;

  console.log(`[webhook] ✓ Mensagem #${messageId} salva | grupo: "${groupName}" | de: ${senderName} (${senderPhone})`);

  // ── 7. Responde Zapsterapi imediatamente ──────────────────────────────
  res.sendStatus(200);

  // ── 8. Processar com Claude (assíncrono) ──────────────────────────────
  setImmediate(async () => {
    try {
      const { result, inputTokens, outputTokens, costUsd } = await processMessage(messageText);

      const processedRow = insertProcessed.run({
        message_id:     messageId,
        original_text:  messageText,
        processed_text: result,
        input_tokens:   inputTokens,
        output_tokens:  outputTokens,
        cost_usd:       costUsd,
      });

      markProcessed.run(messageId);

      const processedId = processedRow.lastInsertRowid;
      console.log(`[claude] ✓ Mensagem #${messageId} processada | ${inputTokens}in+${outputTokens}out tokens | $${costUsd.toFixed(6)}`);

      // ── 9. Envio automático ao BuscaPhone (se ativado) ─────────────────
      const autoSend = db.prepare(`SELECT value FROM settings WHERE key = 'auto_send'`).get();
      if (autoSend?.value === '1') {
        try {
          const bpResult = await sendToBuscaPhone({
            processedId,
            groupName:   groupName,
            senderName:  senderName,
            senderPhone: senderPhone,
            sentAt:      sentAt,
            processedText: result,
          });

          db.prepare(`UPDATE processed_messages SET sent_to_buscaphone = 1, buscaphone_status = ?, buscaphone_response = ? WHERE id = ?`)
            .run(bpResult.status, JSON.stringify(bpResult.response), processedId);

          console.log(`[buscaphone] ✓ Enviado automaticamente | processed_id: ${processedId} | status: ${bpResult.status}`);
        } catch (bpErr) {
          db.prepare(`UPDATE processed_messages SET buscaphone_status = ?, buscaphone_response = ? WHERE id = ?`)
            .run(0, JSON.stringify(bpErr.message), processedId);

          console.error(`[buscaphone] ✗ Erro no envio automático:`, bpErr.message);
        }
      }
    } catch (err) {
      console.error(`[claude] ✗ Erro mensagem #${messageId}:`, err.message);

      insertProcessedError.run({
        message_id:    messageId,
        original_text: messageText,
        error:         err.message,
      });
    }
  });
});

module.exports = router;
