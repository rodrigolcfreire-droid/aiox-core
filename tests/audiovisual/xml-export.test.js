'use strict';

/**
 * Tests for Central Audiovisual — XML Export
 * Story: AV-13
 */

const fs = require('fs');
const path = require('path');
const {
  escapeXml,
  tag,
  xmlDeclaration,
  fcpDoctype,
  secondsToTimecode,
  secondsToFrames,
} = require('../../packages/audiovisual/lib/xml-mapper');

const {
  serializeTimeline,
  serializeSingle,
  serializeApproved,
  buildClip,
  buildMarkers,
  DEFAULT_FPS,
  FORMAT_RESOLUTIONS,
} = require('../../packages/audiovisual/lib/timeline-serializer');

const {
  generatePremiereXml,
} = require('../../packages/audiovisual/lib/export-premiere-xml');

const {
  generateDaVinciXml,
} = require('../../packages/audiovisual/lib/export-davinci-xml');

const {
  createZip,
  crc32,
  formatDuration,
  formatBytes,
} = require('../../packages/audiovisual/lib/export-package');

// ── xml-mapper ──────────────────────────────────────────

describe('escapeXml', () => {
  test('escapes special XML characters', () => {
    expect(escapeXml('a & b < c > d "e" \'f\'')).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;',
    );
  });

  test('handles non-string values', () => {
    expect(escapeXml(42)).toBe('42');
    expect(escapeXml(null)).toBe('null');
  });
});

describe('tag', () => {
  test('builds self-closing tag', () => {
    expect(tag('br')).toBe('<br/>\n');
  });

  test('builds tag with text content', () => {
    expect(tag('name', {}, 'hello')).toBe('<name>hello</name>\n');
  });

  test('builds tag with attributes', () => {
    expect(tag('file', { id: 'f1' }, null)).toBe('<file id="f1"/>\n');
  });

  test('builds tag with children array', () => {
    const result = tag('parent', {}, [
      tag('child', {}, 'text', 1),
    ], 0);
    expect(result).toContain('<parent>');
    expect(result).toContain('</parent>');
    expect(result).toContain('<child>text</child>');
  });

  test('applies indentation', () => {
    const result = tag('item', {}, 'value', 2);
    expect(result).toMatch(/^\s{4}<item>/);
  });

  test('escapes attribute values', () => {
    const result = tag('node', { title: 'a & b' }, null);
    expect(result).toContain('title="a &amp; b"');
  });

  test('omits null/undefined attributes', () => {
    const result = tag('node', { a: '1', b: null, c: undefined }, null);
    expect(result).toContain('a="1"');
    expect(result).not.toContain('b=');
    expect(result).not.toContain('c=');
  });
});

describe('secondsToTimecode', () => {
  test('converts 0 seconds', () => {
    expect(secondsToTimecode(0, 30)).toBe('00:00:00:00');
  });

  test('converts 90 seconds', () => {
    expect(secondsToTimecode(90, 30)).toBe('00:01:30:00');
  });

  test('converts with frame remainder', () => {
    // 1.5 seconds at 30fps = 45 frames = 00:00:01:15
    expect(secondsToTimecode(1.5, 30)).toBe('00:00:01:15');
  });

  test('converts hours', () => {
    expect(secondsToTimecode(3661, 30)).toBe('01:01:01:00');
  });
});

describe('secondsToFrames', () => {
  test('converts seconds to frame count', () => {
    expect(secondsToFrames(1, 30)).toBe(30);
    expect(secondsToFrames(0.5, 30)).toBe(15);
    expect(secondsToFrames(10, 24)).toBe(240);
  });
});

describe('xmlDeclaration', () => {
  test('generates standard XML declaration', () => {
    expect(xmlDeclaration()).toBe('<?xml version="1.0" encoding="UTF-8"?>\n');
  });
});

describe('fcpDoctype', () => {
  test('generates FCP DOCTYPE', () => {
    expect(fcpDoctype()).toBe('<!DOCTYPE xmeml>\n');
  });
});

// ── timeline-serializer ──────────────────────────────────

describe('buildMarkers', () => {
  test('builds markers from cut metadata', () => {
    const cut = {
      category: 'viral',
      engagementScore: 8.5,
      platform: ['reels', 'tiktok'],
      source: 'hook-content',
      objective: 'Alto impacto',
      transcriptExcerpt: 'Teste de transcript',
      start: 0,
      end: 30,
    };

    const markers = buildMarkers(cut, null, null);
    expect(markers.length).toBeGreaterThanOrEqual(2);
    expect(markers[0].name).toContain('viral');
    expect(markers[0].comment).toContain('8.5');
  });

  test('includes approval marker when decision exists', () => {
    const cut = { category: 'educativo', engagementScore: 6, platform: [], start: 0, end: 20 };
    const decision = { decision: 'approved', feedback: 'bom corte' };

    const markers = buildMarkers(cut, decision, null);
    const approvalMarker = markers.find(m => m.name === 'APPROVED');
    expect(approvalMarker).toBeDefined();
    expect(approvalMarker.color).toBe('green');
  });

  test('includes energy peak markers within cut range', () => {
    const cut = { category: 'viral', engagementScore: 7, platform: [], start: 40, end: 60 };
    const energy = {
      topPeaks: [
        { start: 45, rank: 1, meanVolume: -15 },
        { start: 100, rank: 2, meanVolume: -20 },
      ],
    };

    const markers = buildMarkers(cut, null, energy);
    const peakMarker = markers.find(m => m.name.includes('Peak Energy'));
    expect(peakMarker).toBeDefined();
    expect(peakMarker.frame).toBe(Math.round((45 - 40) * DEFAULT_FPS));
  });
});

