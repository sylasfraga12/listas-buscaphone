// ── State ──────────────────────────────────────────────────────────────────
let logsOffset = 0, logsLimit = 15, logsTotal = 0, logsService = '';
let flOffset   = 0, flLimit   = 20, flTotal   = 0, flService   = '';
let procOffset = 0, procLimit = 10, procTotal  = 0;

// ── Navigation ─────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const sec = item.dataset.section;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`section-${sec}`)?.classList.add('active');
    document.getElementById('section-title').textContent = item.textContent.trim();

    if (sec === 'messages') loadProcessed();
    if (sec === 'logs')     loadFullLogs();
    if (sec === 'groups')   loadGroups();
    if (sec === 'webhooks') loadWebhooks();
  });
});

// ── Filter chips (overview logs) ────────────────────────────────────────────
document.querySelectorAll('#section-overview .filter-chips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#section-overview .filter-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    logsService = chip.dataset.svc;
    logsOffset  = 0;
    loadLogs();
  });
});

// Filter chips (full logs section)
document.querySelectorAll('#logs-full-filters .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#logs-full-filters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    flService = chip.dataset.svc;
    flOffset  = 0;
    loadFullLogs();
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n, decimals = 2) {
  return typeof n === 'number' ? n.toFixed(decimals) : '—';
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str.includes('T') ? str : str.replace(' ', 'T') + 'Z');
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDuration(ms) {
  if (!ms && ms !== 0) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
}

function statusBadge(code, success) {
  if (success === 0 || success === false) {
    return `<span class="badge badge-error">${code || 'ERR'}</span>`;
  }
  if (!code) return '—';
  if (code >= 200 && code < 300) return `<span class="badge badge-ok">${code}</span>`;
  if (code >= 400 && code < 500) return `<span class="badge badge-warn">${code}</span>`;
  return `<span class="badge badge-error">${code}</span>`;
}

function svcTag(svc) {
  return `<span class="svc-tag svc-${svc}">${svc}</span>`;
}

function dirTag(dir) {
  if (dir === 'inbound')  return `<span class="dir-in">↓ entrada</span>`;
  if (dir === 'outbound') return `<span class="dir-out">↑ saída</span>`;
  return dir;
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function truncate(s, n = 80) {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ── Stats ──────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const r = await fetch('/api/stats');
    const d = await r.json();

    document.getElementById('s-total-processed').textContent = d.total_processed.toLocaleString('pt-BR');
    document.getElementById('s-avg-cost').textContent = `custo médio: $${fmt(d.avg_cost_usd, 6)}`;
    document.getElementById('s-total-cost').textContent = `$${fmt(d.total_cost_usd, 4)}`;
    document.getElementById('s-groups').textContent = d.total_groups.toLocaleString('pt-BR');
    document.getElementById('s-today').textContent = d.today_messages.toLocaleString('pt-BR');
    document.getElementById('s-errors-today').textContent = `erros hoje: ${d.errors_today}`;
  } catch (e) {
    console.error('loadStats:', e);
  }
}

