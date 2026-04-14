#!/usr/bin/env node
'use strict';

/**
 * av-escala-mix.js — CLI for Hook × Dev × CTA creative multiplier.
 * Story: EM-1
 */

const path = require('path');
const store = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'escala-mix-store'));
const { renderAll } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'escala-mix-render'));

const KIND_ALIAS = { hook: 'hooks', dev: 'devs', development: 'devs', desenvolvimento: 'devs', cta: 'ctas' };

function help() {
  console.log(`
  ESCALA MIX — Hook × Desenvolvimento × CTA

  Gerenciamento de mixes:
    av-escala-mix new [nome]                 Cria novo mix, retorna mixId
    av-escala-mix list                       Lista mixes existentes
    av-escala-mix show <mixId>               Mostra pools de um mix
    av-escala-mix delete <mixId>             Deleta mix e assets

  Pools:
    av-escala-mix add <mixId> hook|dev|cta <file> [--name "X"]
    av-escala-mix remove <mixId> <assetId>

  Geracao:
    av-escala-mix plan <mixId> [--limit N]   Preview combinacoes sem renderizar
    av-escala-mix generate <mixId> [--limit N] [--width 1080] [--height 1920]

  Rating / Ranking:
    av-escala-mix rate <mixId> <renderId> <0-5>   Rating do render
    av-escala-mix ranking <mixId>                 Top hooks/devs/ctas

  IA (OpenAI):
    av-escala-mix ai-suggest hook|cta "tema" [--count N]    Sugere copy
    av-escala-mix ai-from-top <mixId> hook|cta [--count N]  Sugere baseado no top rated

  Exemplos:
    av-escala-mix new "campanha-black-friday"
    av-escala-mix add mix-abc1234 hook ./hook1.mp4 --name "hook-A"
    av-escala-mix generate mix-abc1234 --limit 10
  `);
}

