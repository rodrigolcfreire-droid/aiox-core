#!/usr/bin/env node
'use strict';

/**
 * xml-mapper.js — Timeline to XML structure mapper
 * Story: AV-13
 *
 * Converts abstract timeline objects into XML strings.
 * Pure Node.js XML generation — zero external dependencies.
 */

/**
 * Escape XML special characters.
 */
function escapeXml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build an XML tag with attributes and children.
 */
function tag(name, attrs = {}, children = null, indent = 0) {
  const pad = '  '.repeat(indent);
  const attrStr = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join('');

  if (children === null || children === undefined) {
    return `${pad}<${name}${attrStr}/>\n`;
  }

  if (typeof children === 'string' || typeof children === 'number') {
    return `${pad}<${name}${attrStr}>${escapeXml(children)}</${name}>\n`;
  }

  // children is array of strings (pre-built XML)
  if (Array.isArray(children)) {
    const inner = children.join('');
    return `${pad}<${name}${attrStr}>\n${inner}${pad}</${name}>\n`;
  }

  return `${pad}<${name}${attrStr}>${children}</${name}>\n`;
}

/**
 * Build XML declaration.
 */
function xmlDeclaration(version = '1.0', encoding = 'UTF-8') {
  return `<?xml version="${version}" encoding="${encoding}"?>\n`;
}

/**
 * Build DOCTYPE declaration for FCP XML.
 */
function fcpDoctype() {
  return '<!DOCTYPE xmeml>\n';
}

/**
 * Convert seconds to FCP timecode string (HH:MM:SS:FF).
 */
function secondsToTimecode(seconds, fps = 30) {
  const totalFrames = Math.round(seconds * fps);
  const h = Math.floor(totalFrames / (fps * 3600));
  const m = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
  const s = Math.floor((totalFrames % (fps * 60)) / fps);
  const f = totalFrames % fps;

  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
    String(f).padStart(2, '0'),
  ].join(':');
}

/**
 * Convert seconds to frame count.
 */
function secondsToFrames(seconds, fps = 30) {
  return Math.round(seconds * fps);
}

/**
 * Build FCP rate element.
 */
function buildRate(fps, indent = 0) {
  return [
    tag('ntsc', {}, 'FALSE', indent),
    tag('timebase', {}, String(fps), indent),
  ];
}

/**
 * Build FCP timecode element.
 */
function buildTimecode(fps, indent = 0) {
  return [
    tag('timecode', {}, [
      ...buildRate(fps, indent + 1),
      tag('string', {}, '00:00:00:00', indent + 1),
      tag('frame', {}, '0', indent + 1),
      tag('displayformat', {}, 'NDF', indent + 1),
    ], indent),
  ];
}

/**
 * Build FCP format element.
 */
function buildFormat(resolution, fps, indent = 0) {
  return tag('format', {}, [
    tag('samplecharacteristics', {}, [
      ...buildRate(fps, indent + 2),
      tag('width', {}, String(resolution.width), indent + 2),
      tag('height', {}, String(resolution.height), indent + 2),
      tag('anamorphic', {}, 'FALSE', indent + 2),
      tag('pixelaspectratio', {}, 'square', indent + 2),
      tag('fielddominance', {}, 'none', indent + 2),
    ], indent + 1),
  ], indent);
}

/**
 * Build FCP marker element.
 */
function buildMarker(marker, fps, indent = 0) {
  return tag('marker', {}, [
    tag('name', {}, marker.name || '', indent + 1),
    tag('comment', {}, marker.comment || '', indent + 1),
    tag('in', {}, String(marker.frame || 0), indent + 1),
    tag('out', {}, '-1', indent + 1),
    tag('color', {}, marker.color || 'cyan', indent + 1),
  ], indent);
}

/**
 * Build a file reference element.
 */
function buildFileRef(fileId, filePath, duration, fps, resolution, indent = 0) {
  return tag('file', { id: fileId }, [
    tag('name', {}, filePath ? filePath.split('/').pop() : 'source.mp4', indent + 1),
    tag('pathurl', {}, filePath ? `file://localhost${filePath}` : '', indent + 1),
    tag('duration', {}, String(secondsToFrames(duration, fps)), indent + 1),
    ...buildRate(fps, indent + 1),
    ...buildTimecode(fps, indent + 1),
    tag('media', {}, [
      tag('video', {}, [
        buildFormat(resolution, fps, indent + 3),
      ], indent + 2),
      tag('audio', {}, [
        tag('samplecharacteristics', {}, [
          tag('samplerate', {}, '48000', indent + 4),
          tag('depth', {}, '16', indent + 4),
        ], indent + 3),
      ], indent + 2),
    ], indent + 1),
  ], indent);
}

module.exports = {
  escapeXml,
  tag,
  xmlDeclaration,
  fcpDoctype,
  secondsToTimecode,
  secondsToFrames,
  buildRate,
  buildTimecode,
  buildFormat,
  buildMarker,
  buildFileRef,
};