// ── Overview Logs ──────────────────────────────────────────────────────────
async function loadLogs() {
  const tbody = document.getElementById('logs-table-body');
  tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Carregando...</td></tr>`;

  try {
    const url = `/api/logs?limit=${logsLimit}&offset=${logsOffset}${logsService ? '&service='+logsService : ''}`;
    const r   = await fetch(url);
    const d   = await r.json();
    logsTotal = d.total;

    if (!d.logs.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Nenhum log encontrado.</td></tr>`;
    } else {
      tbody.innerHTML = d.logs.map(l => `
        <tr onclick="openLog(${l.id})" style="cursor:pointer">
          <td>${svcTag(l.service)}</td>
          <td>${dirTag(l.direction)}</td>
          <td class="mono">${truncate(l.endpoint, 40) || '—'}</td>
          <td>${statusBadge(l.status_code, l.success)}</td>
          <td class="mono">${fmtDuration(l.duration_ms)}</td>
          <td style="white-space:nowrap">${fmtDate(l.created_at)}</td>
          <td>${l.service === 'zapster' && l.direction === 'inbound'
            ? `<button class="btn-view-msg" onclick="event.stopPropagation(); openMessageFromLog(${l.id})" title="Ver mensagem">💬 Ver msg</button>`
            : ''}</td>
        </tr>
      `).join('');
    }

    const page = Math.floor(logsOffset / logsLimit) + 1;
    const pages = Math.max(1, Math.ceil(logsTotal / logsLimit));
    document.getElementById('logs-page-info').textContent = `Página ${page} de ${pages} (${logsTotal} total)`;
    document.getElementById('logs-prev').disabled = logsOffset === 0;
    document.getElementById('logs-next').disabled = logsOffset + logsLimit >= logsTotal;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Erro ao carregar logs.</td></tr>`;
  }
}

function logsPage(dir) {
  logsOffset = Math.max(0, logsOffset + dir * logsLimit);
  loadLogs();
}

// ── Full Logs ──────────────────────────────────────────────────────────────
async function loadFullLogs() {
  const tbody = document.getElementById('full-logs-body');
  tbody.innerHTML = `<tr><td colspan="9" class="empty-row">Carregando...</td></tr>`;

  try {
    const url = `/api/logs?limit=${flLimit}&offset=${flOffset}${flService ? '&service='+flService : ''}`;
    const r   = await fetch(url);
    const d   = await r.json();
    flTotal = d.total;

    if (!d.logs.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-row">Nenhum log.</td></tr>`;
    } else {
      tbody.innerHTML = d.logs.map(l => `
        <tr onclick="openLog(${l.id})" style="cursor:pointer">
          <td class="mono" style="color:var(--text-muted)">#${l.id}</td>
          <td>${svcTag(l.service)}</td>
          <td>${dirTag(l.direction)}</td>
          <td class="mono">${l.method || '—'}</td>
          <td class="mono">${truncate(l.endpoint, 35) || '—'}</td>
          <td>${statusBadge(l.status_code, l.success)}</td>
          <td class="mono">${fmtDuration(l.duration_ms)}</td>
          <td>${l.success ? '<span class="badge badge-ok">OK</span>' : `<span class="badge badge-error">${escHtml(truncate(l.error_msg, 30))}</span>`}</td>
          <td style="white-space:nowrap">${fmtDate(l.created_at)}</td>
          <td>${l.service === 'zapster' && l.direction === 'inbound'
            ? `<button class="btn-view-msg" onclick="event.stopPropagation(); openMessageFromLog(${l.id})" title="Ver mensagem">💬 Ver msg</button>`
            : ''}</td>
        </tr>
      `).join('');
    }

    const page  = Math.floor(flOffset / flLimit) + 1;
    const pages = Math.max(1, Math.ceil(flTotal / flLimit));
    document.getElementById('fl-page-info').textContent = `Página ${page} de ${pages} (${flTotal} total)`;
    document.getElementById('fl-prev').disabled = flOffset === 0;
    document.getElementById('fl-next').disabled = flOffset + flLimit >= flTotal;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-row">Erro ao carregar logs.</td></tr>`;
  }
}

function fullLogsPage(dir) {
  flOffset = Math.max(0, flOffset + dir * flLimit);
  loadFullLogs();
}

