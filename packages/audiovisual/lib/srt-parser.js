#!/usr/bin/env node
'use strict';

/**
 * srt-parser.js — Parse and generate SRT subtitle files
 * Story: AV-2.2
 */

function parseTimestamp(ts) {
  // Format: HH:MM:SS,mmm
  const match = ts.trim().match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;
  const [, h, m, s, ms] = match;
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function parseSRT(content) {
  const blocks = content.trim().split(/\n\s*\n/);
  const segments = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(.+?)\s*-->\s*(.+)/);
    if (!timeMatch) continue;

    const start = parseTimestamp(timeMatch[1]);
    const end = parseTimestamp(timeMatch[2]);
    const text = lines.slice(2).join(' ').trim();

    if (text) {
      segments.push({
        start,
        end,
        text,
        confidence: 1.0,
      });
    }
  }

  return segments;
}

function generateSRT(segments) {
  return segments
    .map((seg, i) => {
      const start = formatTimestamp(seg.start);
      const end = formatTimestamp(seg.end);
      return `${i + 1}\n${start} --> ${end}\n${seg.text}`;
    })
    .join('\n\n') + '\n';
}

function parseVTT(content) {
  // Remove WEBVTT header
  const body = content.replace(/^WEBVTT.*\n\n?/, '');
  return parseSRT(body);
}

module.exports = {
  parseTimestamp,
  formatTimestamp,
  parseSRT,
  generateSRT,
  parseVTT,
};
