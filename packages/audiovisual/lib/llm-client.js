#!/usr/bin/env node
'use strict';

/**
 * llm-client.js — Native HTTPS client for Claude API
 * Story: AV-11
 *
 * Zero-dependency Anthropic API client using Node.js stdlib.
 * Falls back gracefully when ANTHROPIC_API_KEY is not set.
 */

const https = require('https');

const API_HOST = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 2048;

/**
 * Check if LLM is available (API key configured).
 */
function isLLMAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Call Claude API with a prompt. Returns the text response.
 * Throws if API key missing or API error.
 */
function callClaude(prompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set — LLM features disabled');
  }

  const body = JSON.stringify({
    model: options.model || MODEL,
    max_tokens: options.maxTokens || MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
    ...(options.system ? { system: options.system } : {}),
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Claude API error: ${parsed.error.message}`));
            return;
          }
          const text = parsed.content && parsed.content[0] && parsed.content[0].text;
          if (!text) {
            reject(new Error('Claude API returned empty response'));
            return;
          }
          resolve(text);
        } catch (err) {
          reject(new Error(`Failed to parse Claude response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Claude API request failed: ${err.message}`));
    });

    req.setTimeout(options.timeout || 60000, () => {
      req.destroy();
      reject(new Error('Claude API request timed out'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Call Claude with JSON response expected. Parses the JSON from the response.
 */
async function callClaudeJSON(prompt, options = {}) {
  const text = await callClaude(prompt, {
    ...options,
    system: (options.system || '') + '\n\nRespond ONLY with valid JSON. No markdown, no explanation, just JSON.',
  });

  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Failed to parse Claude JSON response: ${err.message}\nResponse: ${text.substring(0, 200)}`);
  }
}

module.exports = {
  isLLMAvailable,
  callClaude,
  callClaudeJSON,
  MODEL,
};