describe('buildClip', () => {
  test('builds clip structure from cut', () => {
    const cut = {
      id: 'cut_001',
      start: 10,
      end: 40,
      duration: 30,
      category: 'viral',
      engagementScore: 8,
      platform: ['reels'],
      format: '9:16',
      source: 'single-block',
      transcriptExcerpt: 'Test excerpt',
      status: 'suggested',
    };

    const clip = buildClip(cut, 0, null, null);
    expect(clip.id).toBe('cut_001');
    expect(clip.startFrame).toBe(300);
    expect(clip.endFrame).toBe(1200);
    expect(clip.durationFrames).toBe(900);
    expect(clip.resolution).toEqual({ width: 1080, height: 1920 });
    expect(clip.markers.length).toBeGreaterThan(0);
  });
});

describe('serializeTimeline', () => {
  test('throws on unknown mode', () => {
    expect(() => serializeTimeline('fake-id', 'invalid')).toThrow('Unknown export mode');
  });

  test('throws when cutId missing for single mode', () => {
    expect(() => serializeTimeline('fake-id', 'single')).toThrow('cutId required');
  });
});

// ── export-premiere-xml ──────────────────────────────────

describe('generatePremiereXml', () => {
  test('generates valid FCP XML structure', () => {
    const timeline = createMockTimeline();
    const xml = generatePremiereXml(timeline);

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<!DOCTYPE xmeml>');
    expect(xml).toContain('<xmeml version="5">');
    expect(xml).toContain('<project>');
    expect(xml).toContain('<sequence id="sequence-1">');
    expect(xml).toContain('Test Project');
    expect(xml).toContain('</xmeml>');
  });

  test('includes clip items with metadata', () => {
    const timeline = createMockTimeline();
    const xml = generatePremiereXml(timeline);

    expect(xml).toContain('clipitem');
    expect(xml).toContain('cut_001');
    expect(xml).toContain('Score: 8.5');
  });

  test('includes markers', () => {
    const timeline = createMockTimeline();
    const xml = generatePremiereXml(timeline);

    expect(xml).toContain('<marker>');
    expect(xml).toContain('viral');
  });

  test('includes video and audio tracks', () => {
    const timeline = createMockTimeline();
    const xml = generatePremiereXml(timeline);

    expect(xml).toContain('<video>');
    expect(xml).toContain('<audio>');
    expect(xml).toContain('<numOutputChannels>2</numOutputChannels>');
  });

  test('includes file reference in bin', () => {
    const timeline = createMockTimeline();
    const xml = generatePremiereXml(timeline);

    expect(xml).toContain('<bin>');
    expect(xml).toContain('Source Media');
    expect(xml).toContain('file://localhost');
  });
});

// ── export-davinci-xml ───────────────────────────────────

describe('generateDaVinciXml', () => {
  test('generates valid FCP XML for DaVinci', () => {
    const timeline = createMockTimeline();
    const xml = generateDaVinciXml(timeline);

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<!DOCTYPE xmeml>');
    expect(xml).toContain('<xmeml version="5">');
    expect(xml).toContain('<sequence id="sequence-1">');
  });

  test('includes masterclipid (DaVinci-specific)', () => {
    const timeline = createMockTimeline();
    const xml = generateDaVinciXml(timeline);

    expect(xml).toContain('<masterclipid>');
    expect(xml).toContain('masterclip-cut_001');
  });

  test('includes link elements for A/V sync', () => {
    const timeline = createMockTimeline();
    const xml = generateDaVinciXml(timeline);

    expect(xml).toContain('<link>');
    expect(xml).toContain('<linkclipref>');
    expect(xml).toContain('<mediatype>video</mediatype>');
    expect(xml).toContain('<mediatype>audio</mediatype>');
  });
});

// ── export-package utilities ──────────────────────────────

describe('crc32', () => {
  test('computes CRC-32 correctly', () => {
    const result = crc32(Buffer.from('hello'));
    expect(result).toBe(0x3610A686);
  });

  test('empty buffer returns expected value', () => {
    const result = crc32(Buffer.from(''));
    expect(result).toBe(0);
  });
});

