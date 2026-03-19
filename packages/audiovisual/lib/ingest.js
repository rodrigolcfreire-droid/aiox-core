#!/usr/bin/env node
'use strict';

/**
 * ingest.js — Video ingestion pipeline
 * Story: AV-2.1
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { SUPPORTED_FORMATS, PROJECT_STATUS } = require('./constants');
const { generateProjectId, createProjectStructure, getProjectDir, updateProjectStatus, updateProject } = require('./project');
const { extractMetadata } = require('./ffprobe');

function detectSourceType(source) {
  if (fs.existsSync(source)) return 'upload';
  if (source.includes('drive.google.com')) return 'drive';
  if (source.startsWith('http://') || source.startsWith('https://')) return 'url';
  throw new Error(`Invalid source: ${source}\nExpected: local file path, Google Drive URL, or direct video URL`);
}

function parseGoogleDriveUrl(url) {
  // Handle: https://drive.google.com/file/d/{FILE_ID}/view
  // Handle: https://drive.google.com/open?id={FILE_ID}
  let fileId = null;
  const pathMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) {
    fileId = pathMatch[1];
  } else {
    const paramMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (paramMatch) fileId = paramMatch[1];
  }

  if (!fileId) {
    throw new Error(`Could not extract file ID from Google Drive URL: ${url}`);
  }

  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    const request = protocol.get(url, { timeout: 120000 }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`Download failed: HTTP ${response.statusCode} from ${url}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(new Error(`Download error: ${err.message}`));
    });

    request.on('timeout', () => {
      request.destroy();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(new Error(`Download timeout after 120s: ${url}`));
    });
  });
}

function validateFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_FORMATS.includes(ext)) {
    throw new Error(
      `Unsupported format: ${ext}\n` +
      `Supported: ${SUPPORTED_FORMATS.join(', ')}`
    );
  }
  return ext;
}

async function ingest(source, options = {}) {
  const sourceType = detectSourceType(source);
  const projectId = generateProjectId();
  const projectName = options.name || path.basename(source, path.extname(source));

  console.log(`  Project ID: ${projectId}`);
  console.log(`  Source type: ${sourceType}`);
  console.log(`  Name: ${projectName}`);

  // Create project structure
  const project = createProjectStructure(projectId, projectName, sourceType, source);
  const projectDir = getProjectDir(projectId);
  const sourceDir = path.join(projectDir, 'source');

  // Update status: ingesting
  updateProjectStatus(projectId, PROJECT_STATUS.INGESTING);
  console.log(`  Status: ${PROJECT_STATUS.INGESTING}`);

  let videoPath;

  if (sourceType === 'upload') {
    // Copy local file
    validateFormat(source);
    const filename = path.basename(source);
    videoPath = path.join(sourceDir, filename);
    fs.copyFileSync(source, videoPath);
    console.log(`  Copied: ${filename}`);
  } else {
    // Download from URL
    let downloadUrl = source;
    if (sourceType === 'drive') {
      downloadUrl = parseGoogleDriveUrl(source);
      console.log('  Parsed Google Drive URL');
    }

    const ext = path.extname(new URL(downloadUrl).pathname) || '.mp4';
    videoPath = path.join(sourceDir, `video${ext}`);
    console.log('  Downloading...');
    await downloadFile(downloadUrl, videoPath);
    console.log('  Download complete');
    validateFormat(videoPath);
  }

  // Run FFprobe analysis
  updateProjectStatus(projectId, PROJECT_STATUS.ANALYZING);
  console.log(`  Status: ${PROJECT_STATUS.ANALYZING}`);
  console.log('  Running FFprobe...');

  const metadata = extractMetadata(videoPath);

  // Save metadata
  const analysisDir = path.join(projectDir, 'analysis');
  fs.writeFileSync(
    path.join(analysisDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  // Update project with metadata
  updateProject(projectId, {
    status: PROJECT_STATUS.ANALYZED,
    duration: metadata.durationSeconds,
    resolution: metadata.resolution,
    videoPath: path.relative(projectDir, videoPath),
    metadata: {
      duration: metadata.duration,
      resolution: metadata.resolution,
      fps: metadata.fps,
      codec: metadata.codec,
      bitrate: metadata.bitrate,
      audio: metadata.audio,
    },
  });

  console.log(`  Status: ${PROJECT_STATUS.ANALYZED}`);
  console.log('');
  console.log('  ── Metadata ──────────────────────────────────────');
  console.log(`  Duration:   ${metadata.duration}`);
  console.log(`  Resolution: ${metadata.resolution}`);
  console.log(`  FPS:        ${metadata.fps}`);
  console.log(`  Codec:      ${metadata.codec}`);
  console.log(`  Bitrate:    ${metadata.bitrate}`);
  console.log(`  File size:  ${(metadata.fileSizeBytes / 1024 / 1024).toFixed(1)} MB`);
  if (metadata.audio) {
    console.log(`  Audio:      ${metadata.audio.codec} ${metadata.audio.channels}ch ${metadata.audio.sampleRate}Hz`);
  }

  return {
    projectId,
    project: { ...project, status: PROJECT_STATUS.ANALYZED },
    metadata,
    videoPath,
  };
}

module.exports = {
  ingest,
  detectSourceType,
  parseGoogleDriveUrl,
  downloadFile,
  validateFormat,
};
