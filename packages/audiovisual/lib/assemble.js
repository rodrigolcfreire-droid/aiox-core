#!/usr/bin/env node
'use strict';

/**
 * assemble.js — Video assembly from approved cuts
 * Story: AV-4.1
 *
 * Extracts segments from source video and concatenates
 * them into assembled cuts using FFmpeg.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectDir, loadProject } = require('./project');
const { loadEnergyData, HOOK_DURATION } = require('./energy-detector');

const FORMAT_MAP = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

function extractSegment(videoPath, start, end, outputPath) {
  const duration = end - start;
  const cmd = [
    'ffmpeg', '-y',
    '-ss', String(start),
    '-i', `"${videoPath}"`,
    '-t', String(duration),
    '-c', 'copy',
    '-avoid_negative_ts', '1',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 120000 });
  } catch (err) {
    throw new Error(`Failed to extract segment [${start}-${end}]: ${err.message}`);
  }
}

function rescaleVideo(inputPath, outputPath, format) {
  const dims = FORMAT_MAP[format];
  if (!dims) {
    throw new Error(`Unknown format: ${format}. Supported: ${Object.keys(FORMAT_MAP).join(', ')}`);
  }

  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${inputPath}"`,
    '-vf', `"scale=${dims.width}:${dims.height}:force_original_aspect_ratio=decrease,pad=${dims.width}:${dims.height}:(ow-iw)/2:(oh-ih)/2"`,
    '-c:a', 'copy',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300000 });
  } catch (err) {
    throw new Error(`Failed to rescale video to ${format}: ${err.message}`);
  }
}

/**
 * Re-encode a video for safe concat (uniform codec, resolution, framerate).
 */
function reencodeForConcat(inputPath, outputPath) {
  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${inputPath}"`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-r', '30',
    '-movflags', '+faststart',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300000 });
  } catch (err) {
    throw new Error(`Failed to re-encode for concat: ${err.message}`);
  }
}

function concatenateSegments(segmentPaths, outputPath) {
  if (segmentPaths.length === 1) {
    fs.copyFileSync(segmentPaths[0], outputPath);
    return;
  }

  // Create concat file
  const concatFile = outputPath + '.concat.txt';
  const content = segmentPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(concatFile, content);

  const cmd = [
    'ffmpeg', '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', `"${concatFile}"`,
    '-c', 'copy',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300000 });
  } catch (err) {
    throw new Error(`Failed to concatenate segments: ${err.message}`);
  } finally {
    if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);
  }
}

/**
 * Prepend the energy hook (5s peak moment) before a cut.
 * Story AV-10: HOOK (5s) + CUT ORIGINAL.
 * Returns true if hook was prepended, false if no hook available.
 */
function prependEnergyHook(projectId, cutPath, outputPath, format) {
  const energyData = loadEnergyData(projectId);
  if (!energyData || !energyData.hookPath) {
    return false;
  }

  const hookPath = energyData.hookPath;
  if (!fs.existsSync(hookPath)) {
    return false;
  }

  // Rescale hook to match cut format
  const productionDir = path.dirname(outputPath);
  const hookScaledPath = path.join(productionDir, 'hook-scaled-tmp.mp4');
  rescaleVideo(hookPath, hookScaledPath, format);

  // Concatenate: hook + cut
  concatenateSegments([hookScaledPath, cutPath], outputPath);

  // Cleanup temp
  if (fs.existsSync(hookScaledPath)) fs.unlinkSync(hookScaledPath);

  return true;
}

