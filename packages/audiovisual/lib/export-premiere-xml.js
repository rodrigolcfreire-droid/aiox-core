#!/usr/bin/env node
'use strict';

/**
 * export-premiere-xml.js — Adobe Premiere Pro FCP XML exporter
 * Story: AV-13
 *
 * Generates Final Cut Pro XML 1.0 format compatible with
 * Adobe Premiere Pro import. Zero external dependencies.
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir } = require('./project');
const { serializeTimeline } = require('./timeline-serializer');
const {
  tag,
  xmlDeclaration,
  fcpDoctype,
  secondsToFrames,
  buildRate,
  buildTimecode,
  buildFormat,
  buildMarker,
  buildFileRef,
} = require('./xml-mapper');

/**
 * Build a clip-item element for video track.
 */
function buildClipItem(clip, fileId, fps, indent = 0) {
  const inFrames = secondsToFrames(clip.inPoint, fps);
  const outFrames = secondsToFrames(clip.outPoint, fps);
  const startFrames = clip.timelineStartFrame || 0;
  const endFrames = clip.timelineEndFrame || clip.durationFrames;

  const children = [
    tag('name', {}, clip.name, indent + 1),
    tag('enabled', {}, 'TRUE', indent + 1),
    tag('duration', {}, String(clip.durationFrames), indent + 1),
    ...buildRate(fps, indent + 1),
    tag('start', {}, String(startFrames), indent + 1),
    tag('end', {}, String(endFrames), indent + 1),
    tag('in', {}, String(inFrames), indent + 1),
    tag('out', {}, String(outFrames), indent + 1),
    tag('file', { id: fileId }, null, indent + 1),
  ];

  // Add markers for this clip
  if (clip.markers && clip.markers.length > 0) {
    for (const marker of clip.markers) {
      children.push(buildMarker(marker, fps, indent + 1));
    }
  }

  // Add labels for metadata
  children.push(
    tag('labels', {}, [
      tag('label2', {}, clip.category || '', indent + 2),
    ], indent + 1),
  );

  // Comments with engagement and platform info
  const comment = [
    `Score: ${clip.engagementScore}`,
    `Platform: ${(clip.platform || []).join(', ')}`,
    `Format: ${clip.format}`,
    `Source: ${clip.source}`,
  ].join(' | ');
  children.push(tag('comments', {}, [
    tag('mastercomment1', {}, comment, indent + 2),
    tag('mastercomment2', {}, clip.transcriptExcerpt || '', indent + 2),
  ], indent + 1));

  return tag('clipitem', { id: `clipitem-${clip.id}` }, children, indent);
}

/**
 * Build audio clip-item element.
 */
function buildAudioClipItem(clip, fileId, fps, indent = 0) {
  const inFrames = secondsToFrames(clip.inPoint, fps);
  const outFrames = secondsToFrames(clip.outPoint, fps);
  const startFrames = clip.timelineStartFrame || 0;
  const endFrames = clip.timelineEndFrame || clip.durationFrames;

  return tag('clipitem', { id: `clipitem-audio-${clip.id}` }, [
    tag('name', {}, clip.name, indent + 1),
    tag('enabled', {}, 'TRUE', indent + 1),
    tag('duration', {}, String(clip.durationFrames), indent + 1),
    ...buildRate(fps, indent + 1),
    tag('start', {}, String(startFrames), indent + 1),
    tag('end', {}, String(endFrames), indent + 1),
    tag('in', {}, String(inFrames), indent + 1),
    tag('out', {}, String(outFrames), indent + 1),
    tag('file', { id: fileId }, null, indent + 1),
    tag('sourcetrack', {}, [
      tag('mediatype', {}, 'audio', indent + 2),
      tag('trackindex', {}, '1', indent + 2),
    ], indent + 1),
  ], indent);
}

/**
 * Build transition effect element for fades.
 */
function buildTransition(transition, fps, position, indent = 0) {
  const durationFrames = secondsToFrames(transition.duration, fps);
  const alignment = transition.type === 'fade-in' ? 'start' : 'end';

  return tag('transitionitem', {}, [
    tag('name', {}, transition.type === 'fade-in' ? 'Cross Dissolve' : 'Cross Dissolve', indent + 1),
    tag('alignment', {}, alignment, indent + 1),
    tag('duration', {}, String(durationFrames), indent + 1),
    ...buildRate(fps, indent + 1),
    tag('start', {}, String(position), indent + 1),
    tag('end', {}, String(position + durationFrames), indent + 1),
    tag('effect', {}, [
      tag('name', {}, 'Cross Dissolve', indent + 2),
      tag('effectid', {}, 'CrossDissolve', indent + 2),
      tag('effectcategory', {}, 'Dissolve', indent + 2),
      tag('effecttype', {}, 'transition', indent + 2),
      tag('mediatype', {}, 'video', indent + 2),
    ], indent + 1),
  ], indent);
}

