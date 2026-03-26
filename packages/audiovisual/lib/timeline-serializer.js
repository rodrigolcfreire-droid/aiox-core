#!/usr/bin/env node
'use strict';

/**
 * timeline-serializer.js — Abstract timeline builder
 * Story: AV-13
 *
 * Transforms cuts, approvals, and assembly data into an
 * abstract timeline structure that can be mapped to any
 * editor-specific XML format.
 *
 * Zero external dependencies — pure Node.js.
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir, loadProject } = require('./project');

const DEFAULT_FPS = 30;
const DEFAULT_RESOLUTION = { width: 1920, height: 1080 };

const FORMAT_RESOLUTIONS = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

/**
 * Build markers array from a cut's metadata.
 */
function buildMarkers(cut, approvalDecision, energyData) {
  const markers = [];
  let frame = 0;

  // Category marker at start
  markers.push({
    name: `Categoria: ${cut.category}`,
    comment: `Score: ${cut.engagementScore} | ${(cut.platform || []).join(', ')}`,
    frame: 0,
    color: 'cyan',
  });

  // Source strategy marker
  if (cut.source) {
    markers.push({
      name: `Source: ${cut.source}`,
      comment: cut.objective || '',
      frame: 0,
      color: 'green',
    });
  }

  // Approval status
  if (approvalDecision) {
    const color = approvalDecision.decision === 'approved' ? 'green' : 'red';
    markers.push({
      name: approvalDecision.decision === 'approved' ? 'APPROVED' : 'REJECTED',
      comment: approvalDecision.feedback || '',
      frame: 0,
      color,
    });
  }

  // Energy peaks within cut range
  if (energyData && energyData.topPeaks) {
    for (const peak of energyData.topPeaks) {
      if (peak.start >= cut.start && peak.start <= cut.end) {
        const relativeFrame = Math.round((peak.start - cut.start) * DEFAULT_FPS);
        markers.push({
          name: `Peak Energy #${peak.rank}`,
          comment: `Volume: ${peak.meanVolume}dB`,
          frame: relativeFrame,
          color: 'orange',
        });
      }
    }
  }

  // Transcript excerpt
  if (cut.transcriptExcerpt) {
    markers.push({
      name: 'Transcript',
      comment: cut.transcriptExcerpt.slice(0, 200),
      frame: 0,
      color: 'white',
    });
  }

  return markers;
}

/**
 * Load all project data needed for timeline serialization.
 */
function loadProjectData(projectId) {
  const projectDir = getProjectDir(projectId);
  const project = loadProject(projectId);

  // Cuts
  const cutsPath = path.join(projectDir, 'cuts', 'suggested-cuts.json');
  const cutsData = fs.existsSync(cutsPath)
    ? JSON.parse(fs.readFileSync(cutsPath, 'utf8'))
    : { suggestedCuts: [] };

  // Approvals
  const approvalsPath = path.join(projectDir, 'cuts', 'approvals.json');
  const approvals = fs.existsSync(approvalsPath)
    ? JSON.parse(fs.readFileSync(approvalsPath, 'utf8'))
    : { decisions: [] };

  // Energy
  const energyPath = path.join(projectDir, 'analysis', 'energy.json');
  const energy = fs.existsSync(energyPath)
    ? JSON.parse(fs.readFileSync(energyPath, 'utf8'))
    : null;

  // Segments
  const segmentsPath = path.join(projectDir, 'analysis', 'segments.json');
  const segments = fs.existsSync(segmentsPath)
    ? JSON.parse(fs.readFileSync(segmentsPath, 'utf8'))
    : null;

  // Source video info
  const sourceDir = path.join(projectDir, 'source');
  let sourceVideoPath = '';
  let sourceVideoDuration = 0;
  if (fs.existsSync(sourceDir)) {
    const files = fs.readdirSync(sourceDir);
    const videoFile = files.find(f => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f));
    if (videoFile) {
      sourceVideoPath = path.join(sourceDir, videoFile);
    }
  }

  // Get duration from transcription or metadata
  const transcriptionPath = path.join(projectDir, 'analysis', 'transcription.json');
  if (fs.existsSync(transcriptionPath)) {
    const transcription = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'));
    sourceVideoDuration = transcription.totalDuration || 0;
  }

  return {
    project,
    cutsData,
    approvals,
    energy,
    segments,
    sourceVideoPath,
    sourceVideoDuration,
    projectDir,
  };
}

