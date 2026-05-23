'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';

const STYLES = {
  navy: {
    label: 'Navy',
    bg: 'gradient:rgba(20,28,48,0.82)-rgba(6,10,20,0.85)',
    text: '#f1f4ff',
    border: 'rgba(255,255,255,0.14)',
    highlight: 'rgba(255,255,255,0.28)',
  },
  white: {
    label: 'White',
    bg: 'gradient:rgba(255,255,255,0.92)-rgba(235,235,240,0.88)',
    text: '#0a0e1a',
    border: 'rgba(0,0,0,0.08)',
    highlight: 'rgba(255,255,255,0.6)',
  },
  red: {
    label: 'Red',
    bg: 'gradient:rgba(220,38,60,0.85)-rgba(160,20,40,0.88)',
    text: '#ffffff',
    border: 'rgba(255,255,255,0.2)',
    highlight: 'rgba(255,200,200,0.4)',
  },
  gold: {
    label: 'Gold',
    bg: 'gradient:rgba(212,175,55,0.85)-rgba(150,120,30,0.88)',
    text: '#1a1408',
    border: 'rgba(255,235,180,0.3)',
    highlight: 'rgba(255,250,220,0.5)',
  },
  green: {
    label: 'Green',
    bg: 'gradient:rgba(20,160,80,0.85)-rgba(10,90,45,0.88)',
    text: '#ffffff',
    border: 'rgba(255,255,255,0.2)',
    highlight: 'rgba(200,255,210,0.4)',
  },
};

function stripEmoji(s) {
  return s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{1F900}-\u{1F9FF}]/gu, '').replace(/\s+/g, ' ').trim();
}

function clampTwoLines(text, size) {
  const innerW = size.width - (size.paddingX * 2);
  const avgChar = size.pointsize * 0.52;
  const maxCharsPerLine = Math.floor(innerW / avgChar);
  const maxChars = maxCharsPerLine * 2;
  if (text.length <= maxChars) return text;
  let cut = text.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.7) cut = cut.slice(0, lastSpace);
  return cut.replace(/[\s.,;:!?-]+$/, '') + '…';
}

function detectLayout(thumbPath) {
  if (!fs.existsSync(thumbPath)) return 'split';
  try {
    const out = execSync(`ffmpeg -i "${thumbPath}" -vf scale=1:64,format=gray -frames:v 1 -f rawvideo - 2>/dev/null`, { stdio: ['pipe', 'pipe', 'ignore'] });
    const lum = Array.from(out.slice(0, 64));
    let minVal = lum[24];
    for (let y = 25; y <= 40; y++) if (lum[y] < minVal) minVal = lum[y];
    const above = lum.slice(8, 18).reduce((a, b) => a + b, 0) / 10;
    const below = lum.slice(46, 56).reduce((a, b) => a + b, 0) / 10;
    return (minVal < 60 && (above - minVal > 25) && (below - minVal > 25)) ? 'split' : 'single';
  } catch (e) {
    return 'split';
  }
}

const SIZES = {
  S: { label: 'Pequeno', pointsize: 30, width: 520, paddingX: 22, paddingY: 18 },
  M: { label: 'Médio', pointsize: 38, width: 620, paddingX: 32, paddingY: 24 },
  L: { label: 'Grande', pointsize: 48, width: 720, paddingX: 38, paddingY: 28 },
};

const POSITIONS = {
  top: { label: 'Topo', resolve: (VH, PH) => 180 },
  middle: { label: 'Meio', resolve: (VH, PH) => Math.round((VH - PH) / 2) },
  bottom: { label: 'Fim', resolve: (VH, PH) => VH - PH - 180 },
  auto: { label: 'Auto', resolve: null },
};

function makeGlassPNG(text, style, size, outPath) {
  const tmpText = outPath + '.t.png';
  const tmpGrad = outPath + '.g.png';
  const tmpBg = outPath + '.bg.png';
  const tmpShadow = outPath + '.tmp.png';

  let r = spawnSync('magick', ['-size', size.width + 'x', '-background', 'none', '-fill', style.text,
    '-font', FONT, '-pointsize', String(size.pointsize), '-gravity', 'center', '-interline-spacing', '6',
    'caption:' + text, '-bordercolor', 'none', '-border', `${size.paddingX}x${size.paddingY}`, tmpText], { stdio: 'pipe' });
  if (r.status !== 0) throw new Error('text: ' + r.stderr.toString().slice(0, 200));

  const probe = execSync(`magick identify -format "%wx%h" "${tmpText}"`).toString().trim().split('x');
  const W = parseInt(probe[0]);
  const H = parseInt(probe[1]);

  r = spawnSync('magick', ['-size', `${W}x${H}`, style.bg, tmpGrad], { stdio: 'pipe' });
  if (r.status !== 0) throw new Error('grad: ' + r.stderr.toString().slice(0, 200));

  r = spawnSync('magick', ['-size', `${W}x${H}`, 'xc:none',
    '-fill', 'white', '-draw', `roundRectangle 0,0 ${W - 1},${H - 1} 24,24`,
    tmpGrad, '-compose', 'In', '-composite',
    '-fill', 'none', '-stroke', style.border, '-strokewidth', '1',
    '-draw', `roundRectangle 1,1 ${W - 2},${H - 2} 23,23`,
    '-stroke', style.highlight, '-strokewidth', '1.5',
    '-draw', `line 24,2 ${W - 25},2`,
    tmpBg], { stdio: 'pipe' });
  if (r.status !== 0) throw new Error('bg: ' + r.stderr.toString().slice(0, 200));

  r = spawnSync('magick', [tmpBg, '(', '+clone', '-background', 'black', '-shadow', '30x10+0+6', ')',
    '+swap', '-background', 'none', '-layers', 'merge', '+repage', tmpShadow], { stdio: 'pipe' });
  if (r.status !== 0) throw new Error('shadow: ' + r.stderr.toString().slice(0, 200));

  r = spawnSync('magick', [tmpShadow, tmpText, '-gravity', 'center', '-compose', 'Over', '-composite', outPath], { stdio: 'pipe' });
  if (r.status !== 0) throw new Error('compose: ' + r.stderr.toString().slice(0, 200));

  [tmpText, tmpGrad, tmpBg, tmpShadow].forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
}

