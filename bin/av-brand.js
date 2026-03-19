#!/usr/bin/env node
'use strict';

/**
 * av-brand.js — CLI para gestao de marcas
 *
 * Comandos:
 *   node bin/av-brand.js list                                  Listar marcas
 *   node bin/av-brand.js add "Nome" --logo /path/logo.png      Adicionar marca
 *   node bin/av-brand.js update <slug> --style bold             Atualizar marca
 *   node bin/av-brand.js remove <slug>                          Remover marca
 *   node bin/av-brand.js show <slug>                            Detalhes da marca
 */

const path = require('path');
const { addBrand, updateBrand, removeBrand, getBrand, listBrands } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'brand-catalog'));

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('');
    console.log('  Central Audiovisual — Brand Catalog');
    console.log('');
    console.log('  node bin/av-brand.js list');
    console.log('  node bin/av-brand.js add "Reals" --logo /path/logo.png');
    console.log('  node bin/av-brand.js add "Bingo" --style bold --18');
    console.log('  node bin/av-brand.js update <slug> --logo /new/logo.png');
    console.log('  node bin/av-brand.js show <slug>');
    console.log('  node bin/av-brand.js remove <slug>');
    console.log('');
    process.exit(0);
  }

  const command = args[0];

  try {
    if (command === 'list') {
      const brands = listBrands();
      if (brands.length === 0) { console.log('\n  Nenhuma marca cadastrada.\n'); process.exit(0); }
      console.log('\n  ── Marcas ───────────────────────────────────────');
      for (const b of brands) {
        const logo = b.logo ? 'com logo' : 'sem logo';
        console.log(`  ${b.slug.padEnd(20)}  ${b.name.padEnd(20)}  ${b.subtitleStyle.padEnd(10)}  ${logo}`);
      }
      console.log(`\n  Total: ${brands.length}\n`);

    } else if (command === 'add') {
      const name = args[1];
      if (!name) { console.error('  Nome da marca necessario'); process.exit(1); }
      const config = parseFlags(args.slice(2));
      const brand = addBrand(name, config);
      console.log(`\n  Marca adicionada: ${brand.name} (${brand.slug})\n`);

    } else if (command === 'update') {
      const slug = args[1];
      if (!slug) { console.error('  Slug da marca necessario'); process.exit(1); }
      const updates = parseFlags(args.slice(2));
      const brand = updateBrand(slug, updates);
      console.log(`\n  Marca atualizada: ${brand.name}\n`);

    } else if (command === 'remove') {
      const slug = args[1];
      if (!slug) { console.error('  Slug da marca necessario'); process.exit(1); }
      const brand = removeBrand(slug);
      console.log(`\n  Marca removida: ${brand.name}\n`);

    } else if (command === 'show') {
      const slug = args[1];
      if (!slug) { console.error('  Slug da marca necessario'); process.exit(1); }
      const brand = getBrand(slug);
      console.log(`\n  ── ${brand.name} ──────────────────────────────`);
      console.log(`  Slug: ${brand.slug}`);
      console.log(`  Logo: ${brand.logo || 'nenhum'}`);
      console.log(`  Posicao: ${brand.logoPosition}`);
      console.log(`  Estilo legenda: ${brand.subtitleStyle}`);
      console.log(`  +18: ${brand.overlay18 ? 'sim' : 'nao'}`);
      console.log(`  Cores: ${JSON.stringify(brand.colors)}`);
      console.log('');

    } else {
      console.error(`  Comando desconhecido: ${command}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n  Erro: ${err.message}\n`);
    process.exit(1);
  }
}

function parseFlags(args) {
  const config = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--logo') config.logo = args[++i];
    if (args[i] === '--style') config.subtitleStyle = args[++i];
    if (args[i] === '--position') config.logoPosition = args[++i];
    if (args[i] === '--18') config.overlay18 = true;
    if (args[i] === '--scale') config.logoScale = parseFloat(args[++i]);
    if (args[i] === '--opacity') config.logoOpacity = parseFloat(args[++i]);
  }
  return config;
}

main();