function assemblecut(projectId, cutId) {
  const projectDir = getProjectDir(projectId);
  const cutsDir = path.join(projectDir, 'cuts');
  const productionDir = path.join(projectDir, 'production');
  const sourceDir = path.join(projectDir, 'source');

  // Load approved cuts
  const cutsPath = path.join(cutsDir, 'suggested-cuts.json');
  if (!fs.existsSync(cutsPath)) {
    throw new Error(`No cuts found for project ${projectId}`);
  }

  const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
  const cut = cutsData.suggestedCuts.find(c => c.id === cutId);
  if (!cut) {
    throw new Error(`Cut ${cutId} not found in project ${projectId}`);
  }

  // Find source video
  const sourceFiles = fs.readdirSync(sourceDir);
  const videoFile = sourceFiles.find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));
  if (!videoFile) {
    throw new Error(`No source video found in project ${projectId}`);
  }

  const videoPath = path.join(sourceDir, videoFile);
  fs.mkdirSync(productionDir, { recursive: true });

  // Extract the cut segment
  const rawPath = path.join(productionDir, `raw-${cutId}.mp4`);
  console.log(`  Extracting ${cutId} [${cut.start}s → ${cut.end}s]...`);
  extractSegment(videoPath, cut.start, cut.end, rawPath);

  // Rescale to target format
  const scaledPath = path.join(productionDir, `scaled-${cutId}.mp4`);
  console.log(`  Rescaling to ${cut.format}...`);
  rescaleVideo(rawPath, scaledPath, cut.format);

  // Cleanup raw
  if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);

  // Build segments list: HOOK + DEVELOPMENT + CTA
  const segments = [];
  let hookPrepended = false;
  let ctaAppended = false;
  let extraDuration = 0;

  // 1. HOOK: energy peak 5s
  const energyData = loadEnergyData(projectId);
  if (energyData && energyData.hookPath && fs.existsSync(energyData.hookPath)) {
    const hookScaledPath = path.join(productionDir, `hook-scaled-${cutId}.mp4`);
    rescaleVideo(energyData.hookPath, hookScaledPath, cut.format);
    const hookReencoded = path.join(productionDir, `hook-re-${cutId}.mp4`);
    reencodeForConcat(hookScaledPath, hookReencoded);
    segments.push(hookReencoded);
    hookPrepended = true;
    extraDuration += HOOK_DURATION;
    if (fs.existsSync(hookScaledPath)) fs.unlinkSync(hookScaledPath);
    console.log(`  Hook: ${HOOK_DURATION}s energy peak`);
  }

  // 2. DEVELOPMENT: the main cut
  const devReencoded = path.join(productionDir, `dev-re-${cutId}.mp4`);
  reencodeForConcat(scaledPath, devReencoded);
  segments.push(devReencoded);
  if (fs.existsSync(scaledPath)) fs.unlinkSync(scaledPath);

  // 3. CTA: find CTA block from segments.json and append
  const segmentsPath = path.join(projectDir, 'analysis', 'segments.json');
  if (fs.existsSync(segmentsPath)) {
    const segData = JSON.parse(fs.readFileSync(segmentsPath, 'utf8'));
    const ctaBlock = (segData.blocks || []).find(b => b.type === 'cta');
    if (ctaBlock && ctaBlock.start !== undefined && ctaBlock.end !== undefined) {
      // Only append CTA if it's not already part of the cut
      if (ctaBlock.start >= cut.end || ctaBlock.end <= cut.start) {
        const ctaRawPath = path.join(productionDir, `cta-raw-${cutId}.mp4`);
        const ctaScaledPath = path.join(productionDir, `cta-scaled-${cutId}.mp4`);
        const ctaReencoded = path.join(productionDir, `cta-re-${cutId}.mp4`);
        extractSegment(videoPath, ctaBlock.start, ctaBlock.end, ctaRawPath);
        rescaleVideo(ctaRawPath, ctaScaledPath, cut.format);
        reencodeForConcat(ctaScaledPath, ctaReencoded);
        segments.push(ctaReencoded);
        ctaAppended = true;
        extraDuration += (ctaBlock.end - ctaBlock.start);
        // Cleanup
        if (fs.existsSync(ctaRawPath)) fs.unlinkSync(ctaRawPath);
        if (fs.existsSync(ctaScaledPath)) fs.unlinkSync(ctaScaledPath);
        console.log(`  CTA: ${(ctaBlock.end - ctaBlock.start).toFixed(1)}s from ${ctaBlock.start}s`);
      }
    }
  }

  // Concatenate all segments
  const assembledPath = path.join(productionDir, `assembled-${cutId}.mp4`);
  if (segments.length === 1) {
    fs.renameSync(segments[0], assembledPath);
  } else {
    concatenateSegments(segments, assembledPath);
    // Cleanup temp re-encoded files
    for (const seg of segments) {
      if (fs.existsSync(seg)) fs.unlinkSync(seg);
    }
  }

  const finalDuration = cut.duration + extraDuration;
  const parts = [hookPrepended ? 'hook' : null, 'dev', ctaAppended ? 'cta' : null].filter(Boolean).join(' + ');
  console.log(`  Assembled: ${cutId}.mp4 [${parts}] ${finalDuration.toFixed(0)}s`);

  return {
    cutId,
    outputPath: assembledPath,
    format: cut.format,
    duration: finalDuration,
    hookPrepended,
    ctaAppended,
  };
}