/**
 * Generate complete Premiere Pro XML from timeline.
 */
function generatePremiereXml(timeline) {
  const fps = timeline.timelineFPS;
  const res = timeline.resolution;
  const totalFrames = timeline.totalDurationFrames;
  const fileId = 'file-source-1';

  // Build video track clip items
  const videoClipItems = timeline.videoTrack.clips.map(
    (clip, i) => buildClipItem(clip, fileId, fps, 5),
  );

  // Build audio track clip items
  const audioClipItems = timeline.audioTrack.clips.map(
    (clip, i) => buildAudioClipItem(clip, fileId, fps, 5),
  );

  // Build sequence markers
  const sequenceMarkers = (timeline.markers || []).map(
    m => buildMarker(m, fps, 4),
  );

  // Build transitions
  const transitionItems = (timeline.transitions || []).map((t, i) => {
    const position = t.type === 'fade-in' ? 0 : totalFrames - secondsToFrames(t.duration, fps);
    return buildTransition(t, fps, position, 5);
  });

  // File reference
  const fileRef = buildFileRef(
    fileId,
    timeline.sourceVideoPath,
    timeline.sourceVideoDuration,
    fps,
    res,
    5,
  );

  const xml = [
    xmlDeclaration(),
    fcpDoctype(),
    tag('xmeml', { version: '5' }, [
      tag('project', {}, [
        tag('name', {}, timeline.projectName, 2),
        tag('children', {}, [
          tag('sequence', { id: 'sequence-1' }, [
            tag('name', {}, timeline.sequenceName, 4),
            tag('duration', {}, String(totalFrames), 4),
            ...buildRate(fps, 4),
            ...buildTimecode(fps, 4),
            // Sequence markers
            ...sequenceMarkers,
            tag('media', {}, [
              // Video
              tag('video', {}, [
                buildFormat(res, fps, 6),
                tag('track', {}, [
                  ...videoClipItems,
                  ...transitionItems,
                  tag('enabled', {}, 'TRUE', 6),
                  tag('locked', {}, 'FALSE', 6),
                ], 5),
              ], 5),
              // Audio
              tag('audio', {}, [
                tag('numOutputChannels', {}, '2', 6),
                tag('track', {}, [
                  ...audioClipItems,
                  tag('enabled', {}, 'TRUE', 6),
                  tag('locked', {}, 'FALSE', 6),
                ], 5),
              ], 5),
            ], 4),
            // File references in bin
          ], 3),
          // Source file reference
          tag('bin', {}, [
            tag('name', {}, 'Source Media', 4),
            tag('children', {}, [
              fileRef,
            ], 4),
          ], 3),
        ], 2),
      ], 1),
    ], 0),
  ].join('');

  return xml;
}

/**
 * Export Premiere XML for a project.
 */
function exportPremiereXml(projectId, mode, cutId) {
  const timeline = serializeTimeline(projectId, mode, cutId);
  const xml = generatePremiereXml(timeline);

  // Save to exports directory
  const exportDir = path.join(getProjectDir(projectId), 'exports');
  fs.mkdirSync(exportDir, { recursive: true });

  const projectName = (timeline.projectName || projectId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const suffix = mode === 'single' && cutId ? cutId : mode;
  const filename = `${projectName}-premiere-${suffix}.xml`;
  const outputPath = path.join(exportDir, filename);

  fs.writeFileSync(outputPath, xml, 'utf8');

  // Save export history entry
  saveExportHistory(projectId, {
    editor: 'premiere',
    mode,
    cutId: cutId || null,
    filename,
    path: outputPath,
    createdAt: new Date().toISOString(),
    clipCount: timeline.videoTrack.clips.length,
    totalDuration: timeline.totalDuration,
  });

  return {
    filename,
    path: outputPath,
    xml,
    timeline,
    editor: 'premiere',
    mode,
    clipCount: timeline.videoTrack.clips.length,
    totalDuration: timeline.totalDuration,
  };
}

/**
 * Save export to history file.
 */
function saveExportHistory(projectId, entry) {
  const historyPath = path.join(getProjectDir(projectId), 'exports', 'export-history.json');
  let history = { exports: [] };

  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch {
      history = { exports: [] };
    }
  }

  history.exports.push(entry);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

module.exports = {
  exportPremiereXml,
  generatePremiereXml,
  saveExportHistory,
};
