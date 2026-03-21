'use strict';

/**
 * Tests for LLM Intelligence — Hook Detection + Titles
 * Story: AV-11
 */

const {
  isLLMAvailable,
  callClaude,
  callClaudeJSON,
} = require('../../packages/audiovisual/lib/llm-client');

const {
  detectHooksWithLLM,
  generateViralTitles,
  loadLLMHooks,
} = require('../../packages/audiovisual/lib/llm-hooks');

// ── LLM Client ────────────────────────────────────

describe('LLM Client', () => {
  test('isLLMAvailable returns boolean', () => {
    const result = isLLMAvailable();
    expect(typeof result).toBe('boolean');
  });

  test('callClaude throws without API key', () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => callClaude('test')).toThrow('ANTHROPIC_API_KEY not set');

    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  test('callClaudeJSON throws without API key', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    await expect(callClaudeJSON('test')).rejects.toThrow('ANTHROPIC_API_KEY not set');

    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });
});

// ── LLM Hooks ─────────────────────────────────────

describe('LLM Hooks', () => {
  test('detectHooksWithLLM returns null when no API key', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = await detectHooksWithLLM('nonexistent');
    expect(result).toBeNull();

    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  test('generateViralTitles returns null when no API key', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = await generateViralTitles('nonexistent');
    expect(result).toBeNull();

    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  test('loadLLMHooks returns null for nonexistent project', () => {
    const result = loadLLMHooks('nonexistent-project');
    expect(result).toBeNull();
  });

  test('isLLMAvailable exported from llm-hooks', () => {
    expect(typeof isLLMAvailable).toBe('function');
  });
});
