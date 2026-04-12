#!/usr/bin/env node
'use strict';

/**
 * subtitle-presets.js — Preset library for subtitle styling
 * Story: EG-2
 *
 * Provides 15 visual presets for subtitle burn, organized by expert.
 * Each preset maps to FFmpeg-compatible style parameters used by subtitles.js.
 */

// ── Preset Definitions ─────────────────────────────────────

const PRESETS = {
  'iris-default': {
    id: 'iris-default',
    name: 'Iris Default',
    expert: 'iristhaize',
    style: {
      font: 'Montserrat Bold',
      size: 56,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 4,
      background: null,
      position: 'center-bottom',
      opacity: 1.0,
    },
    animation: { type: 'fade', duration: 300, easing: 'linear' },
    highlight: { mode: 'word-by-word', color: '#FFD700' },
  },
  'iris-clean': {
    id: 'iris-clean',
    name: 'Iris Clean',
    expert: 'iristhaize',
    style: {
      font: 'Inter Medium',
      size: 48,
      color: '#FFFFFF',
      strokeColor: '#333333',
      strokeWidth: 2,
      background: null,
      position: 'bottom',
      opacity: 1.0,
    },
    animation: { type: 'none', duration: 0, easing: null },
    highlight: { mode: 'none', color: null },
  },
  'iris-forte': {
    id: 'iris-forte',
    name: 'Iris Forte',
    expert: 'iristhaize',
    style: {
      font: 'Montserrat Black',
      size: 72,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 8,
      background: null,
      position: 'center',
      opacity: 1.0,
    },
    animation: { type: 'pop', duration: 200, easing: 'bounce' },
    highlight: { mode: 'word-by-word', color: '#FFD700' },
  },
  'caio-pop': {
    id: 'caio-pop',
    name: 'Caio Pop',
    expert: 'caio-roleta',
    style: {
      font: 'Poppins Bold',
      size: 60,
      color: '#FF6B35',
      strokeColor: '#000000',
      strokeWidth: 5,
      background: null,
      position: 'center-bottom',
      opacity: 1.0,
    },
    animation: { type: 'pop', duration: 250, easing: 'linear' },
    highlight: { mode: 'word-by-word', color: '#FFFF00' },
  },
  'caio-bold': {
    id: 'caio-bold',
    name: 'Caio Bold',
    expert: 'caio-roleta',
    style: {
      font: 'Bebas Neue',
      size: 80,
      color: '#FFFFFF',
      strokeColor: '#FF0000',
      strokeWidth: 6,
      background: null,
      position: 'center',
      opacity: 1.0,
    },
    animation: { type: 'pop', duration: 150, easing: 'linear' },
    highlight: { mode: 'word-by-word', color: '#FF0000' },
  },
  'karaoke': {
    id: 'karaoke',
    name: 'Karaoke',
    expert: 'shared',
    style: {
      font: 'Roboto Bold',
      size: 56,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 4,
      background: null,
      position: 'center-bottom',
      opacity: 1.0,
    },
    animation: { type: 'none', duration: 0, easing: null },
    highlight: { mode: 'word-by-word', color: '#00BFFF' },
  },
  'beasty': {
    id: 'beasty',
    name: 'Beasty',
    expert: 'shared',
    style: {
      font: 'Impact',
      size: 80,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 8,
      background: null,
      position: 'center',
      opacity: 1.0,
    },
    animation: { type: 'pop', duration: 200, easing: 'ease-out' },
    highlight: { mode: 'word-by-word', color: '#00FF00' },
  },
  'minimal': {
    id: 'minimal',
    name: 'Minimal',
    expert: 'shared',
    style: {
      font: 'Inter Regular',
      size: 40,
      color: '#CCCCCC',
      strokeColor: null,
      strokeWidth: 0,
      background: 'rgba(0,0,0,0.5)',
      position: 'bottom',
      opacity: 1.0,
    },
    animation: { type: 'fade', duration: 500, easing: 'linear' },
    highlight: { mode: 'none', color: null },
  },
  'hormozi': {
    id: 'hormozi',
    name: 'Hormozi',
    expert: 'shared',
    style: {
      font: 'Montserrat Black',
      size: 72,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 6,
      background: null,
      position: 'center',
      opacity: 1.0,
    },
    animation: { type: 'pop', duration: 200, easing: 'linear' },
    highlight: { mode: 'word-by-word', color: '#F7C204' },
  },
  'tiktok-native': {
    id: 'tiktok-native',
    name: 'TikTok Native',
    expert: 'shared',
    style: {
      font: 'Arial Bold',
      size: 56,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 4,
      background: null,
      position: 'center-bottom',
      opacity: 1.0,
    },
    animation: { type: 'pop', duration: 400, easing: 'linear' },
    highlight: { mode: 'word-by-word', color: '#87CEEB' },
  },
  'reels-box': {
    id: 'reels-box',
    name: 'Reels Box',
    expert: 'shared',
    style: {
      font: 'Helvetica Bold',
      size: 52,
      color: '#000000',
      strokeColor: null,
      strokeWidth: 0,
      background: 'rgba(255,255,255,0.9)',
      position: 'center',
      opacity: 1.0,
    },
    animation: { type: 'fade', duration: 300, easing: 'linear' },
    highlight: { mode: 'none', color: null },
  },
  'shorts-fade': {
    id: 'shorts-fade',
    name: 'Shorts Fade',
    expert: 'shared',
    style: {
      font: 'Roboto Medium',
      size: 52,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 5,
      background: null,
      position: 'center-bottom',
      opacity: 1.0,
    },
    animation: { type: 'fade', duration: 500, easing: 'linear' },
    highlight: { mode: 'word-by-word', color: '#FFD700' },
  },
  'cinematic': {
    id: 'cinematic',
    name: 'Cinematic',
    expert: 'shared',
    style: {
      font: 'Georgia Italic',
      size: 44,
      color: '#E0E0E0',
      strokeColor: null,
      strokeWidth: 0,
      background: 'rgba(0,0,0,0.7)',
      position: 'bottom',
      opacity: 1.0,
    },
    animation: { type: 'fade', duration: 800, easing: 'linear' },
    highlight: { mode: 'none', color: null },
  },
  'outline-bold': {
    id: 'outline-bold',
    name: 'Outline Bold',
    expert: 'shared',
    style: {
      font: 'Impact',
      size: 68,
      color: '#FFFFFF',
      strokeColor: '#FF4444',
      strokeWidth: 8,
      background: null,
      position: 'center',
      opacity: 1.0,
    },
    animation: { type: 'none', duration: 0, easing: null },
    highlight: { mode: 'none', color: null },
  },
  'neon-glow': {
    id: 'neon-glow',
    name: 'Neon Glow',
    expert: 'shared',
    style: {
      font: 'Montserrat Bold',
      size: 60,
      color: '#00FFFF',
      strokeColor: '#FF00FF',
      strokeWidth: 3,
      background: 'rgba(0,0,0,0.6)',
      position: 'center',
      opacity: 1.0,
    },
    animation: { type: 'pop', duration: 300, easing: 'linear' },
    highlight: { mode: 'word-by-word', color: '#FF00FF' },
  },
};

