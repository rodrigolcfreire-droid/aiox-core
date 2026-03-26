#!/usr/bin/env node
'use strict';

/**
 * export-package.js — Export package builder (ZIP)
 * Story: AV-13
 *
 * Packages XML + JSON + metadata into a ZIP file for download.
 * Uses Node.js native zlib — zero external dependencies.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { getProjectDir, loadProject } = require('./project');
const { exportPremiereXml } = require('./export-premiere-xml');
const { exportDaVinciXml } = require('./export-davinci-xml');
const { serializeTimeline } = require('./timeline-serializer');

/**
 * Minimal ZIP file builder using Node.js stdlib.
 * Creates a valid ZIP archive from an array of { name, data } entries.
 */
function createZip(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const dataBuffer = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');

    // Local file header (30 bytes + name + data)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // signature
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0, 6);             // flags
    local.writeUInt16LE(0, 8);             // compression (stored)
    local.writeUInt16LE(0, 10);            // mod time
    local.writeUInt16LE(0, 12);            // mod date
    // CRC-32
    const crc = crc32(dataBuffer);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuffer.length, 18);  // compressed size
    local.writeUInt32LE(dataBuffer.length, 22);  // uncompressed size
    local.writeUInt16LE(nameBuffer.length, 26);  // name length
    local.writeUInt16LE(0, 28);                  // extra length

    localHeaders.push(Buffer.concat([local, nameBuffer, dataBuffer]));

    // Central directory header (46 bytes + name)
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);  // signature
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0, 8);           // flags
    central.writeUInt16LE(0, 10);          // compression
    central.writeUInt16LE(0, 12);          // mod time
    central.writeUInt16LE(0, 14);          // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuffer.length, 20); // compressed
    central.writeUInt32LE(dataBuffer.length, 24); // uncompressed
    central.writeUInt16LE(nameBuffer.length, 28); // name length
    central.writeUInt16LE(0, 30);          // extra length
    central.writeUInt16LE(0, 32);          // comment length
    central.writeUInt16LE(0, 34);          // disk start
    central.writeUInt16LE(0, 36);          // internal attrs
    central.writeUInt32LE(0, 38);          // external attrs
    central.writeUInt32LE(offset, 42);     // local header offset

    centralHeaders.push(Buffer.concat([central, nameBuffer]));

    offset += 30 + nameBuffer.length + dataBuffer.length;
  }

  // End of central directory
  const centralDirData = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);              // signature
  eocd.writeUInt16LE(0, 4);                        // disk number
  eocd.writeUInt16LE(0, 6);                        // start disk
  eocd.writeUInt16LE(entries.length, 8);            // entries on disk
  eocd.writeUInt16LE(entries.length, 10);           // total entries
  eocd.writeUInt32LE(centralDirData.length, 12);    // central dir size
  eocd.writeUInt32LE(offset, 16);                   // central dir offset
  eocd.writeUInt16LE(0, 20);                        // comment length

  return Buffer.concat([...localHeaders, centralDirData, eocd]);
}

/**
 * CRC-32 calculation (standard polynomial).
 */
function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  const table = getCrc32Table();

  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF];
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let _crc32Table = null;
function getCrc32Table() {
  if (_crc32Table) return _crc32Table;

  _crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    _crc32Table[i] = c;
  }
  return _crc32Table;
}

/**
 * Build export package (ZIP) containing XML + JSON + metadata.
 */
function buildExportPackage(projectId, mode, editor, cutId) {
  // Generate the XML export
  let exportResult;
  if (editor === 'premiere') {
    exportResult = exportPremiereXml(projectId, mode, cutId);
  } else if (editor === 'davinci') {
    exportResult = exportDaVinciXml(projectId, mode, cutId);
  } else {
    throw new Error(`Unknown editor: ${editor}. Use: premiere, davinci`);
  }

  // Build timeline JSON
  const timeline = exportResult.timeline;
  const timelineJson = JSON.stringify(timeline, null, 2);

  // Build metadata summary
  const metadata = {
    projectId,
    projectName: timeline.projectName,
    editor,
    mode,
    cutId: cutId || null,
    exportedAt: new Date().toISOString(),
    clipCount: exportResult.clipCount,
    totalDuration: exportResult.totalDuration,
    totalDurationFormatted: formatDuration(exportResult.totalDuration),
    fps: timeline.timelineFPS,
    resolution: timeline.resolution,
    categories: timeline.metadata.categories,
    platforms: timeline.metadata.platforms,
    avgEngagement: timeline.metadata.avgEngagement,
    xmlFilename: exportResult.filename,
  };
  const metadataJson = JSON.stringify(metadata, null, 2);

  // Build ZIP entries
  const projectName = (timeline.projectName || projectId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const suffix = mode === 'single' && cutId ? cutId : mode;
  const prefix = `${projectName}-${editor}-${suffix}`;

  const entries = [
    { name: `${prefix}/${exportResult.filename}`, data: exportResult.xml },
    { name: `${prefix}/timeline.json`, data: timelineJson },
    { name: `${prefix}/metadata.json`, data: metadataJson },
  ];

  // Add approvals.json if exists
  const approvalsPath = path.join(getProjectDir(projectId), 'cuts', 'approvals.json');
  if (fs.existsSync(approvalsPath)) {
    entries.push({
      name: `${prefix}/approvals.json`,
      data: fs.readFileSync(approvalsPath, 'utf8'),
    });
  }

  // Add suggested-cuts.json
  const cutsPath = path.join(getProjectDir(projectId), 'cuts', 'suggested-cuts.json');
  if (fs.existsSync(cutsPath)) {
    entries.push({
      name: `${prefix}/suggested-cuts.json`,
      data: fs.readFileSync(cutsPath, 'utf8'),
    });
  }

  // Create ZIP
  const zipBuffer = createZip(entries);

  // Save ZIP to exports directory
  const exportDir = path.join(getProjectDir(projectId), 'exports');
  fs.mkdirSync(exportDir, { recursive: true });

  const zipFilename = `${prefix}.zip`;
  const zipPath = path.join(exportDir, zipFilename);
  fs.writeFileSync(zipPath, zipBuffer);

  return {
    filename: zipFilename,
    path: zipPath,
    size: zipBuffer.length,
    sizeFormatted: formatBytes(zipBuffer.length),
    entries: entries.map(e => e.name),
    editor,
    mode,
    clipCount: exportResult.clipCount,
    totalDuration: exportResult.totalDuration,
  };
}

/**
 * Get export history for a project.
 */
function getExportHistory(projectId) {
  const historyPath = path.join(getProjectDir(projectId), 'exports', 'export-history.json');
  if (!fs.existsSync(historyPath)) {
    return { exports: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  } catch {
    return { exports: [] };
  }
}

/**
 * Format duration in seconds to MM:SS.
 */
function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format bytes to human-readable size.
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  buildExportPackage,
  getExportHistory,
  createZip,
  crc32,
  formatDuration,
  formatBytes,
};
