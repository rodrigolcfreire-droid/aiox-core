#!/usr/bin/env node
'use strict';

/**
 * describe.js — Content description generator
 * Story: AV-3.2
 *
 * Generates automatic descriptions, topics, keywords,
 * and title suggestions from video transcription.
 */

const fs = require('fs');
const path = require('path');
const { getProjectDir } = require('./project');
const { normalizeText } = require('./segment');

// Portuguese stop words to filter out
const STOP_WORDS = new Set([
  'a', 'o', 'e', 'de', 'do', 'da', 'em', 'um', 'uma', 'para', 'com',
  'nao', 'por', 'mais', 'que', 'se', 'na', 'no', 'os', 'as', 'dos',
  'das', 'ao', 'ou', 'ser', 'ter', 'como', 'foi', 'isso', 'esse',
  'essa', 'este', 'esta', 'eu', 'ele', 'ela', 'nos', 'voce', 'voces',
  'eles', 'elas', 'meu', 'minha', 'seu', 'sua', 'muito', 'ja', 'so',
  'tem', 'vai', 'vou', 'ta', 'ne', 'la', 'aqui', 'ai', 'entao',
  'mas', 'tambem', 'quando', 'porque', 'onde', 'ate', 'ainda', 'bem',
  'agora', 'depois', 'antes', 'sobre', 'entre', 'cada', 'toda', 'todo',
  'pode', 'fazer', 'coisa', 'gente', 'tudo', 'mesmo', 'assim', 'tipo',
  'etc', 'meio', 'vez', 'vezes', 'dia', 'ser', 'estar', 'ter', 'ir',
  'tenho', 'tinha', 'teve', 'tive', 'fica', 'ficou', 'deu', 'dou',
  'faz', 'fez', 'sao', 'eram', 'seria', 'sera', 'sido', 'sendo',
]);

function extractKeywords(text, maxKeywords = 20) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));

  // Count frequency
  const freq = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  // Sort by frequency
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word, count]) => ({ word, count }));
}

function extractTopics(segments, maxTopics = 10) {
  // Group keywords by segment to find topic clusters
  const allText = segments.map(s => s.text).join(' ');
  const keywords = extractKeywords(allText, 50);

  // Find bigrams (two-word phrases)
  const normalized = normalizeText(allText);
  const words = normalized.split(/\s+/);
  const bigrams = {};
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i].length > 3 && words[i + 1].length > 3 &&
        !STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      bigrams[bigram] = (bigrams[bigram] || 0) + 1;
    }
  }

  // Combine top keywords and bigrams as topics
  const topBigrams = Object.entries(bigrams)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.floor(maxTopics / 2))
    .map(([phrase, count]) => ({ topic: phrase, frequency: count, type: 'phrase' }));

  const topKeywords = keywords
    .slice(0, maxTopics - topBigrams.length)
    .map(({ word, count }) => ({ topic: word, frequency: count, type: 'keyword' }));

  return [...topBigrams, ...topKeywords]
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, maxTopics);
}

function generateSummary(segments, maxSentences = 3) {
  if (segments.length === 0) return '';

  // Use first, middle, and last segments for summary
  const positions = [
    0,
    Math.floor(segments.length / 2),
    segments.length - 1,
  ];

  const sentences = [...new Set(positions)]
    .map(i => segments[i].text.trim())
    .filter(t => t.length > 10)
    .slice(0, maxSentences);

  return sentences.join('. ') + '.';
}

function suggestTitles(keywords, topics, segmentBlocks) {
  const titles = [];

  // From top keywords
  if (keywords.length >= 2) {
    const top2 = keywords.slice(0, 2).map(k => k.word);
    titles.push(`${capitalize(top2[0])} e ${top2[1]}: o que voce precisa saber`);
  }

  // From topics
  if (topics.length > 0) {
    titles.push(`Tudo sobre ${topics[0].topic}`);
  }

  // From hook blocks
  if (segmentBlocks) {
    const hookBlock = segmentBlocks.find(b => b.type === 'hook');
    if (hookBlock && hookBlock.title) {
      titles.push(hookBlock.title);
    }
  }

  // Generic templates
  if (keywords.length > 0) {
    titles.push(`${capitalize(keywords[0].word)}: guia completo`);
    titles.push(`Como dominar ${keywords[0].word} em minutos`);
  }

  return titles.slice(0, 5);
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateDescription(projectId) {
  const projectDir = getProjectDir(projectId);
  const analysisDir = path.join(projectDir, 'analysis');

  const transcriptionPath = path.join(analysisDir, 'transcription.json');
  if (!fs.existsSync(transcriptionPath)) {
    throw new Error(
      `Transcription not found for project ${projectId}.\n` +
      'Run transcription first: node bin/av-transcribe.js <project-id>',
    );
  }

  const transcription = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'));
  const segments = transcription.segments;

  // Load segments for block info
  let blocks = null;
  const segmentsPath = path.join(analysisDir, 'segments.json');
  if (fs.existsSync(segmentsPath)) {
    const segData = JSON.parse(fs.readFileSync(segmentsPath, 'utf8'));
    blocks = segData.blocks;
  }

  const keywords = extractKeywords(segments.map(s => s.text).join(' '));
  const topics = extractTopics(segments);
  const summary = generateSummary(segments);
  const titles = suggestTitles(keywords, topics, blocks);

  const description = {
    summary,
    topics,
    keywords: keywords.slice(0, 15),
    suggestedTitles: titles,
    wordCount: transcription.totalWords,
    language: transcription.language,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(analysisDir, 'description.json'),
    JSON.stringify(description, null, 2),
  );

  return description;
}

module.exports = {
  generateDescription,
  extractKeywords,
  extractTopics,
  generateSummary,
  suggestTitles,
  capitalize,
  STOP_WORDS,
};
