'use strict';

const fs = require('fs');
const path = require('path');

const CSV_DIR = path.resolve(__dirname, '..', '..', '..', '.aiox', 'radar-editorial', 'csv');

/**
 * Parse a CSV line handling commas inside quotes.
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse CSV file into array of objects.
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Parse date in DD/MM/YYYY format to Date object.
 */
function parseDateBR(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Read a single expert's CSV and filter for today.
 */
function readExpertCSV(expertName, csvPath) {
  try {
    if (!fs.existsSync(csvPath)) {
      return {
        expert: expertName,
        contents: [],
        count: 0,
        status: 'error',
        error: `CSV nao encontrado: ${csvPath}`,
        readAt: new Date().toISOString(),
      };
    }

    const rows = parseCSV(csvPath);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayContents = rows.filter(row => {
      const dateField = row['Data de Entrega'] || row['Data'] || row['Date'] || '';
      const date = parseDateBR(dateField);
      if (!date) return false;
      date.setHours(0, 0, 0, 0);
      return date.getTime() === today.getTime();
    });

    const contents = todayContents.map(row => ({
      title: row['Tipo de Criativo'] || row['Nome'] || row['Title'] || 'Sem titulo',
      tipo: row['Creative Type'] || row['Tipo'] || '',
      status: row['Status'] || '',
      material: inferMaterial(row),
      responsavel: row['Responsavel'] || row['Expert'] || '',
      observacoes: row['Descricao'] || row['Descrição'] || '',
      data: row['Data de Entrega'] || row['Data'] || '',
      url: '',
    }));

    return {
      expert: expertName,
      contents,
      count: contents.length,
      status: 'ok',
      readAt: new Date().toISOString(),
      totalInCSV: rows.length,
    };
  } catch (err) {
    return {
      expert: expertName,
      contents: [],
      count: 0,
      status: 'error',
      error: err.message,
      readAt: new Date().toISOString(),
    };
  }
}

/**
 * Infer material status from row data.
 */
function inferMaterial(row) {
  const status = (row['Status'] || '').toLowerCase();
  const brutos = row['Pasta Vídeo (Brutos)'] || row['Pasta Video (Brutos)'] || '';
  const prontos = row['Pasta Vídeo (Prontos)'] || row['Pasta Video (Prontos)'] || '';

  if (status.includes('sem material')) return 'Sem material';
  if (status.includes('pronto')) return 'Com material';
  if (brutos || prontos) return 'Com material';
  return 'Sem material';
}

/**
 * Read all expert CSVs from the csv directory.
 */
function readAllExpertsCSV() {
  if (!fs.existsSync(CSV_DIR)) {
    return [];
  }

  const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));
  const results = [];

  for (const file of files) {
    const expertName = path.basename(file, '.csv')
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const csvPath = path.join(CSV_DIR, file);
    results.push(readExpertCSV(expertName, csvPath));
  }

  return results;
}

/**
 * Get full overview of all experts (all dates, not just today).
 */
function getFullOverview() {
  if (!fs.existsSync(CSV_DIR)) return [];

  const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));
  const results = [];

  for (const file of files) {
    const expertName = path.basename(file, '.csv')
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const csvPath = path.join(CSV_DIR, file);
    const rows = parseCSV(csvPath);
    results.push({
      expert: expertName,
      totalItems: rows.length,
      statuses: countBy(rows, 'Status'),
    });
  }

  return results;
}

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    const val = row[field] || 'Sem status';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

module.exports = {
  parseCSV,
  parseCSVLine,
  parseDateBR,
  readExpertCSV,
  readAllExpertsCSV,
  getFullOverview,
  inferMaterial,
  CSV_DIR,
};
