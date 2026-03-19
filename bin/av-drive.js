#!/usr/bin/env node
'use strict';

/**
 * av-drive.js — CLI para Google Drive integration
 *
 * Comandos:
 *   node bin/av-drive.js auth                    Autenticar com Google
 *   node bin/av-drive.js publish <project-id>    Upload outputs pro Drive
 */

const path = require('path');
const { getAuthUrl, exchangeCode, publishProject } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'drive-upload'));

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('');
    console.log('  Central Audiovisual — Google Drive');
    console.log('');
    console.log('  node bin/av-drive.js auth');
    console.log('  node bin/av-drive.js auth <code>');
    console.log('  node bin/av-drive.js publish <project-id>');
    console.log('');
    process.exit(0);
  }

  const command = args[0];

  try {
    if (command === 'auth') {
      if (args[1]) {
        const token = await exchangeCode(args[1]);
        console.log('\n  Autenticado com sucesso!\n');
      } else {
        const url = getAuthUrl();
        console.log('\n  Abra no navegador:');
        console.log(`  ${url}`);
        console.log('\n  Depois rode: node bin/av-drive.js auth <code>\n');
      }
    } else if (command === 'publish') {
      const projectId = args[1];
      if (!projectId) { console.error('  Project ID necessario'); process.exit(1); }
      console.log('\n  Publicando no Google Drive...');
      const result = await publishProject(projectId);
      console.log(`  Folder ID: ${result.folderId}`);
      console.log(`  Uploaded: ${result.totalUploaded} arquivo(s)`);
      for (const u of result.uploaded) {
        console.log(`    ${u.filename} → ${u.link}`);
      }
      console.log('');
    }
  } catch (err) {
    console.error(`\n  Erro: ${err.message}\n`);
    process.exit(1);
  }
}

main();