/**
 * Build a clip object from a cut.
 */
function buildClip(cut, index, approvalDecision, energyData) {
  const resolution = FORMAT_RESOLUTIONS[cut.format] || DEFAULT_RESOLUTION;

  return {
    id: cut.id,
    index,
    name: `${cut.id} — ${cut.category}`,
    start: cut.start,
    end: cut.end,
    duration: cut.duration,
    inPoint: cut.start,
    outPoint: cut.end,
    startFrame: Math.round(cut.start * DEFAULT_FPS),
    endFrame: Math.round(cut.end * DEFAULT_FPS),
    durationFrames: Math.round(cut.duration * DEFAULT_FPS),
    category: cut.category,
    engagementScore: cut.engagementScore,
    platform: cut.platform || [],
    format: cut.format,
    source: cut.source || 'unknown',
    transcriptExcerpt: cut.transcriptExcerpt || '',
    status: cut.status || 'suggested',
    markers: buildMarkers(cut, approvalDecision, energyData),
    resolution,
  };
}

/**
 * Serialize a single cut into a timeline.
 */
function serializeSingle(projectId, cutId) {
  const data = loadProjectData(projectId);
  const cut = data.cutsData.suggestedCuts.find(c => c.id === cutId);

  if (!cut) {
    throw new Error(`Cut ${cutId} not found in project ${projectId}`);
  }

  const decision = (data.approvals.decisions || []).find(d => d.cutId === cutId);
  const resolution = FORMAT_RESOLUTIONS[cut.format] || DEFAULT_RESOLUTION;

  const clip = buildClip(cut, 0, decision, data.energy);

  return {
    projectId,
    projectName: data.project.name || projectId,
    sequenceName: `${data.project.name || projectId} — ${cutId}`,
    exportMode: 'single',
    createdAt: new Date().toISOString(),
    sourceVideoPath: data.sourceVideoPath,
    sourceVideoDuration: data.sourceVideoDuration,
    timelineFPS: DEFAULT_FPS,
    resolution,
    totalDuration: cut.duration,
    totalDurationFrames: Math.round(cut.duration * DEFAULT_FPS),
    videoTrack: {
      name: 'V1',
      clips: [clip],
    },
    audioTrack: {
      name: 'A1',
      clips: [{ ...clip, name: `Audio — ${clip.name}` }],
    },
    markers: clip.markers,
    transitions: [],
    metadata: {
      cutCount: 1,
      categories: [cut.category],
      platforms: cut.platform || [],
      avgEngagement: cut.engagementScore,
    },
  };
}

/**
 * Serialize all approved cuts into a single timeline.
 */