// ── Log Detail Modal ───────────────────────────────────────────────────────
async function openLog(id) {
  try {
    const r = await fetch(`/api/logs/${id}`);
    const l = await r.json();

    let reqBody = '—', resBody = '—';
    try { reqBody = JSON.stringify(JSON.parse(l.request_body), null, 2); } catch { reqBody = l.request_body || '—'; }
    try { resBody = JSON.stringify(JSON.parse(l.response_body), null, 2); } catch { resBody = l.response_body || '—'; }

    document.getElementById('modal-title').textContent = `Log #${id} — ${l.service} ${l.direction}`;
    document.getElementById('modal-body').innerHTML = `
      <div class="modal-section">
        <span class="modal-section-label">Serviço / Direção</span>
        <div>${svcTag(l.service)} ${dirTag(l.direction)} ${l.method ? `<span class="mono">${l.method}</span>` : ''}</div>
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Endpoint</span>
        <div class="modal-code">${escHtml(l.endpoint) || '—'}</div>
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Status / Duração</span>
        <div>${statusBadge(l.status_code, l.success)} &nbsp; ${fmtDuration(l.duration_ms)}</div>
      </div>
      ${l.error_msg ? `<div class="modal-section"><span class="modal-section-label">Erro</span><div class="modal-code" style="color:var(--red)">${escHtml(l.error_msg)}</div></div>` : ''}
      <div class="modal-section">
        <span class="modal-section-label">Request Body</span>
        <div class="modal-code">${escHtml(reqBody)}</div>
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Response Body</span>
        <div class="modal-code">${escHtml(resBody)}</div>
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Timestamp</span>
        <div class="mono">${fmtDate(l.created_at)}</div>
      </div>
    `;
    document.getElementById('modal').classList.remove('hidden');
  } catch (e) { console.error('openLog:', e); }
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

// ── Ver mensagem completa a partir de um log ────────────────────────────────
async function openMessageFromLog(logId) {
  try {
    const r = await fetch(`/api/logs/${logId}/message`);
    if (!r.ok) {
      const e = await r.json();
      alert(e.error || 'Mensagem não encontrada');
      return;
    }
    const m = await r.json();

    document.getElementById('modal-title').textContent = `Mensagem — ${escHtml(m.group_name || '—')} | ${escHtml(m.sender_name || '—')}`;
    document.getElementById('modal-body').innerHTML = `
      <div class="modal-section">
        <span class="modal-section-label">Remetente</span>
        <div>${escHtml(m.sender_name || '—')} &nbsp;<span class="mono" style="color:var(--text-muted)">${escHtml(m.sender_phone || '')}</span></div>
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Grupo</span>
        <div>${escHtml(m.group_name || '—')}</div>
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Enviado em</span>
        <div class="mono">${fmtDate(m.sent_at)}</div>
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Mensagem original (WhatsApp)</span>
        <div class="modal-code" style="max-height:220px;overflow-y:auto;white-space:pre-wrap">${escHtml(m.content || '—')}</div>
      </div>
      ${m.error
        ? `<div class="modal-section"><span class="modal-section-label">Erro no processamento</span><div class="modal-code" style="color:var(--red)">${escHtml(m.error)}</div></div>`
        : m.processed_text
          ? `<div class="modal-section">
              <span class="modal-section-label">Resultado do Claude &nbsp;<span style="color:var(--text-muted);font-weight:400">${m.input_tokens || 0}in + ${m.output_tokens || 0}out tokens &nbsp; $${fmt(m.cost_usd, 6)}</span></span>
              <div style="overflow-x:auto">${renderPipeTable(m.processed_text)}</div>
             </div>`
          : `<div class="modal-section"><span class="modal-section-label">Processamento</span><div style="color:var(--text-muted)">Ainda não processado</div></div>`
      }
    `;
    document.getElementById('modal').classList.remove('hidden');
  } catch (e) {
    console.error('openMessageFromLog:', e);
  }
}

// ── Processed Messages ─────────────────────────────────────────────────────
async function loadProcessed() {
  const list = document.getElementById('processed-list');
  list.innerHTML = `<div class="empty-row">Carregando...</div>`;

  try {
    const r = await fetch(`/api/processed?limit=${procLimit}&offset=${procOffset}`);
    const d = await r.json();
    procTotal = d.total;

    document.getElementById('processed-total').textContent = `${procTotal} registros`;

    if (!d.items.length) {
      list.innerHTML = `<div class="empty-row">Nenhuma mensagem processada ainda.</div>`;
    } else {
      list.innerHTML = d.items.map(item => {
        const prodCount = item.processed_text
          ? item.processed_text.trim().split('\n').filter(l => l.includes('|')).length - 1
          : 0;
        return `
        <div class="proc-item">
          <div class="proc-meta">
            <span class="proc-group">${escHtml(item.group_name || 'Grupo desconhecido')}</span>
            <span>•</span>
            <span>${escHtml(item.sender_name || '—')}</span>
            <span>•</span>
            <span>${fmtDate(item.processed_at)}</span>
            ${item.error
              ? '<span class="badge badge-error">ERRO</span>'
              : `<span class="badge badge-ok">OK</span>
                 <span class="badge badge-info" title="Produtos extraídos">${prodCount} produto${prodCount !== 1 ? 's' : ''}</span>`
            }
            ${!item.error ? `<span class="proc-cost">$${fmt(item.cost_usd, 6)} | ${item.input_tokens || 0}in + ${item.output_tokens || 0}out tokens</span>` : ''}
          </div>
          ${item.error
            ? `<div class="proc-error">${escHtml(item.error)}</div>`
            : `<div class="proc-cols">
                <div class="proc-col">
                  <span class="proc-col-label orig">Original (bagunçado)</span>
                  <div class="proc-text">${escHtml(item.original_text)}</div>
                </div>
                <div class="proc-col">
                  <div class="proc-col-head">
                    <span class="proc-col-label org">Organizado pelo Claude</span>
                    <button class="btn-copy" onclick="copyResult(this, ${item.id})" title="Copiar resultado">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                      <span>Copiar</span>
                    </button>
                  </div>
                  <div class="proc-table-wrap" id="proc-table-${item.id}">
                    ${renderPipeTable(item.processed_text)}
                  </div>
                  <textarea class="proc-raw-text hidden" id="proc-raw-${item.id}">${escHtml(item.processed_text)}</textarea>
                </div>
              </div>`
          }
        </div>
      `;
      }).join('');
    }

    const page  = Math.floor(procOffset / procLimit) + 1;
    const pages = Math.max(1, Math.ceil(procTotal / procLimit));
    document.getElementById('proc-page-info').textContent = `Página ${page} de ${pages}`;
    document.getElementById('proc-prev').disabled = procOffset === 0;
    document.getElementById('proc-next').disabled = procOffset + procLimit >= procTotal;
  } catch (e) {
    list.innerHTML = `<div class="empty-row">Erro ao carregar mensagens.</div>`;
  }
}

function processedPage(dir) {
  procOffset = Math.max(0, procOffset + dir * procLimit);
  loadProcessed();
}

// Converte texto pipe-delimited em tabela HTML legível
function renderPipeTable(text) {
  if (!text) return '<span style="color:var(--text-muted)">—</span>';
  const lines = text.trim().split('\n').filter(l => l.includes('|'));
  if (!lines.length) return `<pre class="proc-text">${escHtml(text)}</pre>`;

  const rows = lines.map(l => l.split('|').map(c => c.trim()));
  const [header, ...body] = rows;

  const thead = `<tr>${header.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr>`;
  const tbody = body.map(row =>
    `<tr>${row.map((c, i) => {
      // Coluna PREÇO: destacar em verde
      if (i === row.length - 1 && /^\d+$/.test(c)) {
        return `<td><span class="price-cell">R$ ${parseInt(c).toLocaleString('pt-BR')}</span></td>`;
      }
      // Coluna STORAGE: badge azul
      if (i === 2 && c !== 'NONE') {
        return `<td><span class="badge badge-info">${escHtml(c)}</span></td>`;
      }
      // NONE: muted
      if (c === 'NONE') return `<td style="color:var(--text-muted)">—</td>`;
      return `<td>${escHtml(c)}</td>`;
    }).join('')}</tr>`
  ).join('');

  return `<div class="pipe-table-wrap"><table class="pipe-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}

// Copia o texto pipe-delimited bruto para o clipboard
async function copyResult(btn, id) {
  const raw = document.getElementById(`proc-raw-${id}`)?.value;
  if (!raw) return;

  try {
    await navigator.clipboard.writeText(raw);
    const span = btn.querySelector('span');
    const origText = span.textContent;
    btn.classList.add('copied');
    span.textContent = 'Copiado!';
    setTimeout(() => { span.textContent = origText; btn.classList.remove('copied'); }, 2000);
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = raw;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ── Groups ─────────────────────────────────────────────────────────────────
async function loadGroups() {
  const tbody = document.getElementById('groups-body');
  tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Carregando...</td></tr>`;

  try {
    const r = await fetch('/api/groups');
    const d = await r.json();

    document.getElementById('groups-total').textContent = `${d.groups.length} grupos`;

    if (!d.groups.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Nenhum grupo registrado ainda.</td></tr>`;
    } else {
      tbody.innerHTML = d.groups.map(g => `
        <tr>
          <td>${escHtml(g.name || '—')}</td>
          <td class="mono" style="font-size:11px;color:var(--text-muted)">${escHtml(g.group_id)}</td>
          <td>${escHtml(g.instance_id || '—')}</td>
          <td>${g.message_count.toLocaleString('pt-BR')}</td>
          <td>${fmtDate(g.last_msg_at)}</td>
          <td>${fmtDate(g.created_at)}</td>
        </tr>
      `).join('');
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Erro ao carregar grupos.</td></tr>`;
  }
}

// ── Webhooks / Settings ────────────────────────────────────────────────────
async function loadWebhooks() {
  try {
    const r = await fetch('/api/settings');
    const s = await r.json();

    document.getElementById('cfg-url').value   = s.buscaphone_url   || '';
    document.getElementById('cfg-token').value = s.buscaphone_token || '';
    const autoEl = document.getElementById('cfg-auto');
    autoEl.checked = s.auto_send === '1';
    document.getElementById('toggle-label-text').textContent = autoEl.checked ? 'Ativado' : 'Desativado';
  } catch (e) { console.error('loadWebhooks:', e); }

  // Popula select de listas para envio manual
  try {
    const r = await fetch('/api/processed?limit=50&offset=0');
    if (!r.ok) {
      document.getElementById('send-select').innerHTML = '<option value="">Sessão expirada — faça login novamente</option>';
      return;
    }
    const d = await r.json();
    const sel = document.getElementById('send-select');
    const valid = (d.items || []).filter(i => !i.error && i.processed_text);
    if (!valid.length) {
      sel.innerHTML = '<option value="">Nenhuma lista processada ainda</option>';
    } else {
      sel.innerHTML = '<option value="">— Selecione uma lista —</option>' + valid.map(i => {
        const cnt = i.processed_text.trim().split('\n').filter(l => l.includes('|')).length - 1;
        return `<option value="${i.id}">#${i.id} — ${escHtml(i.group_name || '—')} — ${cnt} produtos — ${fmtDate(i.processed_at)}</option>`;
      }).join('');
    }
  } catch (e) {
    document.getElementById('send-select').innerHTML = '<option value="">Erro ao carregar listas</option>';
    console.error('loadSendSelect:', e);
  }
}

document.getElementById('cfg-auto')?.addEventListener('change', function () {
  document.getElementById('toggle-label-text').textContent = this.checked ? 'Ativado' : 'Desativado';
});

async function saveSettings() {
  const body = {
    buscaphone_url:   document.getElementById('cfg-url').value.trim(),
    buscaphone_token: document.getElementById('cfg-token').value.trim(),
    auto_send:        document.getElementById('cfg-auto').checked ? '1' : '0',
  };
  try {
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const msg = document.getElementById('save-msg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2500);
  } catch (e) { alert('Erro ao salvar: ' + e.message); }
}

async function sendManual() {
  const id  = document.getElementById('send-select').value;
  const res = document.getElementById('send-result');
  if (!id) return;

  res.className = 'send-result';
  res.textContent = 'Enviando...';

  try {
    const r = await fetch(`/api/buscaphone/send/${id}`, { method: 'POST' });
    const d = await r.json();
    if (d.success) {
      res.className = 'send-result ok';
      res.textContent = `✓ Enviado! Status ${d.result.status} — ${JSON.stringify(d.result.response)}`;
    } else {
      res.className = 'send-result error';
      res.textContent = `✗ Erro: ${d.error}`;
    }
  } catch (e) {
    res.className = 'send-result error';
    res.textContent = `✗ Erro de conexão: ${e.message}`;
  }
}

async function copyPayloadExample() {
  const text = document.getElementById('payload-example').textContent;
  await navigator.clipboard.writeText(text).catch(() => {});
}

// ── Refresh ────────────────────────────────────────────────────────────────
async function refreshAll() {
  const btn = document.querySelector('.btn-refresh svg');
  btn.style.animation = 'spin 0.6s linear';
  setTimeout(() => btn.style.animation = '', 700);

  await loadStats();
  await loadLogs();

  document.getElementById('last-update').textContent =
    'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
}

// ── Init ───────────────────────────────────────────────────────────────────
(async () => {
  await loadStats();
  await loadLogs();
  document.getElementById('last-update').textContent =
    'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');

  // Auto-refresh a cada 30s
  setInterval(refreshAll, 30_000);
})();

// ── Keyboard ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// Spin keyframe (inline)
const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);
