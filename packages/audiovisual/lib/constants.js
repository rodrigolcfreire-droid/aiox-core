#!/usr/bin/env node
'use strict';

/**
 * constants.js — Central Audiovisual constants
 * Story: AV-2.1
 */

const path = require('path');

const AIOX_DIR = path.resolve(__dirname, '..', '..', '..', '.aiox');
const AV_DIR = path.join(AIOX_DIR, 'audiovisual');
const PROJECTS_DIR = path.join(AV_DIR, 'projects');

const SUPPORTED_FORMATS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];

const PROJECT_STATUS = {
  CREATED: 'created',
  INGESTING: 'ingesting',
  ANALYZING: 'analyzing',
  ANALYZED: 'analyzed',
  PRODUCING: 'producing',
  RENDERED: 'rendered',
  PUBLISHED: 'published',
  DONE: 'done',
  ERROR: 'error',
};

const ASSET_TYPES = {
  SOURCE: 'source',
  ASSEMBLED: 'assembled',
  SUBTITLED: 'subtitled',
  BRANDED: 'branded',
  FINAL: 'final',
};

const CUT_CATEGORIES = [
  'viral',
  'autoridade',
  'educativo',
  'storytelling',
  'cta',
  'bastidores',
  'tendencia',
];

const VIDEO_FORMATS = ['9:16', '16:9', '1:1', '4:5'];

const PROJECT_SUBDIRS = ['source', 'analysis', 'cuts', 'production', 'output'];

module.exports = {
  AIOX_DIR,
  AV_DIR,
  PROJECTS_DIR,
  SUPPORTED_FORMATS,
  PROJECT_STATUS,
  ASSET_TYPES,
  CUT_CATEGORIES,
  VIDEO_FORMATS,
  PROJECT_SUBDIRS,
};
