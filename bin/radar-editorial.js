#!/usr/bin/env node
'use strict';

const path = require('path');
const { runRadar, getAgentStatus } = require(path.resolve(__dirname, '..', 'packages', 'radar-editorial', 'lib', 'radar-agent'));
const { loadConfig, saveConfig, addExpert, removeExpert, loadHistory } = require(path.resolve(__dirname, '..', 'packages', 'radar-editorial', 'lib', 'config'));

const args = process.argv.slice(2);
const command = args[0] || 'run';

async function main() {
  console.log('');
  console.log('  ================================================================');
  console.log('  RADAR EDITORIAL DOS EXPERTS');
  console.log(`  ${new Date().toLocaleString('pt-BR')}`);
  console.log('  ================================================================');
  console.log('');

  switch (command) {
    case 'run': {
      await runRadar();
      break;
    }

    case 'status': {
      const status = getAgentStatus();
      console.log(`  Status: ${status.status}`);
      console.log(`  Ultima execucao: ${status.lastRun || 'Nunca'}`);
      console.log(`  Proximo envio: ${status.nextRun || 'Nao agendado'}`);
      console.log(`  Experts monitorados: ${status.expertCount}`);
      console.log('');
      if (status.experts.length > 0) {
        console.log('  Experts:');
        for (const e of status.experts) {
          console.log(`    - ${e.name} (${e.calendarName}) [${e.status}]`);
        }
      }
      console.log('');
      console.log(`  Telegram: ${status.telegram.configured ? 'Configurado' : 'Nao configurado'}`);
      console.log(`  WhatsApp: ${status.whatsapp.configured ? 'Configurado' : 'Nao configurado'}`);
      console.log(`  Horario: ${String(status.schedule.hour).padStart(2, '0')}:${String(status.schedule.minute).padStart(2, '0')}`);
      break;
    }

    case 'add-expert': {
      const name = args[1];
      const dbId = args[2];
      const calendarName = args[3] || name;
      if (!name || !dbId) {
        console.log('  Uso: node bin/radar-editorial.js add-expert "Nome" "notion-database-id" ["Calendar Name"]');
        console.log('');
        console.log('  Como encontrar o database-id:');
        console.log('  1. Abra o database no Notion');
        console.log('  2. Copie o URL: https://notion.so/xxx?v=yyy');
        console.log('  3. O "xxx" (32 chars) e o database-id');
        process.exit(1);
      }
      const config = addExpert(name, dbId, calendarName);
      console.log(`  Expert adicionado: ${name}`);
      console.log(`  Database: ${dbId}`);
      console.log(`  Total experts: ${config.experts.length}`);
      break;
    }

    case 'remove-expert': {
      const nameOrId = args[1];
      if (!nameOrId) {
        console.log('  Uso: node bin/radar-editorial.js remove-expert "Nome"');
        process.exit(1);
      }
      const config = removeExpert(nameOrId);
      console.log(`  Expert removido: ${nameOrId}`);
      console.log(`  Total experts: ${config.experts.length}`);
      break;
    }

    case 'config': {
      const config = loadConfig();
      console.log('  Configuracao atual:');
      console.log(`  Notion Token: ${config.notionToken ? '***' + config.notionToken.slice(-6) : 'Nao configurado'}`);
      console.log(`  Experts: ${config.experts.length}`);
      console.log(`  Telegram Bot: ${config.telegram.botToken ? '***' + config.telegram.botToken.slice(-6) : 'Nao configurado'}`);
      console.log(`  Telegram Chat: ${config.telegram.chatId || 'Nao configurado'}`);
      console.log(`  Horario: ${String(config.schedule.hour).padStart(2, '0')}:${String(config.schedule.minute).padStart(2, '0')}`);
      console.log('');
      console.log('  Para configurar:');
      console.log('  export NOTION_TOKEN=secret_xxx');
      console.log('  export RADAR_TELEGRAM_BOT_TOKEN=xxx');
      console.log('  export RADAR_TELEGRAM_CHAT_ID=xxx');
      console.log('  Ou edite: .aiox/radar-editorial/config.json');
      break;
    }

    case 'set-telegram': {
      const botToken = args[1];
      const chatId = args[2];
      if (!botToken || !chatId) {
        console.log('  Uso: node bin/radar-editorial.js set-telegram "bot-token" "chat-id"');
        process.exit(1);
      }
      const config = loadConfig();
      config.telegram.botToken = botToken;
      config.telegram.chatId = chatId;
      config.telegram.enabled = true;
      saveConfig(config);
      console.log('  Telegram configurado!');
      break;
    }

    case 'set-notion': {
      const token = args[1];
      if (!token) {
        console.log('  Uso: node bin/radar-editorial.js set-notion "secret_xxx"');
        process.exit(1);
      }
      const config = loadConfig();
      config.notionToken = token;
      saveConfig(config);
      console.log('  Notion token configurado!');
      break;
    }

    case 'history': {
      const history = loadHistory(10);
      if (history.length === 0) {
        console.log('  Nenhum relatorio no historico.');
        break;
      }
      console.log('  Ultimos relatorios:');
      for (const h of history) {
        if (h.error) {
          console.log(`    - ${h.file} [ERRO]`);
        } else {
          const date = h.date || h.generatedAt || '?';
          const total = h.summary ? h.summary.totalContents : 0;
          const alerts = h.alerts ? h.alerts.length : 0;
          console.log(`    - ${date} | ${total} conteudos | ${alerts} alertas`);
        }
      }
      break;
    }

    case 'help':
    default: {
      console.log('  Comandos:');
      console.log('    run              Executar radar agora');
      console.log('    status           Ver status do agente');
      console.log('    config           Ver configuracao');
      console.log('    add-expert       Adicionar expert "Nome" "db-id"');
      console.log('    remove-expert    Remover expert "Nome"');
      console.log('    set-notion       Configurar token "secret_xxx"');
      console.log('    set-telegram     Configurar Telegram "bot-token" "chat-id"');
      console.log('    history          Ver historico de relatorios');
      console.log('    help             Mostrar ajuda');
      break;
    }
  }

  console.log('');
}

main().catch(err => {
  console.error(`  ERRO: ${err.message}`);
  process.exit(1);
});
