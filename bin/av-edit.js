#!/usr/bin/env node
'use strict';

/**
 * av-edit.js — CLI for non-destructive edit management
 * Story: EG-1
 *
 * Subcommands:
 *   create          Create a new edit from video path or cutId
 *   trim            Update trim points on an edit
 *   transcript-edit Correct a transcript word
 *   list            List all edits
 *   show            Show full edit JSON
 *
 * CLI First: This script is the source of truth for edit operations.
 */

const path = require('path');
const fs = require('fs');
const {
  createEdit,
  getEdit,
  listEdits,
  updateEdit,
  resolveCutId,
} = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'edit-store'));
const { SUPPORTED_FORMATS } = require(path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'constants'));

function parseArgs(args) {
  const result = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    } else {
      result._.push(args[i]);
    }
  }
  return result;
}

function showHelp() {
  console.log('');
  console.log('  Central Audiovisual — Edit Manager');
  console.log('');
  console.log('  Usage: node bin/av-edit.js <command> [options]');
  console.log('');
  console.log('  Commands:');
  console.log('    create --source <path-or-cutId>       Create new edit');
  console.log('    trim --edit <editId> --in X --out Y   Update trim points');
  console.log('    transcript-edit --edit <editId> --index N --text "new"');
  console.log('                                          Correct transcript word');
  console.log('    list                                  List all edits');
  console.log('    show <editId>                         Show full edit JSON');
  console.log('');
  console.log('  Examples:');
  console.log('    node bin/av-edit.js create --source ./video.mp4');
  console.log('    node bin/av-edit.js create --source cut_001');
  console.log('    node bin/av-edit.js trim --edit abc-123 --in 5.0 --out 30.0');
  console.log('    node bin/av-edit.js transcript-edit --edit abc-123 --index 2 --text "corrected"');
  console.log('    node bin/av-edit.js list');
  console.log('    node bin/av-edit.js show abc-123');
  console.log('');
}

/**
 * Detect whether --source is a file path or a cutId.
 * File paths have extensions or path separators; cutIds match cut_NNN pattern.
 */
function isFilePath(source) {
  const ext = path.extname(source).toLowerCase();
  if (SUPPORTED_FORMATS.includes(ext)) return true;
  if (source.includes(path.sep) || source.includes('/')) return true;
  return false;
}

async function cmdCreate(parsed) {
  const source = parsed.source;
  if (!source) {
    console.error('  Error: --source is required');
    console.error('  Usage: node bin/av-edit.js create --source <path-or-cutId>');
    process.exit(1);
  }

  if (isFilePath(source)) {
    // Standalone mode — source is a video file path
    const videoPath = path.resolve(source);
    if (!fs.existsSync(videoPath)) {
      console.error(`  Error: Video file not found: ${videoPath}`);
      process.exit(1);
    }

    console.log(`  Creating standalone edit from: ${path.basename(videoPath)}`);

    // Auto-transcribe
    let transcript = [];
    try {
      console.log('  Transcribing...');
      const { transcribeWithWhisper } = require(
        path.resolve(__dirname, '..', 'packages', 'audiovisual', 'lib', 'transcribe'),
      );
      // For standalone, we need a temporary approach — transcribe returns segments
      // We convert transcription segments to edit transcript format
      const transcription = await transcribeWithWhisper(videoPath);
      transcript = (transcription.segments || []).map(seg => ({
        t: seg.start,
        text: seg.text,
        edited: false,
      }));
      console.log(`  Transcribed: ${transcript.length} segments`);
    } catch (err) {
      console.log(`  Warning: Transcription failed (${err.message}). Creating edit without transcript.`);
    }

    const edit = createEdit(videoPath, 'standalone', { transcript });
    console.log(`  Edit created: ${edit.editId}`);
    console.log(`  Status: ${edit.status}`);
    console.log(`  Transcript segments: ${edit.transcript.length}`);
    return edit;
  } else {
    // Cut mode — source is a cutId
    console.log(`  Resolving cut: ${source}`);

    const { projectId, cut } = resolveCutId(source);

    console.log(`  Project: ${projectId}`);
    console.log(`  Cut: ${cut.id} [${cut.start}s - ${cut.end}s]`);

    const sourceVideo = source;
    const transcript = [];
    const edit = createEdit(sourceVideo, projectId, {
      transcript,
      subtitles: [],
    });

    // Set initial trim from cut boundaries
    updateEdit(edit.editId, {
      trim: { in: cut.start, out: cut.end },
    });

    const updated = getEdit(edit.editId);
    console.log(`  Edit created: ${updated.editId}`);
    console.log(`  Trim: ${updated.trim.in}s - ${updated.trim.out}s`);
    console.log(`  Status: ${updated.status}`);
    return updated;
  }
}

