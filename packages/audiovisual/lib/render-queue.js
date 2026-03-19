#!/usr/bin/env node
'use strict';

/**
 * render-queue.js — Render queue manager
 * Story: AV-5.2
 *
 * Manages a queue of videos to render, tracks progress,
 * and executes FFmpeg render jobs sequentially.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectDir } = require('./project');

const QUEUE_FILE = 'render-queue.json';

function getQueuePath(projectId) {
  return path.join(getProjectDir(projectId), 'output', QUEUE_FILE);
}

function loadQueue(projectId) {
  const queuePath = getQueuePath(projectId);
  if (!fs.existsSync(queuePath)) {
    return { jobs: [], createdAt: new Date().toISOString() };
  }
  return JSON.parse(fs.readFileSync(queuePath, 'utf8'));
}

function saveQueue(projectId, queue) {
  const outputDir = path.join(getProjectDir(projectId), 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(getQueuePath(projectId), JSON.stringify(queue, null, 2));
}

function addToQueue(projectId, cutId, inputPath, options = {}) {
  const queue = loadQueue(projectId);

  const job = {
    id: `render_${Date.now().toString(36)}`,
    cutId,
    inputPath,
    status: 'queued',
    priority: options.priority || 'normal',
    format: options.format || 'mp4',
    codec: options.codec || 'h264',
    quality: options.quality || 'high',
    queuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    outputPath: null,
    error: null,
  };

  queue.jobs.push(job);
  saveQueue(projectId, queue);
  return job;
}

function renderJob(projectId, job) {
  const projectDir = getProjectDir(projectId);
  const outputDir = path.join(projectDir, 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `final-${job.cutId}.mp4`);

  // Quality presets
  const qualityPresets = {
    high: { crf: '18', preset: 'slow' },
    medium: { crf: '23', preset: 'medium' },
    low: { crf: '28', preset: 'fast' },
  };

  const q = qualityPresets[job.quality] || qualityPresets.medium;

  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${job.inputPath}"`,
    '-c:v', 'libx264',
    '-crf', q.crf,
    '-preset', q.preset,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 600000 });
    return { success: true, outputPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function processQueue(projectId) {
  const queue = loadQueue(projectId);
  const results = [];

  const pendingJobs = queue.jobs.filter(j => j.status === 'queued');
  if (pendingJobs.length === 0) {
    return { processed: 0, results: [] };
  }

  for (const job of pendingJobs) {
    job.status = 'rendering';
    job.startedAt = new Date().toISOString();
    saveQueue(projectId, queue);

    console.log(`  Rendering ${job.cutId} (${job.quality})...`);
    const result = renderJob(projectId, job);

    if (result.success) {
      job.status = 'rendered';
      job.outputPath = result.outputPath;
      job.completedAt = new Date().toISOString();
      console.log(`  Done: ${path.basename(result.outputPath)}`);
    } else {
      job.status = 'error';
      job.error = result.error;
      job.completedAt = new Date().toISOString();
      console.log(`  Error: ${result.error}`);
    }

    results.push({ jobId: job.id, cutId: job.cutId, status: job.status });
    saveQueue(projectId, queue);
  }

  return { processed: results.length, results };
}

function getQueueStatus(projectId) {
  const queue = loadQueue(projectId);
  return {
    total: queue.jobs.length,
    queued: queue.jobs.filter(j => j.status === 'queued').length,
    rendering: queue.jobs.filter(j => j.status === 'rendering').length,
    rendered: queue.jobs.filter(j => j.status === 'rendered').length,
    error: queue.jobs.filter(j => j.status === 'error').length,
    jobs: queue.jobs,
  };
}

module.exports = {
  loadQueue,
  saveQueue,
  addToQueue,
  renderJob,
  processQueue,
  getQueueStatus,
};
