#!/usr/bin/env node
'use strict';

/**
 * transcribe.js — Transcription engine for Central Audiovisual
 * Story: AV-2.2
 *
 * Supports:
 *   - OpenAI Whisper API (requires OPENAI_API_KEY)
 *   - Manual import from SRT/VTT files
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { loadProject, updateProjectStatus, getProjectDir } = require('./project');
const { parseSRT, parseVTT, generateSRT } = require('./srt-parser');
const { PROJECT_STATUS } = require('./constants');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '..', '..', '.env');
  const env = {};
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
      }
    });
  } catch {
    // .env not found, use process.env
  }
  return { ...env, ...process.env };
}

function extractAudio(videoPath, outputPath) {
  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${videoPath}"`,
    '-vn',
    '-acodec', 'pcm_s16le',
    '-ar', '16000',
    '-ac', '1',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300000 });
  } catch (err) {
    throw new Error(`Failed to extract audio: ${err.message}`);
  }

  return outputPath;
}

function whisperAPI(audioPath, apiKey) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(audioPath);
    const boundary = '----FormBoundary' + Date.now().toString(36);

    const parts = [];

    // File part
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${path.basename(audioPath)}"\r\n` +
      'Content-Type: audio/wav\r\n\r\n'
    );
    parts.push(fileData);
    parts.push('\r\n');

    // Model part
    parts.push(
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="model"\r\n\r\n' +
      'whisper-1\r\n'
    );

    // Response format
    parts.push(
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="response_format"\r\n\r\n' +
      'verbose_json\r\n'
    );

    // Timestamp granularities
    parts.push(
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="timestamp_granularities[]"\r\n\r\n' +
      'segment\r\n'
    );

    parts.push(`--${boundary}--\r\n`);

    const bodyParts = [];
    for (const part of parts) {
      bodyParts.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
    }
    const body = Buffer.concat(bodyParts);

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 600000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Whisper API error ${res.statusCode}: ${data}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Failed to parse Whisper response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', err => reject(new Error(`Whisper API request failed: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Whisper API timeout')); });
    req.write(body);
    req.end();
  });
}

async function transcribeWithWhisper(projectId) {
  const project = loadProject(projectId);
  const projectDir = getProjectDir(projectId);
  const analysisDir = path.join(projectDir, 'analysis');

  // Find source video
  const sourceDir = path.join(projectDir, 'source');
  const files = fs.readdirSync(sourceDir);
  const videoFile = files.find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));
  if (!videoFile) {
    throw new Error(`No video found in project ${projectId}`);
  }

  const videoPath = path.join(sourceDir, videoFile);
  const audioPath = path.join(analysisDir, 'audio.wav');

  // Extract audio
  console.log('  Extracting audio...');
  extractAudio(videoPath, audioPath);
  console.log('  Audio extracted');

  // Check file size (Whisper API limit: 25MB)
  const audioStats = fs.statSync(audioPath);
  const audioSizeMB = audioStats.size / 1024 / 1024;
  console.log(`  Audio size: ${audioSizeMB.toFixed(1)} MB`);

  if (audioSizeMB > 25) {
    throw new Error(
      `Audio file too large (${audioSizeMB.toFixed(1)} MB). ` +
      'Whisper API limit is 25MB. Split the video first or use manual import.'
    );
  }

  // Get API key
  const env = loadEnv();
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY not found.\n' +
      'Add to .env: OPENAI_API_KEY=sk-...\n' +
      'Or use manual import: node bin/av-transcribe.js import <project-id> <srt-file>'
    );
  }

  // Call Whisper API
  console.log('  Calling Whisper API...');
  const result = await whisperAPI(audioPath, apiKey);

  // Transform to our format
  const segments = (result.segments || []).map(seg => ({
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
    confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : 0.9,
  }));

  const transcription = {
    segments,
    language: result.language || 'pt',
    totalWords: segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0),
    totalDuration: segments.length > 0 ? segments[segments.length - 1].end : 0,
    source: 'whisper-api',
    createdAt: new Date().toISOString(),
  };

  // Save outputs
  fs.writeFileSync(
    path.join(analysisDir, 'transcription.json'),
    JSON.stringify(transcription, null, 2)
  );

  fs.writeFileSync(
    path.join(analysisDir, 'transcription.srt'),
    generateSRT(segments)
  );

  console.log(`  Language: ${transcription.language}`);
  console.log(`  Segments: ${segments.length}`);
  console.log(`  Words: ${transcription.totalWords}`);

  return transcription;
}

function importSRT(projectId, srtPath) {
  const projectDir = getProjectDir(projectId);
  const analysisDir = path.join(projectDir, 'analysis');

  if (!fs.existsSync(srtPath)) {
    throw new Error(`File not found: ${srtPath}`);
  }

  const content = fs.readFileSync(srtPath, 'utf8');
  const ext = path.extname(srtPath).toLowerCase();

  let segments;
  if (ext === '.vtt') {
    segments = parseVTT(content);
  } else {
    segments = parseSRT(content);
  }

  if (segments.length === 0) {
    throw new Error('No segments found in subtitle file');
  }

  const transcription = {
    segments,
    language: 'pt',
    totalWords: segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0),
    totalDuration: segments[segments.length - 1].end,
    source: `import:${path.basename(srtPath)}`,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(analysisDir, 'transcription.json'),
    JSON.stringify(transcription, null, 2)
  );

  fs.writeFileSync(
    path.join(analysisDir, 'transcription.srt'),
    generateSRT(segments)
  );

  console.log(`  Imported: ${segments.length} segments`);
  console.log(`  Words: ${transcription.totalWords}`);
  console.log(`  Duration: ${transcription.totalDuration.toFixed(1)}s`);

  return transcription;
}

module.exports = {
  extractAudio,
  transcribeWithWhisper,
  importSRT,
  whisperAPI,
  loadEnv,
};
