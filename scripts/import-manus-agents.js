/**
 * Manuscript Importer for AIOX Agents
 * 
 * Fetches agent definitions from Manus API and converts them to AIOX .md format.
 * 
 * Usage: node scripts/import-manus-agents.js
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Configuration - (To be updated with user details)
const MANUS_API_ENDPOINT = process.env.MANUS_API_ENDPOINT || 'https://api.manus.ai/v1/agents';
const MANUS_API_TOKEN = process.env.MANUS_API_TOKEN;
const AGENTS_OUTPUT_DIR = path.join(__dirname, '../.aiox-core/development/agents');

async function fetchManusAgents() {
    console.log(`🚀 Fetching agents from ${MANUS_API_ENDPOINT}...`);

    if (!MANUS_API_TOKEN) {
        console.warn('⚠️ No MANUS_API_TOKEN provided. Proceeding assuming public access or local mock...');
    }

    try {
        // Usando fetch nativo (Node 18+)
        // const response = await fetch(MANUS_API_ENDPOINT, {
        //   headers: { 'Authorization': `Bearer ${MANUS_API_TOKEN}` }
        // });
        // if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        // const data = await response.json();
        // return data.agents;

        console.log('📝 Reading mock data until API details are provided...');
        return []; // Placeholder
    } catch (error) {
        console.error('❌ Failed to fetch agents:', error.message);
        process.exit(1);
    }
}

function convertToAioxFormat(manusAgent) {
    // Placeholder logic for conversion
    // We need the sample format from the user to implement this correctly
    return `---
name: ${manusAgent.name}
description: ${manusAgent.description}
capabilities: ${manusAgent.capabilities || '[]'}
---
# ${manusAgent.name}

${manusAgent.instructions || 'Instruções pendentes.'}
`;
}

async function runSincronization() {
    try {
        console.log('🔄 Running sync:skills:codex...');
        execSync('npm run sync:skills:codex', { stdio: 'inherit' });

        console.log('🧪 Running validations...');
        execSync('npm run validate:codex-sync && npm run validate:codex-integration', { stdio: 'inherit' });

        console.log('✅ Sync and validation completed successfully.');
    } catch (error) {
        console.error('❌ Sync or validation failed:', error.message);
    }
}

async function main() {
    await fs.ensureDir(AGENTS_OUTPUT_DIR);

    const agents = await fetchManusAgents();

    if (agents.length === 0) {
        console.log('📭 No agents found to import.');
        return;
    }

    for (const agent of agents) {
        const fileName = `${agent.id || agent.name.toLowerCase().replace(/\s+/g, '-')}.md`;
        const filePath = path.join(AGENTS_OUTPUT_DIR, fileName);

        const content = convertToAioxFormat(agent);
        await fs.writeFile(filePath, content);
        console.log(`📄 Created: ${fileName}`);
    }

    await runSincronization();
}

if (require.main === module) {
    main();
}