function assembleAllApproved(projectId) {
  const projectDir = getProjectDir(projectId);
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');

  if (!fs.existsSync(cutsPath)) {
    throw new Error(`No cuts found for project ${projectId}`);
  }

  const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
  const approvedCuts = cutsData.suggestedCuts.filter(c => c.status === 'approved');

  if (approvedCuts.length === 0) {
    // If none approved, assemble all suggested (for testing)
    console.log('  No approved cuts found. Assembling all suggested cuts.');
    const allCuts = cutsData.suggestedCuts;
    const results = [];
    for (const cut of allCuts) {
      const result = assemblecut(projectId, cut.id);
      results.push(result);
    }
    return results;
  }

  const results = [];
  for (const cut of approvedCuts) {
    const result = assemblecut(projectId, cut.id);
    results.push(result);
  }
  return results;
}

/**
 * Generate lightweight preview clips for all suggested cuts.
 * Story AV-10: Each preview = HOOK (5s) + CUT segment.
 * Saved to cuts/previews/{cutId}.mp4 and referenced by previewFile in cuts data.
 */
function generateCutPreviews(projectId) {
  const projectDir = getProjectDir(projectId);
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  const previewsDir = path.join(projectDir, 'cuts', 'previews');
  const sourceDir = path.join(projectDir, 'source');

  if (!fs.existsSync(cutsPath)) {
    throw new Error(`No cuts found for project ${projectId}`);
  }

  // Find source video
  const sourceFiles = fs.readdirSync(sourceDir);
  const videoFile = sourceFiles.find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));
  if (!videoFile) {
    throw new Error(`No source video found in project ${projectId}`);
  }
  const videoPath = path.join(sourceDir, videoFile);

  const cutsData = JSON.parse(fs.readFileSync(cutsPath, 'utf8'));
  const energyData = loadEnergyData(projectId);
  const hasHook = energyData && energyData.hookPath && fs.existsSync(energyData.hookPath);

  fs.mkdirSync(previewsDir, { recursive: true });

  const results = [];
  for (const cut of cutsData.suggestedCuts) {
    const previewFilename = `${cut.id}.mp4`;
    const previewPath = path.join(previewsDir, previewFilename);

    try {
      // Extract cut segment from source
      const cutSegPath = path.join(previewsDir, `tmp-seg-${cut.id}.mp4`);
      extractSegment(videoPath, cut.start, cut.end, cutSegPath);

      if (hasHook) {
        // Re-encode hook and segment to ensure compatible streams for concat
        const hookReencoded = path.join(previewsDir, `tmp-hook-${cut.id}.mp4`);
        const segReencoded = path.join(previewsDir, `tmp-re-${cut.id}.mp4`);

        const reencode = (input, output) => {
          const cmd = [
            'ffmpeg', '-y',
            '-i', `"${input}"`,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            `"${output}"`,
          ].join(' ');
          execSync(cmd, { stdio: 'pipe', timeout: 120000 });
        };

        reencode(energyData.hookPath, hookReencoded);
        reencode(cutSegPath, segReencoded);

        // Concat hook + cut
        concatenateSegments([hookReencoded, segReencoded], previewPath);

        // Cleanup temps
        for (const tmp of [hookReencoded, segReencoded, cutSegPath]) {
          if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        }
      } else {
        // No hook — segment is the preview
        fs.renameSync(cutSegPath, previewPath);
      }

      // Update cut data with preview reference
      cut.previewFile = previewFilename;
      results.push({ cutId: cut.id, previewFile: previewFilename, hookPrepended: hasHook });
      console.log(`  Preview: ${previewFilename}${hasHook ? ' (hook + cut)' : ''}`);
    } catch (err) {
      console.error(`  Failed preview for ${cut.id}: ${err.message}`);
      results.push({ cutId: cut.id, error: err.message });
    }
  }

  // Save updated cuts data with previewFile references
  fs.writeFileSync(cutsPath, JSON.stringify(cutsData, null, 2));

  return { previews: results, total: results.length, hookIncluded: hasHook };
}

module.exports = {
  extractSegment,
  rescaleVideo,
  concatenateSegments,
  prependEnergyHook,
  assemblecut,
  assembleAllApproved,
  generateCutPreviews,
  FORMAT_MAP,
};
