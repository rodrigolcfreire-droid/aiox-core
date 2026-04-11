#!/usr/bin/env node
'use strict';

/**
 * export-davinci-xml.js — DaVinci Resolve FCP XML exporter
 * Story: AV-13
 *
 * Generates FCP XML compatible with DaVinci Resolve import.
 * DaVinci uses a slightly different FCP XML dialect than Premiere.
 * Zero external dependencies.
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir } = require('./project');
const { serializeTimeline } = require('./timeline-serializer');
const { saveExportHistory } = require('./export-premiere-xml');
const {
  tag,
  xmlDeclaration,
  fcpDoctype,
  secondsToFrames,
  buildRate,
  buildTimecode,
  buildFormat,
  buildMarker,
} = require('./xml-mapper');

/**
 * Build DaVinci-compatible file reference.
 * DaVinci prefers pathurl with file:// protocol and platform paths.
 */
function buildDaVinciFileRef(fileId, filePath, duration, fps, resolution, indent = 0) {
  const pathUrl = filePath ? `file://localhost${filePath}` : '';
  const fileName = filePath ? filePath.split('/').pop() : 'source.mp4';

  return tag('file', { id: fileId }, [
    tag('name', {}, fileName, indent + 1),
    tag('pathurl', {}, pathUrl, indent + 1),
    tag('duration', {}, String(secondsToFrames(duration, fps)), indent + 1),
    ...buildRate(fps, indent + 1),
    ...buildTimecode(fps, indent + 1),
    tag('media', {}, [
      tag('video', {}, [
        buildFormat(resolution, fps, indent + 3),
        tag('track', {}, [], indent + 3),
      ], indent + 2),
      tag('audio', {}, [
        tag('samplecharacteristics', {}, [
          tag('samplerate', {}, '48000', indent + 4),
          tag('depth', {}, '16', indent + 4),
        ], indent + 3),
        tag('channelcount', {}, '2', indent + 3),
      ], indent + 2),
    ], indent + 1),
  ], indent);
}

/**
 * Build DaVinci video clip-item.
 * DaVinci expects masterclipid and explicit link references.
 */
function buildDaVinciClipItem(clip, fileId, fps, indent = 0) {
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
    tag('masterclipid', {}, `masterclip-${clip.id}`, indent + 1),
    tag('file', { id: fileId }, null, indent + 1),
  ];

  // DaVinci uses link elements for A/V sync
  children.push(
    tag('link', {}, [
      tag('linkclipref', {}, `clipitem-${clip.id}`, indent + 2),
      tag('mediatype', {}, 'video', indent + 2),
      tag('trackindex', {}, '1', indent + 2),
      tag('clipindex', {}, String(clip.index + 1), indent + 2),
    ], indent + 1),
  );

  children.push(
    tag('link', {}, [
      tag('linkclipref', {}, `clipitem-audio-${clip.id}`, indent + 2),
      tag('mediatype', {}, 'audio', indent + 2),
      tag('trackindex', {}, '1', indent + 2),
      tag('clipindex', {}, String(clip.index + 1), indent + 2),
    ], indent + 1),
  );

  // Markers
  if (clip.markers && clip.markers.length > 0) {
    for (const marker of clip.markers) {
      children.push(buildMarker(marker, fps, indent + 1));
    }
  }

  // Comments with metadata
  const comment = [
    `Score: ${clip.engagementScore}`,
    `Category: ${clip.category}`,
    `Platform: ${(clip.platform || []).join(', ')}`,
    `Format: ${clip.format}`,
  ].join(' | ');
  children.push(tag('comments', {}, [
    tag('mastercomment1', {}, comment, indent + 2),
    tag('mastercomment2', {}, clip.transcriptExcerpt || '', indent + 2),
  ], indent + 1));

  return tag('clipitem', { id: `clipitem-${clip.id}` }, children, indent);
}

/**
 * Build DaVinci audio clip-item.
 */
function buildDaVinciAudioClipItem(clip, fileId, fps, indent = 0) {
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
    tag('masterclipid', {}, `masterclip-${clip.id}`, indent + 1),
    tag('file', { id: fileId }, null, indent + 1),
    tag('sourcetrack', {}, [
      tag('mediatype', {}, 'audio', indent + 2),
      tag('trackindex', {}, '1', indent + 2),
    ], indent + 1),
    tag('link', {}, [
      tag('linkclipref', {}, `clipitem-${clip.id}`, indent + 2),
      tag('mediatype', {}, 'video', indent + 2),
      tag('trackindex', {}, '1', indent + 2),
      tag('clipindex', {}, String(clip.index + 1), indent + 2),
    ], indent + 1),
  ], indent);
}

/**
 * Generate complete DaVinci Resolve XML from timeline.
 */
function generateDaVinciXml(timeline) {
  const fps = timeline.timelineFPS;
  const res = timeline.resolution;
  const totalFrames = timeline.totalDurationFrames;
  const fileId = 'file-source-1';

  // Video clips
  const videoClipItems = timeline.videoTrack.clips.map(
    clip => buildDaVinciClipItem(clip, fileId, fps, 5),
  );

  // Audio clips
  const audioClipItems = timeline.audioTrack.clips.map(
    clip => buildDaVinciAudioClipItem(clip, fileId, fps, 5),
  );

  // Sequence markers
  const sequenceMarkers = (timeline.markers || []).map(
    m => buildMarker(m, fps, 4),
  );

  // File reference
  const fileRef = buildDaVinciFileRef(
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
            // Markers at sequence level
            ...sequenceMarkers,
            tag('media', {}, [
              // Video tracks
              tag('video', {}, [
                buildFormat(res, fps, 6),
                tag('track', {}, [
                  ...videoClipItems,
                  tag('enabled', {}, 'TRUE', 6),
                  tag('locked', {}, 'FALSE', 6),
                ], 5),
              ], 5),
              // Audio tracks
              tag('audio', {}, [
                tag('numOutputChannels', {}, '2', 6),
                tag('format', {}, [
                  tag('samplecharacteristics', {}, [
                    tag('samplerate', {}, '48000', 7),
                    tag('depth', {}, '16', 7),
                  ], 6),
                ], 5),
                tag('track', {}, [
                  ...audioClipItems,
                  tag('enabled', {}, 'TRUE', 6),
                  tag('locked', {}, 'FALSE', 6),
                ], 5),
              ], 5),
            ], 4),
          ], 3),
          // Bin with source media
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
 * Export DaVinci Resolve XML for a project.
 */
function exportDaVinciXml(projectId, mode, cutId) {
  const timeline = serializeTimeline(projectId, mode, cutId);
  const xml = generateDaVinciXml(timeline);

  // Save to exports directory
  const exportDir = path.join(getProjectDir(projectId), 'exports');
  fs.mkdirSync(exportDir, { recursive: true });

  const projectName = (timeline.projectName || projectId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const suffix = mode === 'single' && cutId ? cutId : mode;
  const filename = `${projectName}-davinci-${suffix}.xml`;
  const outputPath = path.join(exportDir, filename);

  fs.writeFileSync(outputPath, xml, 'utf8');

  // Save export history entry
  saveExportHistory(projectId, {
    editor: 'davinci',
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
    editor: 'davinci',
    mode,
    clipCount: timeline.videoTrack.clips.length,
    totalDuration: timeline.totalDuration,
  };
}

module.exports = {
  exportDaVinciXml,
  generateDaVinciXml,
};
