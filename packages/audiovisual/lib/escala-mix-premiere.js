'use strict';

/**
 * escala-mix-premiere.js — Premiere XML exporter for Escala Mix renders.
 * Story: EM-1
 *
 * Gera XML FCP (Final Cut XML) compativel com Adobe Premiere Pro.
 * Saida: 1 bin "Renders Escala Mix" com cada MP4 final como file ref,
 *        + sequencias individuais prontas por render.
 *
 * Zero deps. Reusa helpers de xml-mapper.
 */

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const {
  tag, xmlDeclaration, fcpDoctype,
  buildRate, buildTimecode, buildFormat, buildFileRef,
} = require(path.resolve(__dirname, 'xml-mapper'));
const store = require(path.resolve(__dirname, 'escala-mix-store'));

const DEFAULT_FPS = 30;
const DEFAULT_RES = { width: 1080, height: 1920 };

function probeDurationSeconds(videoPath) {
  return new Promise(resolve => {
    execFile('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', videoPath,
    ], { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve(60);
      const d = parseFloat(String(stdout).trim());
      resolve(Number.isFinite(d) && d > 0 ? d : 60);
    });
  });
}

function buildSequenceForRender(render, fileId, indent = 3) {
  const fps = DEFAULT_FPS;
  const frames = Math.round(render.durationSeconds * fps);
  const clipItem = tag('clipitem', { id: `clipitem-${render.id}` }, [
    tag('name', {}, render.name, indent + 3),
    tag('enabled', {}, 'TRUE', indent + 3),
    tag('duration', {}, String(frames), indent + 3),
    ...buildRate(fps, indent + 3),
    tag('start', {}, '0', indent + 3),
    tag('end', {}, String(frames), indent + 3),
    tag('in', {}, '0', indent + 3),
    tag('out', {}, String(frames), indent + 3),
    tag('file', { id: fileId }, null, indent + 3),
  ], indent + 2);

  return tag('sequence', { id: `seq-${render.id}` }, [
    tag('name', {}, render.name, indent + 1),
    tag('duration', {}, String(frames), indent + 1),
    ...buildRate(fps, indent + 1),
    ...buildTimecode(fps, indent + 1),
    tag('media', {}, [
      tag('video', {}, [
        buildFormat(DEFAULT_RES, fps, indent + 3),
        tag('track', {}, [
          clipItem,
          tag('enabled', {}, 'TRUE', indent + 3),
          tag('locked', {}, 'FALSE', indent + 3),
        ], indent + 2),
      ], indent + 2),
      tag('audio', {}, [
        tag('numOutputChannels', {}, '2', indent + 3),
        tag('track', {}, [
          tag('clipitem', { id: `clipitem-audio-${render.id}` }, [
            tag('name', {}, render.name, indent + 4),
            tag('enabled', {}, 'TRUE', indent + 4),
            tag('duration', {}, String(frames), indent + 4),
            ...buildRate(fps, indent + 4),
            tag('start', {}, '0', indent + 4),
            tag('end', {}, String(frames), indent + 4),
            tag('in', {}, '0', indent + 4),
            tag('out', {}, String(frames), indent + 4),
            tag('file', { id: fileId }, null, indent + 4),
          ], indent + 3),
          tag('enabled', {}, 'TRUE', indent + 3),
          tag('locked', {}, 'FALSE', indent + 3),
        ], indent + 2),
      ], indent + 2),
    ], indent + 1),
  ], indent);
}

async function buildXmlForMix(mixId, { renderIds = null } = {}) {
  const pool = store.readPool(mixId);
  if (!pool.renders || pool.renders.length === 0) {
    throw new Error('Mix sem renders concluidos');
  }

  const selected = pool.renders
    .filter(r => r.status === 'done' && r.output && fs.existsSync(r.output))
    .filter(r => !renderIds || renderIds.includes(r.id));

  if (selected.length === 0) throw new Error('Nenhum render pronto para exportar');

  for (const r of selected) {
    r.durationSeconds = await probeDurationSeconds(r.output);
  }

  const fileRefs = selected.map((r, i) => buildFileRef(
    `file-${r.id}`, r.output, r.durationSeconds, DEFAULT_FPS, DEFAULT_RES, 4,
  ));

  const sequences = selected.map(r => buildSequenceForRender(r, `file-${r.id}`, 3));

  const xml = [
    xmlDeclaration(),
    fcpDoctype(),
    tag('xmeml', { version: '5' }, [
      tag('project', {}, [
        tag('name', {}, `Escala Mix — ${pool.name || mixId}`, 2),
        tag('children', {}, [
          tag('bin', {}, [
            tag('name', {}, 'Renders Escala Mix', 4),
            tag('children', {}, fileRefs, 4),
          ], 3),
          ...sequences,
        ], 2),
      ], 1),
    ], 0),
  ].join('');

  return {
    xml,
    filename: `escala-mix-${(pool.name || mixId).replace(/[^a-zA-Z0-9_-]/g, '_')}-premiere.xml`,
    count: selected.length,
  };
}

module.exports = { buildXmlForMix };
