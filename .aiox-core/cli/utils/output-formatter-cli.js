/**
 * CLI Output Formatter
 *
 * Formata os resultados de busca para a saída da CLI em formato de tabela, JSON ou YAML.
 *
 * @module cli/utils/output-formatter-cli
 * @version 1.0.0
 * @story 2.7 - Discovery CLI Search
 */

const yaml = require('js-yaml');

/**
 * Formata a saída com base no formato especificado
 * @param {Array} results - Resultados da busca
 * @param {object} options - Opções de formatação
 * @param {string} options.format - Formato de saída: table, json, yaml
 * @param {string} options.query - Consulta de busca original
 * @param {string} options.duration - Duração da busca
 * @param {string} options.searchMethod - Método de busca utilizado
 * @param {boolean} options.verbose - Mostrar saída detalhada
 * @returns {string} String de saída formatada
 */
function formatOutput(results, options = {}) {
  const { format = 'table', query, duration, searchMethod, verbose } = options;

  switch (format.toLowerCase()) {
    case 'json':
      return formatJSON(results, options);
    case 'yaml':
      return formatYAML(results, options);
    case 'table':
    default:
      return formatTable(results, options);
  }
}

/**
 * Formata resultados como tabela
 * @param {Array} results - Resultados da busca
 * @param {object} options - Opções
 * @returns {string} String formatada em tabela
 */
function formatTable(results, options = {}) {
  const { query = '', duration = '0', searchMethod = 'keyword', verbose = false } = options;

  if (results.length === 0) {
    return `Nenhum worker encontrado correspondente a "${query}".\n\nTente termos de busca diferentes ou verifique as categorias disponíveis com 'aiox workers list --categories'.`;
  }

  // Cabeçalho
  let output = `Encontrado(s) ${results.length} worker(s) (levou ${duration}s):\n\n`;

  // Larguras das colunas
  const idWidth = Math.min(25, Math.max(4, ...results.map(r => r.id.length)));
  const nameWidth = Math.min(30, Math.max(4, ...results.map(r => r.name.length)));
  const categoryWidth = Math.min(15, Math.max(8, ...results.map(r => (r.category || '').length)));

  // Cabeçalho da tabela
  output += `  ${'#'.padEnd(3)}  ${'ID'.padEnd(idWidth)}  ${'NOME'.padEnd(nameWidth)}  ${'CATEGORIA'.padEnd(categoryWidth)}  SCORE\n`;
  output += `  ${'─'.repeat(3)}  ${'─'.repeat(idWidth)}  ${'─'.repeat(nameWidth)}  ${'─'.repeat(categoryWidth)}  ${'─'.repeat(5)}\n`;

  // Linhas da tabela
  results.forEach((result, index) => {
    const num = (index + 1).toString().padEnd(3);
    const id = truncate(result.id, idWidth).padEnd(idWidth);
    const name = truncate(result.name, nameWidth).padEnd(nameWidth);
    const category = truncate(result.category || '', categoryWidth).padEnd(categoryWidth);
    const score = `${result.score}%`;

    output += `  ${num}  ${id}  ${name}  ${category}  ${score}\n`;
  });

  // Rodapé
  output += '\nUse \'aiox workers info <id>\' para mais detalhes.';

  // Informação detalhada (verbose)
  if (verbose) {
    output += `\n\n[Depuração: método=${searchMethod}]`;
  }

  return output;
}

/**
 * Formata resultados como JSON
 * @param {Array} results - Resultados da busca
 * @param {object} options - Opções
 * @returns {string} String formatada em JSON
 */
function formatJSON(results, options = {}) {
  const output = results.map(result => ({
    id: result.id,
    name: result.name,
    description: result.description,
    category: result.category,
    subcategory: result.subcategory || null,
    tags: result.tags || [],
    score: result.score,
    path: result.path,
  }));

  return JSON.stringify(output, null, 2);
}

/**
 * Formata resultados como YAML
 * @param {Array} results - Resultados da busca
 * @param {object} options - Opções
 * @returns {string} String formatada em YAML
 */
function formatYAML(results, options = {}) {
  const output = results.map(result => ({
    id: result.id,
    name: result.name,
    description: result.description,
    category: result.category,
    subcategory: result.subcategory || null,
    tags: result.tags || [],
    score: result.score,
    path: result.path,
  }));

  return yaml.dump(output, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });
}

/**
 * Trunca uma string com reticências
 * @param {string} str - String para truncar
 * @param {number} maxLen - Comprimento máximo
 * @returns {string} String truncada
 */
function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}

/**
 * Formata um único worker para visualização detalhada
 * @param {object} worker - Objeto do worker
 * @returns {string} Detalhes do worker formatados
 */
function formatWorkerDetails(worker) {
  let output = '';

  output += `📦 ${worker.name}\n`;
  output += `${'─'.repeat(40)}\n`;
  output += `ID:          ${worker.id}\n`;
  output += `Categoria:    ${worker.category}`;
  if (worker.subcategory) {
    output += ` / ${worker.subcategory}`;
  }
  output += '\n';

  output += `\n📝 Descrição:\n${worker.description}\n`;

  if (worker.tags && worker.tags.length > 0) {
    output += `\n🏷️  Tags: ${worker.tags.join(', ')}\n`;
  }

  if (worker.inputs && worker.inputs.length > 0) {
    output += '\n📥 Entradas:\n';
    worker.inputs.forEach(input => {
      output += `   • ${input}\n`;
    });
  }

  if (worker.outputs && worker.outputs.length > 0) {
    output += '\n📤 Saídas:\n';
    worker.outputs.forEach(out => {
      output += `   • ${out}\n`;
    });
  }

  output += `\n📁 Caminho: ${worker.path}\n`;
  output += `📋 Formato: ${worker.taskFormat}\n`;

  if (worker.executorTypes && worker.executorTypes.length > 0) {
    output += `⚙️  Executores: ${worker.executorTypes.join(', ')}\n`;
  }

  if (worker.performance) {
    output += '\n⏱️  Desempenho:\n';
    if (worker.performance.avgDuration) {
      output += `   • Duração Média: ${worker.performance.avgDuration}\n`;
    }
    if (worker.performance.cacheable !== undefined) {
      output += `   • Cacheável: ${worker.performance.cacheable ? 'Sim' : 'Não'}\n`;
    }
    if (worker.performance.parallelizable !== undefined) {
      output += `   • Paralelizável: ${worker.performance.parallelizable ? 'Sim' : 'Não'}\n`;
    }
  }

  return output;
}

/**
 * Formata o resumo de categorias
 * @param {object} categories - Objeto de categorias do registro
 * @returns {string} Categorias formatadas
 */
function formatCategories(categories) {
  let output = 'Categorias Disponíveis:\n\n';

  const sortedCategories = Object.entries(categories)
    .sort((a, b) => b[1].count - a[1].count);

  for (const [name, data] of sortedCategories) {
    output += `  ${name.padEnd(20)} ${data.count.toString().padStart(4)} workers\n`;
    if (data.subcategories && data.subcategories.length > 0) {
      output += `    └─ ${data.subcategories.join(', ')}\n`;
    }
  }

  return output;
}

module.exports = {
  formatOutput,
  formatTable,
  formatJSON,
  formatYAML,
  formatWorkerDetails,
  formatCategories,
  truncate,
};
