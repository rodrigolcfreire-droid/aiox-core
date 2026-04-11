#!/usr/bin/env node
'use strict';

/**
 * branding.js — Brand identity overlay engine
 * Story: AV-4.3
 *
 * Applies logo watermark, intro/outro, and brand colors
 * to video cuts using FFmpeg filters.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectDir } = require('./project');

const DEFAULT_PRESET = {
  logo: null,
  logoPosition: 'top-right', // top-left, top-right, bottom-left, bottom-right
  logoScale: 0.1, // percentage of video width
  logoOpacity: 0.8,
  introVideo: null,
  outroVideo: null,
};

const LOGO_POSITIONS = {
  'top-left': '10:10',
  'top-right': 'W-w-10:10',
  'bottom-left': '10:H-h-10',
  'bottom-right': 'W-w-10:H-h-10',
};

function loadPreset(projectId) {
  const projectDir = getProjectDir(projectId);
  const presetPath = path.join(projectDir, 'branding-preset.json');

  if (fs.existsSync(presetPath)) {
    return { ...DEFAULT_PRESET, ...JSON.parse(fs.readFileSync(presetPath, 'utf8')) };
  }

  // Check squad-level preset
  const squadPreset = path.resolve(__dirname, '..', '..', '..', 'squads', 'central-audiovisual', 'data', 'branding-preset.json');
  if (fs.existsSync(squadPreset)) {
    return { ...DEFAULT_PRESET, ...JSON.parse(fs.readFileSync(squadPreset, 'utf8')) };
  }

  return DEFAULT_PRESET;
}

function applyLogoWatermark(videoPath, logoPath, outputPath, position = 'top-right', scale = 0.1, opacity = 0.8) {
  if (!fs.existsSync(logoPath)) {
    throw new Error(`Logo file not found: ${logoPath}`);
  }

  const pos = LOGO_POSITIONS[position] || LOGO_POSITIONS['top-right'];

  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${videoPath}"`,
    '-i', `"${logoPath}"`,
    '-filter_complex',
    `"[1:v]scale=iw*${scale}:-1,format=rgba,colorchannelmixer=aa=${opacity}[logo];[0:v][logo]overlay=${pos}[out]"`,
    '-map', '"[out]"',
    '-map', '0:a?',
    '-c:a', 'copy',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300000 });
  } catch (err) {
    throw new Error(`Failed to apply logo watermark: ${err.message}`);
  }
}

function applyBranding(projectId, cutId) {
  const projectDir = getProjectDir(projectId);
  const productionDir = path.join(projectDir, 'production');
  const preset = loadPreset(projectId);

  // Find subtitled video (or assembled if no subtitles)
  let inputPath = path.join(productionDir, `subtitled-${cutId}.mp4`);
  if (!fs.existsSync(inputPath)) {
    inputPath = path.join(productionDir, `assembled-${cutId}.mp4`);
  }
  if (!fs.existsSync(inputPath)) {
    throw new Error(`No video found for ${cutId}. Run assembly/subtitles first.`);
  }

  const outputPath = path.join(productionDir, `branded-${cutId}.mp4`);

  // If logo exists, apply watermark
  if (preset.logo && fs.existsSync(preset.logo)) {
    console.log(`  Applying logo watermark (${preset.logoPosition})...`);
    applyLogoWatermark(
      inputPath, preset.logo, outputPath,
      preset.logoPosition, preset.logoScale, preset.logoOpacity,
    );
  } else {
    // No branding to apply, just copy
    console.log('  No branding preset found, copying as-is.');
    fs.copyFileSync(inputPath, outputPath);
  }

  return { cutId, outputPath, preset };
}

function savePreset(projectId, presetData) {
  const projectDir = getProjectDir(projectId);
  const presetPath = path.join(projectDir, 'branding-preset.json');
  fs.writeFileSync(presetPath, JSON.stringify({ ...DEFAULT_PRESET, ...presetData }, null, 2));
  return presetPath;
}

module.exports = {
  applyBranding,
  applyLogoWatermark,
  loadPreset,
  savePreset,
  DEFAULT_PRESET,
  LOGO_POSITIONS,
};