function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function luminance(r, g, b) {
  const a = [r, g, b].map(v => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function buildCustomStyle(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const d = { r: Math.round(r * 0.65), g: Math.round(g * 0.65), b: Math.round(b * 0.65) };
  const isLight = luminance(r, g, b) > 0.55;
  return {
    label: 'Custom',
    bg: `gradient:rgba(${r},${g},${b},0.85)-rgba(${d.r},${d.g},${d.b},0.88)`,
    text: isLight ? '#0a0e1a' : '#f1f4ff',
    border: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.18)',
    highlight: isLight ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.28)',
  };
}

function restyleCut(projectId, cutId, opts) {
  const o = (typeof opts === 'string') ? { style: opts } : (opts || {});
  const styleKey = o.style || 'navy';
  let style;
  if (styleKey === 'custom' && o.customHex) {
    style = buildCustomStyle(o.customHex);
    if (!style) throw new Error(`Invalid customHex: ${o.customHex}`);
  } else {
    style = STYLES[styleKey];
    if (!style) throw new Error(`Unknown style: ${styleKey}`);
  }
  // Custom coords override presets
  const customX = (typeof o.customX === 'number') ? o.customX : null;
  const customY = (typeof o.customY === 'number') ? o.customY : null;
  const customWidth = (typeof o.customWidth === 'number') ? o.customWidth : null;
  const customFontsize = (typeof o.customFontsize === 'number') ? o.customFontsize : null;
  // Fallback presets
  const sizeKey = o.size || 'M';
  const positionKey = o.position || 'auto';
  const sizePreset = SIZES[sizeKey] || SIZES.M;
  const position = POSITIONS[positionKey] || POSITIONS.auto;
  // Build effective size (custom overrides preset)
  const size = {
    width: customWidth || sizePreset.width,
    pointsize: customFontsize || sizePreset.pointsize,
    paddingX: sizePreset.paddingX,
    paddingY: sizePreset.paddingY,
  };

  const projectsRoot = path.resolve(__dirname, '..', '..', '..', '.aiox', 'audiovisual', 'projects');
  const proj = path.join(projectsRoot, projectId);
  const cutsJson = path.join(proj, 'cuts', 'suggested-cuts.json');
  if (!fs.existsSync(cutsJson)) throw new Error('cuts json not found');

  const data = JSON.parse(fs.readFileSync(cutsJson, 'utf8'));
  const cut = (data.suggestedCuts || []).find(c => c.id === cutId);
  if (!cut) throw new Error(`Cut ${cutId} not found`);
  if (!cut.viralTitle) throw new Error(`Cut ${cutId} has no viralTitle to render`);

  const sourceDir = path.join(proj, 'source');
  const sourceFile = fs.readdirSync(sourceDir).find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));
  if (!sourceFile) throw new Error('No source video');
  const SRC = path.join(sourceDir, sourceFile);

  const previewsDir = path.join(proj, 'cuts', 'previews');
  const thumbPath = path.join(proj, 'cuts', 'thumbnails', `thumb-${cutId}.jpg`);
  const pngPath = path.join(previewsDir, `h-${cutId}.png`);

  const layout = detectLayout(thumbPath);
  const text = clampTwoLines(stripEmoji(cut.viralTitle), size);

  try {
    // Generate PNG just to compute final coords (validates layout + sizing) — preview MP4 stays clean.
    makeGlassPNG(text, style, size, pngPath);
    const probe = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${pngPath}" 2>/dev/null`).toString().trim().split(',');
    const PH = parseInt(probe[1]);
    const VH = 1280;
    let yPos, xPos;
    const PW = parseInt(probe[0]);
    const VW = 720;
    if (customY !== null) {
      yPos = Math.max(0, Math.min(1280 - PH, Math.round(customY)));
    } else if (positionKey === 'auto') {
      yPos = layout === 'split' ? Math.round((VH - PH) / 2) : 180;
    } else {
      yPos = position.resolve(VH, PH);
    }
    if (customX !== null) {
      xPos = Math.max(0, Math.min(VW - PW, Math.round(customX)));
    } else {
      xPos = Math.round((VW - PW) / 2);
    }
    const dur = (cut.end - cut.start).toFixed(2);

    cut.headlineStyle = styleKey;
    if (styleKey === 'custom' && o.customHex) {
      cut.headlineHex = String(o.customHex).startsWith('#') ? o.customHex.toLowerCase() : '#' + o.customHex.toLowerCase();
    } else {
      delete cut.headlineHex;
    }
    cut.headlineSize = sizeKey;
    cut.headlinePosition = positionKey;
    cut.headlineCustom = (customX !== null || customY !== null || customWidth !== null || customFontsize !== null)
      ? { x: xPos, y: yPos, width: size.width, fontsize: size.pointsize, pngWidth: PW, pngHeight: PH }
      : null;
    fs.writeFileSync(cutsJson, JSON.stringify(data, null, 2));

    return { cutId, style: styleKey, size: sizeKey, position: positionKey, layout, xPos, yPos, pngWidth: PW, pngHeight: PH, durationSec: parseFloat(dur), savedMetadataOnly: true };
  } finally {
    if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
  }
}

module.exports = { STYLES, SIZES, POSITIONS, restyleCut };
