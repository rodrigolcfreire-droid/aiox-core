#!/usr/bin/env node
'use strict';

/**
 * audiovisual/index.js — Central Audiovisual package entry
 * Story: AV-2.1
 */

const constants = require('./lib/constants');
const project = require('./lib/project');
const ffprobe = require('./lib/ffprobe');
const ingest = require('./lib/ingest');

module.exports = {
  ...constants,
  ...project,
  ...ffprobe,
  ...ingest,
};