function serializeApproved(projectId) {
  const data = loadProjectData(projectId);

  const approvedIds = new Set(
    (data.approvals.decisions || [])
      .filter(d => d.decision === 'approved')
      .map(d => d.cutId)
  );

  const approvedCuts = data.cutsData.suggestedCuts.filter(c =>
    approvedIds.has(c.id) || c.status === 'approved'
  );

  if (approvedCuts.length === 0) {
    throw new Error(`No approved cuts found for project ${projectId}`);
  }

  // Sort by start time for chronological order
  approvedCuts.sort((a, b) => a.start - b.start);

  const clips = [];
  const allMarkers = [];
  let timelineOffset = 0;

  for (let i = 0; i < approvedCuts.length; i++) {
    const cut = approvedCuts[i];
    const decision = (data.approvals.decisions || []).find(d => d.cutId === cut.id);
    const clip = buildClip(cut, i, decision, data.energy);

    // Offset clip to timeline position (sequential)
    clip.timelineStart = timelineOffset;
    clip.timelineEnd = timelineOffset + clip.duration;
    clip.timelineStartFrame = Math.round(timelineOffset * DEFAULT_FPS);
    clip.timelineEndFrame = Math.round((timelineOffset + clip.duration) * DEFAULT_FPS);

    // Offset markers to timeline position
    for (const marker of clip.markers) {
      allMarkers.push({
        ...marker,
        frame: marker.frame + clip.timelineStartFrame,
      });
    }

    clips.push(clip);
    timelineOffset += clip.duration;
  }

  const totalDuration = timelineOffset;
  const categories = [...new Set(approvedCuts.map(c => c.category))];
  const platforms = [...new Set(approvedCuts.flatMap(c => c.platform || []))];
  const avgEngagement = approvedCuts.reduce((sum, c) => sum + (c.engagementScore || 0), 0) / approvedCuts.length;

  // Determine resolution from first cut or default
  const resolution = FORMAT_RESOLUTIONS[approvedCuts[0].format] || DEFAULT_RESOLUTION;

  return {
    projectId,
    projectName: data.project.name || projectId,
    sequenceName: `${data.project.name || projectId} — Approved Cuts`,
    exportMode: 'approved',
    createdAt: new Date().toISOString(),
    sourceVideoPath: data.sourceVideoPath,
    sourceVideoDuration: data.sourceVideoDuration,
    timelineFPS: DEFAULT_FPS,
    resolution,
    totalDuration,
    totalDurationFrames: Math.round(totalDuration * DEFAULT_FPS),
    videoTrack: {
      name: 'V1',
      clips,
    },
    audioTrack: {
      name: 'A1',
      clips: clips.map(c => ({ ...c, name: `Audio — ${c.name}` })),
    },
    markers: allMarkers,
    transitions: [],
    metadata: {
      cutCount: approvedCuts.length,
      categories,
      platforms,
      avgEngagement: Math.round(avgEngagement * 10) / 10,
    },
  };
}

/**
 * Serialize the final assembled timeline (hook + dev + cta).
 */