// ── Public API ──────────────────────────────────────────────

/**
 * Get a preset by id.
 * @param {string} id - Preset identifier
 * @returns {Object} Preset definition
 * @throws {Error} If preset not found
 */
function getPreset(id) {
  const preset = PRESETS[id];
  if (!preset) {
    const available = Object.keys(PRESETS).join(', ');
    throw new Error(`Preset not found: "${id}". Available: ${available}`);
  }
  return { ...preset };
}

/**
 * List all available presets.
 * @returns {Object[]} Array of preset objects
 */
function listPresets() {
  return Object.values(PRESETS).map(p => ({ ...p }));
}

/**
 * List presets filtered by expert name.
 * @param {string} expert - Expert identifier (e.g., 'iristhaize', 'shared')
 * @returns {Object[]} Filtered preset array
 */
function listPresetsByExpert(expert) {
  return Object.values(PRESETS)
    .filter(p => p.expert === expert)
    .map(p => ({ ...p }));
}

/**
 * Convert a preset's style to an FFmpeg-compatible style object.
 * Maps preset fields to ASS subtitle parameters used by subtitles.js.
 *
 * @param {string} id - Preset identifier
 * @returns {Object} FFmpeg/ASS-compatible style object
 */
function getPresetStyle(id) {
  const preset = getPreset(id);
  const s = preset.style;

  // Map hex color to ASS color format (&HBBGGRR)
  function hexToASS(hex) {
    if (!hex) return '&H00000000';
    const clean = hex.replace('#', '');
    const r = clean.slice(0, 2);
    const g = clean.slice(2, 4);
    const b = clean.slice(4, 6);
    return `&H00${b}${g}${r}`.toUpperCase();
  }

  // Position mapping
  const POSITION_MAP = {
    'center-bottom': 2,
    'bottom': 2,
    'center': 5,
    'top': 8,
    'center-top': 8,
  };

  return {
    fontName: s.font,
    fontSize: s.size,
    primaryColor: hexToASS(s.color),
    outlineColor: s.strokeColor ? hexToASS(s.strokeColor) : '&H00000000',
    outline: s.strokeWidth,
    shadow: Math.min(Math.ceil(s.strokeWidth / 2), 3),
    bold: s.font.toLowerCase().includes('bold') || s.font.toLowerCase().includes('black') ? 1 : 0,
    alignment: POSITION_MAP[s.position] || 2,
    marginV: s.position === 'center' ? 0 : 40,
    backColor: s.background ? '&H80000000' : '&H00000000',
    highlight: preset.highlight,
    animation: preset.animation,
  };
}

module.exports = {
  getPreset,
  listPresets,
  listPresetsByExpert,
  getPresetStyle,
  PRESETS,
};
