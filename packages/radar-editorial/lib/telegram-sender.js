'use strict';

const https = require('https');

/**
 * Send a message via Telegram Bot API.
 */
function sendTelegram(botToken, chatId, text, parseMode = 'Markdown') {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok) {
            resolve(json.result);
          } else {
            reject(new Error(`Telegram API error: ${json.description || data}`));
          }
        } catch {
          reject(new Error(`Telegram parse error: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Telegram timeout')); });
    req.write(payload);
    req.end();
  });
}

/**
 * Send report via Telegram, splitting if necessary (max 4096 chars).
 */
async function sendReportTelegram(botToken, chatId, reportText) {
  const MAX_LEN = 4000;

  if (reportText.length <= MAX_LEN) {
    return sendTelegram(botToken, chatId, reportText);
  }

  // Split by double newline to keep blocks together
  const blocks = reportText.split('\n\n');
  let chunk = '';
  const results = [];

  for (const block of blocks) {
    if ((chunk + '\n\n' + block).length > MAX_LEN) {
      if (chunk) {
        results.push(await sendTelegram(botToken, chatId, chunk));
      }
      chunk = block;
    } else {
      chunk = chunk ? chunk + '\n\n' + block : block;
    }
  }

  if (chunk) {
    results.push(await sendTelegram(botToken, chatId, chunk));
  }

  return results;
}

module.exports = {
  sendTelegram,
  sendReportTelegram,
};