function serializeFinal(projectId) {
  const data = loadProjectData(projectId);
  const productionDir = path.join(data.projectDir, 'production');

  // Find assembled files
  const assembledFiles = fs.existsSync(productionDir)
    ? fs.readdirSync(productionDir).filter(f => f.startsWith('assembled-') && f.endsWith('.mp4'))
    : [];

  if (assembledFiles.length === 0) {
    throw new Error(`No assembled files found for project ${projectId}. Run assembly first.`);
  }

  // Build clips from assembled files + original cut metadata
  const clips = [];
  const allMarkers = [];
  let timelineOffset = 0;

  for (let i = 0; i < assembledFiles.length; i++) {
    const filename = assembledFiles[i];
    const cutId = filename.replace('assembled-', '').replace('.mp4', '');
    const originalCut = data.cutsData.suggestedCuts.find(c => c.id === cutId);
    const decision = (data.approvals.decisions || []).find(d => d.cutId === cutId);

    // Build structure markers for hook/dev/cta
    const structureMarkers = [];
    let hookDuration = 0;
    let ctaDuration = 0;

    // Check if hook was used
    if (data.energy && data.energy.hookPath) {
      hookDuration = 5; // HOOK_DURATION constant
      structureMarkers.push({
        name: 'HOOK',
        comment: `Energy peak — ${hookDuration}s`,
        frame: Math.round(timelineOffset * DEFAULT_FPS),
        color: 'red',
      });
    }

    // Main development body
    const devStart = hookDuration;
    const devDuration = originalCut ? originalCut.duration : 30;
    structureMarkers.push({
      name: 'DEVELOPMENT',
      comment: `Main content — ${devDuration.toFixed(1)}s`,
      frame: Math.round((timelineOffset + devStart) * DEFAULT_FPS),
      color: 'blue',
    });

    // CTA block
    if (data.segments) {
      const ctaBlock = (data.segments.blocks || []).find(b => b.type === 'cta');
      if (ctaBlock) {
        ctaDuration = ctaBlock.end - ctaBlock.start;
        structureMarkers.push({
          name: 'CTA',
          comment: `Call-to-action — ${ctaDuration.toFixed(1)}s`,
          frame: Math.round((timelineOffset + devStart + devDuration) * DEFAULT_FPS),
          color: 'yellow',
        });
      }
    }

    const totalClipDuration = hookDuration + devDuration + ctaDuration;
    const resolution = originalCut
      ? (FORMAT_RESOLUTIONS[originalCut.format] || DEFAULT_RESOLUTION)
      : DEFAULT_RESOLUTION;

    const clip = {
      id: cutId,
      index: i,
      name: `Final — ${cutId}`,
      start: 0,
      end: totalClipDuration,
      duration: totalClipDuration,
      inPoint: 0,
      outPoint: totalClipDuration,
      startFrame: 0,
      endFrame: Math.round(totalClipDuration * DEFAULT_FPS),
      durationFrames: Math.round(totalClipDuration * DEFAULT_FPS),
      timelineStart: timelineOffset,
      timelineEnd: timelineOffset + totalClipDuration,
      timelineStartFrame: Math.round(timelineOffset * DEFAULT_FPS),
      timelineEndFrame: Math.round((timelineOffset + totalClipDuration) * DEFAULT_FPS),
      category: originalCut ? originalCut.category : 'unknown',
      engagementScore: originalCut ? originalCut.engagementScore : 0,
      platform: originalCut ? (originalCut.platform || []) : [],
      format: originalCut ? originalCut.format : '16:9',
      source: 'assembled',
      transcriptExcerpt: originalCut ? (originalCut.transcriptExcerpt || '') : '',
      status: 'assembled',
      assembledFile: filename,
      structure: {
        hookDuration,
        devDuration,
        ctaDuration,
      },
      markers: structureMarkers,
      resolution,
    };

    // Add structure markers with timeline offset
    for (const m of structureMarkers) {
      allMarkers.push(m);
    }

    // Add original cut markers
    if (originalCut) {
      const cutMarkers = buildMarkers(originalCut, decision, data.energy);
      for (const m of cutMarkers) {
        allMarkers.push({
          ...m,
          frame: m.frame + clip.timelineStartFrame,
        });
      }
    }

    clips.push(clip);
    timelineOffset += totalClipDuration;
  }

  const totalDuration = timelineOffset;
  const resolution = clips.length > 0 ? clips[0].resolution : DEFAULT_RESOLUTION;

  return {
    projectId,
    projectName: data.project.name || projectId,
    sequenceName: `${data.project.name || projectId} — Final Assembly`,
    exportMode: 'final',
    createdAt: new Date().toISOString(),
    sourceVideoPath: data.sourceVideoPath,
    sourceVideoDuration: data.sourceVideoDuration,
    timelineFPS: DEFAULT_FPS,
    resolution,
    totalDuration,
    totalDurationFrames: Math.round(totalDuration * DEFAULT_FPS),
    videoTrack: {
      name: 'V1',
      clips,
    },
    audioTrack: {
      name: 'A1',
      clips: clips.map(c => ({ ...c, name: `Audio — ${c.name}` })),
    },
    markers: allMarkers,
    transitions: [
      { type: 'fade-in', duration: 0.5, durationFrames: 15 },
      { type: 'fade-out', duration: 0.8, durationFrames: 24 },
    ],
    metadata: {
      cutCount: clips.length,
      categories: [...new Set(clips.map(c => c.category))],
      platforms: [...new Set(clips.flatMap(c => c.platform || []))],
      avgEngagement: clips.length > 0
        ? Math.round(clips.reduce((s, c) => s + (c.engagementScore || 0), 0) / clips.length * 10) / 10
        : 0,
      hasHook: clips.some(c => c.structure && c.structure.hookDuration > 0),
      hasCta: clips.some(c => c.structure && c.structure.ctaDuration > 0),
    },
  };
}

/**
 * Main entry: serialize timeline for given mode.
 */
function serializeTimeline(projectId, mode, cutId) {
  switch (mode) {
    case 'single':
      if (!cutId) throw new Error('cutId required for single mode');
      return serializeSingle(projectId, cutId);
    case 'approved':
      return serializeApproved(projectId);
    case 'final':
      return serializeFinal(projectId);
    default:
      throw new Error(`Unknown export mode: ${mode}. Use: single, approved, final`);
  }
}

module.exports = {
  serializeTimeline,
  serializeSingle,
  serializeApproved,
  serializeFinal,
  buildClip,
  buildMarkers,
  loadProjectData,
  DEFAULT_FPS,
  DEFAULT_RESOLUTION,
  FORMAT_RESOLUTIONS,
};
