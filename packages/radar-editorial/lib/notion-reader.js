'use strict';

const https = require('https');

const NOTION_API_VERSION = '2022-06-28';

/**
 * Make a request to the Notion API.
 */
function notionRequest(method, path, token, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.notion.com',
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Notion API ${res.statusCode}: ${json.message || data}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`Notion API parse error: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Notion API timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Query a Notion database filtering by today's date.
 * Tries common date property names: Date, Data, Publicacao, Agendamento, Due.
 */
async function queryTodayContent(databaseId, token, dateProperty = null) {
  const today = new Date().toISOString().split('T')[0];

  // If no date property specified, try to discover it
  if (!dateProperty) {
    const dbInfo = await notionRequest('GET', `/v1/databases/${databaseId}`, token);
    const props = dbInfo.properties || {};
    const dateProps = Object.entries(props)
      .filter(([, v]) => v.type === 'date')
      .map(([k]) => k);

    // Prefer common names
    const preferred = ['Data', 'Date', 'Publicacao', 'Agendamento', 'Due', 'Prazo', 'Deadline'];
    dateProperty = preferred.find(p => dateProps.includes(p)) || dateProps[0] || 'Date';
  }

  const filter = {
    filter: {
      property: dateProperty,
      date: { equals: today },
    },
    page_size: 100,
  };

  const result = await notionRequest('POST', `/v1/databases/${databaseId}/query`, token, filter);
  return { results: result.results || [], dateProperty };
}

/**
 * Extract structured content data from a Notion page.
 */
function extractContentData(page) {
  const props = page.properties || {};

  const getText = (prop) => {
    if (!prop) return '';
    if (prop.type === 'title') return (prop.title || []).map(t => t.plain_text).join('');
    if (prop.type === 'rich_text') return (prop.rich_text || []).map(t => t.plain_text).join('');
    if (prop.type === 'select') return prop.select ? prop.select.name : '';
    if (prop.type === 'multi_select') return (prop.multi_select || []).map(s => s.name).join(', ');
    if (prop.type === 'status') return prop.status ? prop.status.name : '';
    if (prop.type === 'checkbox') return prop.checkbox ? 'Sim' : 'Nao';
    if (prop.type === 'people') return (prop.people || []).map(p => p.name || 'Sem nome').join(', ');
    if (prop.type === 'date') return prop.date ? prop.date.start : '';
    if (prop.type === 'url') return prop.url || '';
    if (prop.type === 'number') return prop.number !== null ? String(prop.number) : '';
    return '';
  };

  // Find properties by common names (case-insensitive match)
  const findProp = (names) => {
    for (const name of names) {
      const key = Object.keys(props).find(k => k.toLowerCase() === name.toLowerCase());
      if (key) return getText(props[key]);
    }
    return '';
  };

  // Title is usually the first title-type property
  const titleKey = Object.keys(props).find(k => props[k].type === 'title');
  const title = titleKey ? getText(props[titleKey]) : 'Sem titulo';

  return {
    id: page.id,
    title,
    tipo: findProp(['Tipo', 'Type', 'Tipo de Conteudo', 'Content Type', 'Formato']),
    status: findProp(['Status', 'Estado', 'Fase']),
    material: findProp(['Material', 'Tem Material', 'Assets', 'Arquivos', 'Material Pronto']),
    responsavel: findProp(['Responsavel', 'Responsable', 'Assignee', 'Owner', 'Quem']),
    observacoes: findProp(['Observacoes', 'Notes', 'Notas', 'Comentarios', 'Obs']),
    data: findProp(['Data', 'Date', 'Publicacao', 'Agendamento', 'Due']),
    url: page.url || '',
  };
}

/**
 * Read all content for today from a single expert's database.
 */
async function readExpertCalendar(expert, token) {
  try {
    const { results, dateProperty } = await queryTodayContent(expert.notionDatabaseId, token);
    const contents = results.map(extractContentData);

    return {
      expert: expert.name,
      calendarName: expert.calendarName,
      databaseId: expert.notionDatabaseId,
      dateProperty,
      contents,
      count: contents.length,
      status: 'ok',
      readAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      expert: expert.name,
      calendarName: expert.calendarName,
      databaseId: expert.notionDatabaseId,
      contents: [],
      count: 0,
      status: 'error',
      error: err.message,
      readAt: new Date().toISOString(),
    };
  }
}

/**
 * Read all experts' calendars for today.
 */
async function readAllExperts(experts, token) {
  const results = [];
  for (const expert of experts) {
    if (expert.status === 'inactive') continue;
    const data = await readExpertCalendar(expert, token);
    results.push(data);
  }
  return results;
}

module.exports = {
  notionRequest,
  queryTodayContent,
  extractContentData,
  readExpertCalendar,
  readAllExperts,
};