describe('createZip', () => {
  test('creates valid ZIP buffer', () => {
    const entries = [
      { name: 'test.txt', data: 'Hello, World!' },
      { name: 'data.json', data: '{"key": "value"}' },
    ];

    const zip = createZip(entries);
    expect(Buffer.isBuffer(zip)).toBe(true);
    expect(zip.length).toBeGreaterThan(0);

    // Check ZIP magic number (PK\x03\x04)
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4B);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
  });

  test('handles single entry', () => {
    const entries = [{ name: 'single.txt', data: 'data' }];
    const zip = createZip(entries);
    expect(zip[0]).toBe(0x50);
  });
});

describe('formatDuration', () => {
  test('formats seconds to MM:SS', () => {
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(3661)).toBe('61:01');
  });
});

describe('formatBytes', () => {
  test('formats bytes correctly', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(1500000)).toBe('1.4 MB');
  });
});

// ── Test Helpers ──────────────────────────────────────────

function createMockTimeline() {
  return {
    projectId: 'test-project-123',
    projectName: 'Test Project',
    sequenceName: 'Test Project — Approved Cuts',
    exportMode: 'approved',
    createdAt: '2026-03-24T12:00:00.000Z',
    sourceVideoPath: '/tmp/test/source/video.mp4',
    sourceVideoDuration: 300,
    timelineFPS: 30,
    resolution: { width: 1920, height: 1080 },
    totalDuration: 60,
    totalDurationFrames: 1800,
    videoTrack: {
      name: 'V1',
      clips: [
        {
          id: 'cut_001',
          index: 0,
          name: 'cut_001 — viral',
          start: 10,
          end: 40,
          duration: 30,
          inPoint: 10,
          outPoint: 40,
          startFrame: 300,
          endFrame: 1200,
          durationFrames: 900,
          timelineStart: 0,
          timelineEnd: 30,
          timelineStartFrame: 0,
          timelineEndFrame: 900,
          category: 'viral',
          engagementScore: 8.5,
          platform: ['reels', 'tiktok'],
          format: '9:16',
          source: 'hook-content',
          transcriptExcerpt: 'Isso e inacreditavel',
          status: 'approved',
          markers: [
            { name: 'Categoria: viral', comment: 'Score: 8.5', frame: 0, color: 'cyan' },
          ],
          resolution: { width: 1080, height: 1920 },
        },
        {
          id: 'cut_002',
          index: 1,
          name: 'cut_002 — educativo',
          start: 60,
          end: 90,
          duration: 30,
          inPoint: 60,
          outPoint: 90,
          startFrame: 1800,
          endFrame: 2700,
          durationFrames: 900,
          timelineStart: 30,
          timelineEnd: 60,
          timelineStartFrame: 900,
          timelineEndFrame: 1800,
          category: 'educativo',
          engagementScore: 7.2,
          platform: ['youtube'],
          format: '16:9',
          source: 'single-block',
          transcriptExcerpt: 'Como fazer passo a passo',
          status: 'approved',
          markers: [
            { name: 'Categoria: educativo', comment: 'Score: 7.2', frame: 0, color: 'cyan' },
          ],
          resolution: { width: 1920, height: 1080 },
        },
      ],
    },
    audioTrack: {
      name: 'A1',
      clips: [
        {
          id: 'cut_001',
          index: 0,
          name: 'Audio — cut_001 — viral',
          start: 10,
          end: 40,
          duration: 30,
          inPoint: 10,
          outPoint: 40,
          startFrame: 300,
          endFrame: 1200,
          durationFrames: 900,
          timelineStart: 0,
          timelineEnd: 30,
          timelineStartFrame: 0,
          timelineEndFrame: 900,
          category: 'viral',
          engagementScore: 8.5,
          platform: ['reels'],
          format: '9:16',
          source: 'hook-content',
          transcriptExcerpt: '',
          status: 'approved',
          markers: [],
          resolution: { width: 1080, height: 1920 },
        },
        {
          id: 'cut_002',
          index: 1,
          name: 'Audio — cut_002 — educativo',
          start: 60,
          end: 90,
          duration: 30,
          inPoint: 60,
          outPoint: 90,
          startFrame: 1800,
          endFrame: 2700,
          durationFrames: 900,
          timelineStart: 30,
          timelineEnd: 60,
          timelineStartFrame: 900,
          timelineEndFrame: 1800,
          category: 'educativo',
          engagementScore: 7.2,
          platform: ['youtube'],
          format: '16:9',
          source: 'single-block',
          transcriptExcerpt: '',
          status: 'approved',
          markers: [],
          resolution: { width: 1920, height: 1080 },
        },
      ],
    },
    markers: [
      { name: 'Categoria: viral', comment: 'Score: 8.5', frame: 0, color: 'cyan' },
      { name: 'Categoria: educativo', comment: 'Score: 7.2', frame: 900, color: 'cyan' },
    ],
    transitions: [],
    metadata: {
      cutCount: 2,
      categories: ['viral', 'educativo'],
      platforms: ['reels', 'tiktok', 'youtube'],
      avgEngagement: 7.85,
    },
  };
}