function parseArg(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

function cmdNew(args) {
  const name = args.filter(a => !a.startsWith('--')).join(' ') || null;
  const mix = store.createMix(name);
  console.log(`\n  Mix criado: ${mix.mixId}`);
  console.log(`  Nome: ${mix.name}`);
  console.log(`  Dir: .aiox/audiovisual/escala-mix/${mix.mixId}/\n`);
}

function cmdList() {
  const mixes = store.listMixes();
  if (mixes.length === 0) { console.log('\n  Nenhum mix.\n'); return; }
  console.log('\n  ── Mixes ──────────────────────────────────────');
  for (const m of mixes) {
    console.log(`  ${m.mixId}  h=${m.hooks.length} d=${m.devs.length} c=${m.ctas.length}  ${m.name}`);
  }
  console.log(`\n  Total: ${mixes.length}\n`);
}

function cmdShow(mixId) {
  const pool = store.readPool(mixId);
  console.log(`\n  ── ${pool.mixId} (${pool.name}) ──────────────────`);
  for (const kind of ['hooks', 'devs', 'ctas']) {
    console.log(`\n  [${kind.toUpperCase()}] (${pool[kind].length})`);
    for (const a of pool[kind]) {
      console.log(`    ${a.id}  ${a.sizeMB}MB  ${a.name}`);
    }
  }
  const renders = pool.renders || [];
  const done = renders.filter(r => r.status === 'done').length;
  const failed = renders.filter(r => r.status === 'failed').length;
  console.log(`\n  Renders: ${renders.length} total, ${done} done, ${failed} failed\n`);
}

function cmdAdd(args) {
  const [mixId, rawKind, file] = args;
  if (!mixId || !rawKind || !file) { console.error('Usage: add <mixId> hook|dev|cta <file>'); process.exit(1); }
  const kind = KIND_ALIAS[rawKind.toLowerCase()];
  if (!kind) { console.error(`Invalid kind "${rawKind}". Use: hook, dev, cta`); process.exit(1); }
  const name = parseArg(args, '--name');
  const asset = store.addAsset(mixId, kind, path.resolve(file), name);
  console.log(`\n  Adicionado ${asset.id} em ${kind}`);
  console.log(`  Nome: ${asset.name}\n`);
}

function cmdRemove(args) {
  const [mixId, assetId] = args;
  if (!mixId || !assetId) { console.error('Usage: remove <mixId> <assetId>'); process.exit(1); }
  const pool = store.readPool(mixId);
  // Find kind from asset prefix (h_, d_, c_)
  const prefix = assetId.slice(0, 2);
  const kind = prefix === 'h_' ? 'hooks' : prefix === 'd_' ? 'devs' : prefix === 'c_' ? 'ctas' : null;
  if (!kind) { console.error(`Cannot infer kind from assetId "${assetId}"`); process.exit(1); }
  store.removeAsset(mixId, kind, assetId);
  console.log(`\n  Removido ${assetId} de ${kind}\n`);
}

function cmdPlan(args) {
  const [mixId] = args;
  if (!mixId) { console.error('Usage: plan <mixId>'); process.exit(1); }
  const limit = parseArg(args, '--limit');
  const renders = store.planRenders(mixId, limit ? parseInt(limit, 10) : null);
  console.log(`\n  Combinacoes planejadas: ${renders.length}\n`);
  for (const r of renders.slice(0, 20)) {
    console.log(`    ${r.name}`);
  }
  if (renders.length > 20) console.log(`    ... +${renders.length - 20} mais\n`);
  else console.log('');
}

async function cmdGenerate(args) {
  const [mixId] = args;
  if (!mixId) { console.error('Usage: generate <mixId>'); process.exit(1); }
  const limit = parseArg(args, '--limit');
  const width = parseArg(args, '--width');
  const height = parseArg(args, '--height');
  const preset = parseArg(args, '--preset') || 'medium';
  const opts = {
    width: width ? parseInt(width, 10) : 1080,
    height: height ? parseInt(height, 10) : 1920,
    preset,
  };
  console.log(`\n  Iniciando geracao ${mixId} (${opts.width}x${opts.height}, preset=${preset})...\n`);
  const results = await renderAll(mixId, {
    limit: limit ? parseInt(limit, 10) : null,
    opts,
    onProgress: e => {
      if (e.phase === 'start') console.log(`  [${e.index + 1}/${e.total}] Renderizando ${e.render.name}...`);
      else if (e.phase === 'done') console.log(`  [${e.index + 1}/${e.total}] OK -> ${path.basename(e.output)}`);
      else if (e.phase === 'failed') console.log(`  [${e.index + 1}/${e.total}] FAIL: ${e.error}`);
    },
  });
  const ok = results.filter(r => r.status === 'done').length;
  console.log(`\n  Concluido: ${ok}/${results.length} OK\n`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') return help();
  try {
    switch (command) {
      case 'new': return cmdNew(args);
      case 'list': return cmdList();
      case 'show': return cmdShow(args[0]);
      case 'delete': return store.deleteMix(args[0]) && console.log(`\n  Deletado ${args[0]}\n`);
      case 'add': return cmdAdd(args);
      case 'remove': return cmdRemove(args);
      case 'plan': return cmdPlan(args);
      case 'generate': return cmdGenerate(args);
      case 'rate': {
        const [mixId, renderId, ratingRaw] = args;
        if (!mixId || !renderId || ratingRaw === undefined) { console.error('Usage: rate <mixId> <renderId> <0-5>'); process.exit(1); }
        const r = store.setRenderRating(mixId, renderId, parseFloat(ratingRaw));
        console.log(`\n  ${renderId} -> ${r.rating} stars\n`);
        return;
      }
      case 'ai-suggest': {
        const { generateSuggestions } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'ai-hook-generator'));
        const [type, ...themeParts] = args.filter(a => !a.startsWith('--'));
        if (!type || themeParts.length === 0) { console.error('Usage: ai-suggest hook|cta "tema" [--count N]'); process.exit(1); }
        const count = parseInt(parseArg(args, '--count') || '5', 10);
        const theme = themeParts.join(' ');
        generateSuggestions({ type, theme, count }).then(items => {
          console.log(`\n  ${type.toUpperCase()} (${items.length}):`);
          items.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
          console.log('');
        }).catch(err => { console.error(`\n  ERRO: ${err.message}\n`); process.exit(1); });
        return;
      }
      case 'ai-from-top': {
        const { suggestFromTop } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'ai-hook-generator'));
        const [mixId, kind] = args.filter(a => !a.startsWith('--'));
        if (!mixId || !kind) { console.error('Usage: ai-from-top <mixId> hook|cta'); process.exit(1); }
        const count = parseInt(parseArg(args, '--count') || '5', 10);
        suggestFromTop({ mixId, kind, count }).then(items => {
          console.log(`\n  Variacoes de ${kind} baseadas no top rated (${items.length}):`);
          items.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
          console.log('');
        }).catch(err => { console.error(`\n  ERRO: ${err.message}\n`); process.exit(1); });
        return;
      }
      case 'ranking': {
        const [mixId] = args;
        if (!mixId) { console.error('Usage: ranking <mixId>'); process.exit(1); }
        const rank = store.getRanking(mixId);
        for (const kind of ['hooks', 'devs', 'ctas']) {
          console.log(`\n  [${kind.toUpperCase()}]`);
          if (rank[kind].length === 0) { console.log('    (sem ratings ainda)'); continue; }
          for (const a of rank[kind]) console.log(`    ${a.rating.toFixed(2)} (${a.ratings}x)  ${a.name}`);
        }
        console.log('');
        return;
      }
      default: console.error(`Comando desconhecido: ${command}`); help(); process.exit(1);
    }
  } catch (err) {
    console.error(`\n  ERRO: ${err.message}\n`);
    process.exit(1);
  }
}

main();
