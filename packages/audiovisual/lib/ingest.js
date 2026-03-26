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
  if (isYouTubeUrl(source)) return 'youtube';
  if (source.startsWith('http://') || source.startsWith('https://')) return 'url';
  throw new Error(`Invalid source: ${source}\nExpected: local file path, Google Drive URL, YouTube URL, or direct video URL`);
}

function isYouTubeUrl(url) {
  return /(?:youtube\.com\/(?:watch|shorts|live)|youtu\.be\/)/i.test(url);
}

/**
 * Download video from YouTube using yt-dlp.
 * Downloads best quality mp4 with audio merged.
 */
function downloadYouTube(url, destDir) {
  const { execSync } = require('child_process');
  const outputTemplate = path.join(destDir, '%(title).50s.%(ext)s');

  const cmd = [
    'yt-dlp',
    '--no-playlist',
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--no-overwrites',
    '-o', `"${outputTemplate}"`,
    `"${url}"`,
  ].join(' ');

  console.log('  Downloading from YouTube via yt-dlp...');
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 600000 });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().slice(0, 200) : err.message;
    throw new Error(`YouTube download failed: ${stderr}`);
  }

  // Find the downloaded file
  const files = fs.readdirSync(destDir).filter(f => /\.(mp4|webm|mkv)$/i.test(f));
  if (files.length === 0) {
    throw new Error('yt-dlp completed but no video file found');
  }
  return path.join(destDir, files[0]);
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

  // Store fileId for 2-step download
  return { url: `https://drive.google.com/uc?export=download&id=${fileId}`, fileId };
}

function downloadGoogleDrive(fileId, destPath) {
  // 2-step download: get cookies from warning page, then download with confirm
  return new Promise((resolve, reject) => {
    const { execSync } = require('child_process');
    try {
      // Step 1: Get cookies + confirm page
      execSync(`curl -sL -c /tmp/gdrive-cookies-${fileId}.txt -o /tmp/gdrive-page-${fileId}.html "https://drive.google.com/uc?export=download&id=${fileId}" -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"`, { timeout: 30000 });

      // Extract uuid from page
      const pageContent = fs.readFileSync(`/tmp/gdrive-page-${fileId}.html`, 'utf8');
      const uuidMatch = pageContent.match(/name="uuid"\s+value="([^"]+)"/);
      const uuid = uuidMatch ? uuidMatch[1] : '';

      // Step 2: Download with cookies + confirm + uuid
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t` + (uuid ? `&uuid=${uuid}` : '');
      console.log('  Downloading from Google Drive (2-step with cookies)...');
      execSync(`curl -sL -b /tmp/gdrive-cookies-${fileId}.txt -o "${destPath}" "${downloadUrl}" -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"`, { timeout: 600000 });

      // Verify it's not HTML
      const stat = fs.statSync(destPath);
      if (stat.size < 10000) {
        const content = fs.readFileSync(destPath, 'utf8').substring(0, 200);
        if (content.includes('<html') || content.includes('<!DOCTYPE')) {
          fs.unlinkSync(destPath);
          return reject(new Error('Google Drive download failed — file still HTML. Verify sharing permissions.'));
        }
      }

      // Cleanup
      try { fs.unlinkSync(`/tmp/gdrive-cookies-${fileId}.txt`); } catch (e) { /* ok */ }
      try { fs.unlinkSync(`/tmp/gdrive-page-${fileId}.html`); } catch (e) { /* ok */ }

      resolve(destPath);
    } catch (err) {
      reject(new Error(`Google Drive download failed: ${err.message}`));
    }
  });
}

function extractConfirmToken(html) {
  // Google Drive virus scan page has a confirm token
  const match = html.match(/confirm=([0-9A-Za-z_-]+)/);
  if (match) return match[1];
  // Alternative: look for download link with uuid
  const uuidMatch = html.match(/uuid=([0-9a-f-]+)/);
  if (uuidMatch) return uuidMatch[1];
  return null;
}

