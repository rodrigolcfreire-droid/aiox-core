'use strict';

/**
 * Classify alert severity for a content item.
 */
function classifyAlert(content) {
  const alerts = [];
  const status = (content.status || '').toLowerCase();
  const material = (content.material || '').toLowerCase();

  // Critical (red)
  if (status.includes('atrasad') || status.includes('late') || status.includes('overdue')) {
    alerts.push({ level: 'critical', emoji: '\u{1F534}', message: `${content.title} esta atrasado` });
  }
  if (!content.responsavel || content.responsavel.trim() === '') {
    alerts.push({ level: 'critical', emoji: '\u{1F534}', message: `${content.title} sem responsavel definido` });
  }
  if (status.includes('travad') || status.includes('block') || status.includes('parad')) {
    alerts.push({ level: 'critical', emoji: '\u{1F534}', message: `${content.title} esta travado` });
  }

  // Warning (yellow)
  if (status.includes('pendent') || status.includes('pending') || status.includes('a fazer')) {
    alerts.push({ level: 'warning', emoji: '\u{1F7E1}', message: `${content.title} pendente` });
  }
  if (material.includes('sem') || material.includes('nao') || material === '' || material === 'nao') {
    alerts.push({ level: 'warning', emoji: '\u{1F7E1}', message: `${content.title} sem material` });
  }

  // OK (green)
  if (alerts.length === 0) {
    alerts.push({ level: 'ok', emoji: '\u{1F7E2}', message: `${content.title} OK` });
  }

  return alerts;
}

/**
 * Build the full daily report from expert readings.
 */
function buildReport(expertReadings) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let totalContents = 0;
  let totalPendentes = 0;
  let totalFinalizados = 0;
  let totalSemMaterial = 0;
  const allAlerts = [];
  const expertBlocks = [];

  for (const reading of expertReadings) {
    const block = {
      expert: reading.expert,
      status: reading.status,
      error: reading.error || null,
      contents: [],
    };

    if (reading.status === 'error') {
      allAlerts.push({
        level: 'critical',
        emoji: '\u{1F534}',
        message: `Falha ao ler calendario de ${reading.expert}: ${reading.error}`,
      });
      expertBlocks.push(block);
      continue;
    }

    for (const content of reading.contents) {
      totalContents++;
      const status = (content.status || '').toLowerCase();
      const material = (content.material || '').toLowerCase();

      if (status.includes('finaliz') || status.includes('done') || status.includes('conclu')) {
        totalFinalizados++;
      } else if (status.includes('pendent') || status.includes('pending') || status.includes('a fazer')) {
        totalPendentes++;
      }

      if (material.includes('sem') || material.includes('nao') || material === '') {
        totalSemMaterial++;
      }

      const alerts = classifyAlert(content);
      allAlerts.push(...alerts.filter(a => a.level !== 'ok'));

      block.contents.push({
        ...content,
        alerts,
        alertLevel: alerts.some(a => a.level === 'critical') ? 'critical'
          : alerts.some(a => a.level === 'warning') ? 'warning' : 'ok',
      });
    }

    expertBlocks.push(block);
  }

  return {
    title: 'OPERACAO DOS EXPERTS \u2014 HOJE',
    date: dateStr,
    generatedAt: today.toISOString(),
    experts: expertBlocks,
    summary: {
      totalContents,
      totalPendentes,
      totalFinalizados,
      totalSemMaterial,
      totalExperts: expertReadings.length,
      expertsWithErrors: expertReadings.filter(r => r.status === 'error').length,
    },
    alerts: allAlerts,
    hasContent: totalContents > 0,
  };
}

/**
 * Format report as plain text for Telegram.
 */
function formatReportText(report) {
  const lines = [];

  lines.push(`\u{1F4CB} *${report.title}*`);
  lines.push(`\u{1F4C5} ${report.date}`);
  lines.push('');

  if (!report.hasContent && report.summary.expertsWithErrors === 0) {
    lines.push('Nenhum conteudo operacional marcado para hoje.');
    return lines.join('\n');
  }

  // Expert blocks
  for (const block of report.experts) {
    if (block.status === 'error') {
      lines.push(`\u{1F534} *${block.expert}*`);
      lines.push(`  Falha ao ler calendario: ${block.error}`);
      lines.push('');
      continue;
    }

    if (block.contents.length === 0) continue;

    lines.push(`\u{1F464} *${block.expert}*`);
    for (const c of block.contents) {
      const statusEmoji = c.alertLevel === 'critical' ? '\u{1F534}'
        : c.alertLevel === 'warning' ? '\u{1F7E1}' : '\u{1F7E2}';
      const materialTag = c.material && !c.material.toLowerCase().includes('sem') && c.material.toLowerCase() !== 'nao'
        ? 'Com material' : 'Sem material';
      const tipo = c.tipo ? ` | ${c.tipo}` : '';
      const resp = c.responsavel ? ` | ${c.responsavel}` : '';
      lines.push(`  ${statusEmoji} ${c.title}${tipo}`);
      lines.push(`     ${c.status || 'Sem status'} | ${materialTag}${resp}`);
      if (c.url) lines.push(`     [Ver no Notion](${c.url})`);
    }
    lines.push('');
  }

  // Summary
  lines.push('\u{1F4CA} *Resumo geral*');
  lines.push(`  Total do dia: ${report.summary.totalContents}`);
  lines.push(`  Pendentes: ${report.summary.totalPendentes}`);
  lines.push(`  Finalizados: ${report.summary.totalFinalizados}`);
  lines.push(`  Sem material: ${report.summary.totalSemMaterial}`);
  lines.push('');

  // Alerts
  const criticalAlerts = report.alerts.filter(a => a.level === 'critical');
  const warningAlerts = report.alerts.filter(a => a.level === 'warning');

  if (criticalAlerts.length > 0 || warningAlerts.length > 0) {
    lines.push('\u{26A0}\u{FE0F} *Alertas*');
    for (const a of criticalAlerts) {
      lines.push(`  ${a.emoji} ${a.message}`);
    }
    for (const a of warningAlerts) {
      lines.push(`  ${a.emoji} ${a.message}`);
    }
  }

  lines.push('');
  lines.push('_Gerado automaticamente pelo Radar Editorial_');

  return lines.join('\n');
}

module.exports = {
  buildReport,
  formatReportText,
  classifyAlert,
};
