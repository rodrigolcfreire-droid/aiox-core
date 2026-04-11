'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.resolve(__dirname, '..', '..', '..', '.aiox', 'radar-editorial');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const HISTORY_DIR = path.join(CONFIG_DIR, 'history');

const DEFAULT_CONFIG = {
  notionToken: process.env.NOTION_TOKEN || '',
  experts: [],
  telegram: {
    enabled: true,
    botToken: process.env.RADAR_TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.RADAR_TELEGRAM_CHAT_ID || '',
  },
  whatsapp: {
    enabled: false,
    groupId: '',
  },
  schedule: {
    enabled: true,
    hour: 8,
    minute: 0,
    timezone: 'America/Sao_Paulo',
  },
  lastRun: null,
  nextRun: null,
};

function ensureDirs() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function loadConfig() {
  ensureDirs();
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  ensureDirs();
  config.updatedAt = new Date().toISOString();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function addExpert(name, notionDatabaseId, calendarName) {
  const config = loadConfig();
  const existing = config.experts.find(e => e.notionDatabaseId === notionDatabaseId);
  if (existing) {
    existing.name = name;
    existing.calendarName = calendarName || name;
  } else {
    config.experts.push({
      name,
      notionDatabaseId,
      calendarName: calendarName || name,
      addedAt: new Date().toISOString(),
      status: 'active',
    });
  }
  saveConfig(config);
  return config;
}

function removeExpert(nameOrId) {
  const config = loadConfig();
  config.experts = config.experts.filter(e =>
    e.name !== nameOrId && e.notionDatabaseId !== nameOrId,
  );
  saveConfig(config);
  return config;
}

function saveReport(report) {
  ensureDirs();
  const date = new Date().toISOString().split('T')[0];
  const filename = `report-${date}.json`;
  fs.writeFileSync(path.join(HISTORY_DIR, filename), JSON.stringify(report, null, 2));
}

function loadHistory(limit = 10) {
  ensureDirs();
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.startsWith('report-') && f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);

  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf8'));
    } catch { return { file: f, error: true }; }
  });
}

module.exports = {
  loadConfig,
  saveConfig,
  addExpert,
  removeExpert,
  saveReport,
  loadHistory,
  CONFIG_DIR,
  CONFIG_PATH,
  HISTORY_DIR,
  DEFAULT_CONFIG,
};