function downloadFile(url, destPath, attempt = 0, cookies = '') {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    };
    if (cookies) headers['Cookie'] = cookies;

    const options = {
      timeout: 300000,
      headers,
    };

    const request = protocol.get(url, options, (response) => {
      // Capture cookies for Google Drive 2-step download
      const setCookies = response.headers['set-cookie'] || [];
      const newCookies = setCookies.map(c => c.split(';')[0]).join('; ');
      const allCookies = [cookies, newCookies].filter(Boolean).join('; ');

      // Handle redirects (pass cookies along)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath, attempt, allCookies).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return reject(new Error(`Download failed: HTTP ${response.statusCode} from ${url}`));
      }

      // Check if response is HTML (virus scan warning page)
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('text/html') && attempt < 2) {
        let htmlData = '';
        response.on('data', chunk => { htmlData += chunk; });
        response.on('end', () => {
          file.close();
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

          // Try with confirm parameter
          const urlObj = new URL(url);
          const fileId = urlObj.searchParams.get('id');

          if (fileId) {
            // Extract uuid from virus scan page for 2-step download
            const uuidMatch = htmlData.match(/name="uuid"\s+value="([^"]+)"/);
            const uuid = uuidMatch ? uuidMatch[1] : '';
            const confirmUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t` + (uuid ? `&uuid=${uuid}` : '');
            console.log('  Google Drive virus scan detected, retrying with confirm + uuid...');
            return downloadFile(confirmUrl, destPath, attempt + 1, allCookies).then(resolve).catch(reject);
          }

          reject(new Error('Google Drive returned HTML instead of video. File may require manual download.'));
        });
        return;
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
      reject(new Error(`Download timeout after 300s: ${url}`));
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

/**
 * Find existing project by source URL to avoid re-downloading.
 */
function findExistingProject(source) {
  const { PROJECTS_DIR } = require('./constants');
  if (!fs.existsSync(PROJECTS_DIR)) return null;

  const projects = fs.readdirSync(PROJECTS_DIR);
  for (const pid of projects) {
    const projectFile = path.join(PROJECTS_DIR, pid, 'project.json');
    if (!fs.existsSync(projectFile)) continue;
    try {
      const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
      if (project.sourceUrl === source) {
        // Check if it has a video file
        const sourceDir = path.join(PROJECTS_DIR, pid, 'source');
        if (fs.existsSync(sourceDir)) {
          const files = fs.readdirSync(sourceDir);
          const video = files.find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));
          if (video) return { projectId: pid, project, videoPath: path.join(sourceDir, video) };
        }
      }
    } catch { /* skip corrupted projects */ }
  }
  return null;
}

async function ingest(source, options = {}) {
  // Check if this source was already ingested
  const existing = findExistingProject(source);
  if (existing && !options.force) {
    console.log(`  Projeto existente encontrado: ${existing.projectId}`);
    console.log(`  Video ja baixado: ${path.basename(existing.videoPath)}`);
    console.log('  Pulando download. Use --force para re-baixar.');

    // Load metadata
    const analysisDir = path.join(getProjectDir(existing.projectId), 'analysis');
    const metadataPath = path.join(analysisDir, 'metadata.json');
    const metadata = fs.existsSync(metadataPath)
      ? JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
      : {};

    return {
      projectId: existing.projectId,
      project: existing.project,
      metadata,
      videoPath: existing.videoPath,
      cached: true,
    };
  }

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
    // Copy local file (async stream to avoid blocking event loop on large files)
    validateFormat(source);
    const filename = path.basename(source);
    videoPath = path.join(sourceDir, filename);
    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(source);
      const ws = fs.createWriteStream(videoPath);
      rs.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
      rs.on('error', reject);
    });
    console.log(`  Copied: ${filename}`);
  } else if (sourceType === 'youtube') {
    // Download from YouTube via yt-dlp
    videoPath = downloadYouTube(source, sourceDir);
    console.log(`  Downloaded: ${path.basename(videoPath)}`);
  } else {
    // Download from URL
    if (sourceType === 'drive') {
      const { fileId } = parseGoogleDriveUrl(source);
      console.log(`  Google Drive file: ${fileId}`);
      videoPath = path.join(sourceDir, 'video.mp4');
      console.log('  Downloading from Google Drive...');
      await downloadGoogleDrive(fileId, videoPath);
      console.log('  Download complete');
    } else {
      const ext = path.extname(new URL(source).pathname) || '.mp4';
      videoPath = path.join(sourceDir, `video${ext}`);
      console.log('  Downloading...');
      await downloadFile(source, videoPath);
      console.log('  Download complete');
    }
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
  isYouTubeUrl,
  downloadYouTube,
  parseGoogleDriveUrl,
  downloadFile,
  validateFormat,
  findExistingProject,
};
