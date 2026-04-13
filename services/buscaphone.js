const axios = require('axios');
const { log } = require('./logger');

// Lê URL e token dinamicamente do banco (configurável pelo painel)
function getSettings() {
  const db = require('../database/db');
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

/**
 * Converte texto pipe-delimited em array de produtos
 * @param {string} pipeText
 * @returns {Array}
 */
function parsePipeDelimited(pipeText) {
  const lines = pipeText.trim().split('\n').filter(l => l.includes('|'));
  if (lines.length < 2) return [];

  // Ignora o cabeçalho (primeira linha)
  return lines.slice(1).map(line => {
    const [produto, produto_vinculado, storage, cor, preco] = line.split('|').map(c => c.trim());
    return {
      produto:           produto           || null,
      produto_vinculado: produto_vinculado || null,
      storage:           storage           || 'NONE',
      cor:               cor               || 'NONE',
      preco:             preco ? parseInt(preco, 10) : null,
    };
  }).filter(p => p.produto && p.preco);
}

/**
 * Monta o payload completo para o BuscaPhone
 * @param {object} opts
 * @param {number} opts.processedId
 * @param {string} opts.groupName
 * @param {string} opts.senderName
 * @param {string} opts.senderPhone
 * @param {string} opts.sentAt
 * @param {string} opts.processedText
 * @returns {object}
 */
function buildPayload({ processedId, groupName, senderName, senderPhone, sentAt, processedText }) {
  const produtos = parsePipeDelimited(processedText);
  return {
    origem: {
      sistema:      'listas-buscaphone',
      processed_id: processedId,
      grupo:        groupName   || null,
      fornecedor:   senderName  || null,
      telefone:     senderPhone || null,
      data_lista:   sentAt      || new Date().toISOString(),
    },
    total_produtos: produtos.length,
    produtos,
  };
}

/**
 * Envia lista processada para o BuscaPhone
 * @param {object} opts
 * @returns {Promise<{success: boolean, status: number, response: any}>}
 */
async function sendToBuscaPhone(opts) {
  const payload = buildPayload(opts);
  const start   = Date.now();

  const cfg = getSettings();
  const url   = cfg.buscaphone_url   || 'http://localhost:4000/buscaphone/receber';
  const token = cfg.buscaphone_token || '';

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    const res      = await axios.post(url, payload, { headers, timeout: 15000 });
    const duration = Date.now() - start;

    log({
      service:       'buscaphone',
      direction:     'outbound',
      method:        'POST',
      endpoint:      url,
      status_code:   res.status,
      request_body:  { processed_id: opts.processedId, total_produtos: payload.total_produtos },
      response_body: res.data,
      duration_ms:   duration,
      success:       true,
    });

    return { success: true, status: res.status, response: res.data };
  } catch (err) {
    const duration   = Date.now() - start;
    const status     = err.response?.status || 0;
    const respData   = err.response?.data   || err.message;

    log({
      service:       'buscaphone',
      direction:     'outbound',
      method:        'POST',
      endpoint:      url,
      status_code:   status,
      request_body:  { processed_id: opts.processedId, total_produtos: payload.total_produtos },
      response_body: respData,
      duration_ms:   duration,
      success:       false,
      error_msg:     err.message,
    });

    throw err;
  }
}

module.exports = { sendToBuscaPhone, buildPayload, parsePipeDelimited };
