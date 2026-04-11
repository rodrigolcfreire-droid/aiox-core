'use strict';

const { loadConfig, saveConfig, saveReport } = require('./config');
const { readAllExperts } = require('./notion-reader');
const { readAllExpertsCSV, getFullOverview } = require('./csv-reader');
const { buildReport, formatReportText } = require('./report-builder');
const { sendReportTelegram } = require('./telegram-sender');

/**
 * Run the full radar cycle: read Notion -> build report -> send.
 */
async function runRadar(options = {}) {
  const config = loadConfig();
  const silent = options.silent || false;

  if (!silent) console.log('  Radar Editorial dos Experts');
  if (!silent) console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  if (!silent) console.log('');

  // Determine source: Notion API or CSV files
  let readings;
  const useNotion = config.notionToken && config.experts.length > 0;

  if (useNotion) {
    if (!silent) console.log(`  Modo: Notion API (${config.experts.length} experts)`);
    readings = await readAllExperts(config.experts, config.notionToken);
  } else {
    if (!silent) console.log('  Modo: CSV local');
    readings = readAllExpertsCSV();
    if (readings.length === 0) {
      throw new Error(
        'Nenhuma fonte configurada.\n' +
        'Coloque CSVs em: .aiox/radar-editorial/csv/\n' +
        'Ou configure Notion: node bin/radar-editorial.js set-notion "secret_xxx"',
      );
    }
  }

  // Build report
  const report = buildReport(readings);
  if (!silent) {
    console.log(`  Conteudos encontrados: ${report.summary.totalContents}`);
    console.log(`  Alertas: ${report.alerts.length}`);
  }

  // Format text
  const text = formatReportText(report);

  // Save to history
  saveReport({
    ...report,
    textOutput: text,
    sentVia: [],
  });

  // Send via Telegram
  if (config.telegram.enabled && config.telegram.botToken && config.telegram.chatId) {
    if (!silent) console.log('  Enviando via Telegram...');
    try {
      await sendReportTelegram(config.telegram.botToken, config.telegram.chatId, text);
      if (!silent) console.log('  Telegram: enviado!');
      report.sentVia = ['telegram'];
    } catch (err) {
      console.error(`  Telegram erro: ${err.message}`);
      report.sentVia = [];
    }
  } else if (!silent) {
    console.log('  Telegram nao configurado, pulando envio.');
  }

  // Update last run
  config.lastRun = new Date().toISOString();
  const nextRun = new Date();
  nextRun.setDate(nextRun.getDate() + 1);
  nextRun.setHours(config.schedule.hour, config.schedule.minute, 0, 0);
  config.nextRun = nextRun.toISOString();
  saveConfig(config);

  if (!silent) {
    console.log('');
    console.log('  --- RELATORIO ---');
    console.log(text);
  }

  return { report, text };
}

/**
 * Get agent status summary for dashboard.
 */
function getAgentStatus() {
  const config = loadConfig();
  const { loadHistory } = require('./config');
  const history = loadHistory(5);

  // Get experts from Notion config OR CSV files
  const experts = config.experts.map(e => ({
    name: e.name,
    calendarName: e.calendarName,
    status: e.status,
    source: 'notion',
  }));

  // Add CSV experts
  const csvOverview = getFullOverview();
  for (const csv of csvOverview) {
    if (!experts.find(e => e.name.toLowerCase() === csv.expert.toLowerCase())) {
      experts.push({
        name: csv.expert,
        calendarName: `CSV (${csv.totalItems} itens)`,
        status: 'active',
        source: 'csv',
      });
    }
  }

  const hasSource = config.notionToken || csvOverview.length > 0;

  return {
    name: 'Radar Editorial dos Experts',
    subtitle: 'Monitoramento diario dos calendarios editoriais',
    status: hasSource ? 'online' : 'offline',
    mode: config.notionToken ? 'notion' : 'csv',
    lastRun: config.lastRun,
    nextRun: config.nextRun,
    expertCount: experts.length,
    experts,
    telegram: {
      enabled: config.telegram.enabled,
      configured: !!(config.telegram.botToken && config.telegram.chatId),
    },
    whatsapp: {
      enabled: config.whatsapp.enabled,
      configured: !!config.whatsapp.groupId,
    },
    schedule: config.schedule,
    recentHistory: history.map(h => ({
      date: h.date || h.generatedAt,
      totalContents: h.summary ? h.summary.totalContents : 0,
      alerts: h.alerts ? h.alerts.length : 0,
      sentVia: h.sentVia || [],
      status: h.error ? 'error' : 'ok',
    })),
  };
}

module.exports = {
  runRadar,
  getAgentStatus,
};
