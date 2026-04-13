const db = require('../database/db');

const insert = db.prepare(`
  INSERT INTO api_logs
    (service, direction, method, endpoint, status_code, request_body, response_body, duration_ms, success, error_msg)
  VALUES
    (@service, @direction, @method, @endpoint, @status_code, @request_body, @response_body, @duration_ms, @success, @error_msg)
`);

/**
 * @param {object} entry
 * @param {string} entry.service      - 'zapster' | 'claude' | 'buscaphone'
 * @param {string} entry.direction    - 'inbound' | 'outbound'
 * @param {string} [entry.method]     - HTTP method
 * @param {string} [entry.endpoint]   - URL / route
 * @param {number} [entry.status_code]
 * @param {any}    [entry.request_body]
 * @param {any}    [entry.response_body]
 * @param {number} [entry.duration_ms]
 * @param {boolean} [entry.success]
 * @param {string}  [entry.error_msg]
 */
function log(entry) {
  try {
    insert.run({
      service:       entry.service,
      direction:     entry.direction,
      method:        entry.method     || null,
      endpoint:      entry.endpoint   || null,
      status_code:   entry.status_code ?? null,
      request_body:  entry.request_body  ? JSON.stringify(entry.request_body)  : null,
      response_body: entry.response_body ? JSON.stringify(entry.response_body) : null,
      duration_ms:   entry.duration_ms   ?? null,
      success:       entry.success === false ? 0 : 1,
      error_msg:     entry.error_msg || null,
    });
  } catch (err) {
    console.error('[logger] Erro ao salvar log:', err.message);
  }
}

module.exports = { log };