function cmdTrim(parsed) {
  const editId = parsed.edit;
  if (!editId) {
    console.error('  Error: --edit is required');
    console.error('  Usage: node bin/av-edit.js trim --edit <editId> --in X --out Y');
    process.exit(1);
  }

  const trimIn = parsed.in !== undefined ? parseFloat(parsed.in) : undefined;
  const trimOut = parsed.out !== undefined ? parseFloat(parsed.out) : undefined;

  if (trimIn === undefined && trimOut === undefined) {
    console.error('  Error: At least --in or --out must be provided');
    process.exit(1);
  }

  const edit = getEdit(editId);
  const newTrim = { ...edit.trim };

  if (trimIn !== undefined) newTrim.in = trimIn;
  if (trimOut !== undefined) newTrim.out = trimOut;

  const updated = updateEdit(editId, { trim: newTrim });

  console.log(`  Trim updated for edit: ${editId}`);
  console.log(`  In: ${updated.trim.in}s  Out: ${updated.trim.out}s`);
  return updated;
}

function cmdTranscriptEdit(parsed) {
  const editId = parsed.edit;
  const index = parsed.index !== undefined ? parseInt(parsed.index, 10) : undefined;
  const text = parsed.text;

  if (!editId || index === undefined || !text) {
    console.error('  Error: --edit, --index, and --text are all required');
    console.error('  Usage: node bin/av-edit.js transcript-edit --edit <editId> --index N --text "new text"');
    process.exit(1);
  }

  const edit = getEdit(editId);

  if (!edit.transcript || index < 0 || index >= edit.transcript.length) {
    console.error(`  Error: Transcript index ${index} out of range (0-${(edit.transcript || []).length - 1})`);
    process.exit(1);
  }

  // Preserve original timestamp, update text and mark as edited
  const transcript = [...edit.transcript];
  transcript[index] = {
    ...transcript[index],
    text,
    edited: true,
  };

  const updated = updateEdit(editId, { transcript });

  console.log(`  Transcript updated for edit: ${editId}`);
  console.log(`  Index ${index}: "${text}" (edited: true, t: ${updated.transcript[index].t})`);
  return updated;
}

function cmdList() {
  const edits = listEdits();

  if (edits.length === 0) {
    console.log('  No edits found.');
    return;
  }

  console.log('');
  console.log('  ── Edits ────────────────────────────────────────');
  for (const edit of edits) {
    const date = edit.createdAt ? edit.createdAt.slice(0, 10) : 'unknown';
    const source = typeof edit.sourceVideo === 'string'
      ? path.basename(edit.sourceVideo)
      : edit.sourceVideo;
    console.log(`  ${edit.editId}  ${String(edit.status).padEnd(10)}  ${source}  ${date}`);
  }
  console.log(`  Total: ${edits.length}`);
  console.log('');
}

function cmdShow(editId) {
  if (!editId) {
    console.error('  Error: editId is required');
    console.error('  Usage: node bin/av-edit.js show <editId>');
    process.exit(1);
  }

  const edit = getEdit(editId);
  console.log(JSON.stringify(edit, null, 2));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    process.exit(0);
  }

  const command = args[0];
  const parsed = parseArgs(args.slice(1));

  try {
    switch (command) {
      case 'create':
        await cmdCreate(parsed);
        break;
      case 'trim':
        cmdTrim(parsed);
        break;
      case 'transcript-edit':
        cmdTranscriptEdit(parsed);
        break;
      case 'list':
        cmdList();
        break;
      case 'show':
        cmdShow(parsed._[0] || parsed.edit);
        break;
      default:
        console.error(`  Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    process.exit(1);
  }
}

main();
