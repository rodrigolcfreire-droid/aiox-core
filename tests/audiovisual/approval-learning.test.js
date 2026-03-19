'use strict';

/**
 * Tests for Central Audiovisual — Approval & Learning (Phase 6)
 * Stories: AV-6.1, AV-6.2, AV-6.3
 */

const fs = require('fs');
const path = require('path');
const { approveCut, rejectCut, approveAll, getApprovalSummary, loadApprovals } = require('../../packages/audiovisual/lib/approval');
const { learnFromProject, getLearningInsights, analyzeCategoryPreferences, analyzeDurationPreferences } = require('../../packages/audiovisual/lib/learning');
const { generatePlaybook, loadPlaybook } = require('../../packages/audiovisual/lib/playbook');
const { createProjectStructure, getProjectDir, generateProjectId } = require('../../packages/audiovisual/lib/project');

let testProjectId;

beforeAll(() => {
  testProjectId = generateProjectId();
  createProjectStructure(testProjectId, 'Test Approval', 'upload', '/test.mp4');
  const projectDir = getProjectDir(testProjectId);

  const cuts = {
    suggestedCuts: [
      { id: 'cut_001', category: 'viral', status: 'suggested', engagementScore: 8.5, duration: 30, format: '9:16', platform: ['reels', 'tiktok'] },
      { id: 'cut_002', category: 'educativo', status: 'suggested', engagementScore: 7.2, duration: 45, format: '9:16', platform: ['reels'] },
      { id: 'cut_003', category: 'storytelling', status: 'suggested', engagementScore: 6.0, duration: 60, format: '16:9', platform: ['youtube'] },
      { id: 'cut_004', category: 'cta', status: 'suggested', engagementScore: 5.5, duration: 20, format: '9:16', platform: ['tiktok'] },
    ],
    totalSuggested: 4,
  };
  fs.mkdirSync(path.join(projectDir, 'cuts'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'cuts', 'suggested-cuts.json'), JSON.stringify(cuts, null, 2));
});

afterAll(() => {
  fs.rmSync(getProjectDir(testProjectId), { recursive: true, force: true });
});

// ── Approval ────────────────────────────────────────────────

describe('Approval Workflow', () => {
  test('approves a cut', () => {
    const result = approveCut(testProjectId, 'cut_001', 'Otimo corte!');
    expect(result.decision).toBe('approved');
    expect(result.cutId).toBe('cut_001');
  });

  test('rejects a cut', () => {
    const result = rejectCut(testProjectId, 'cut_004', 'Muito curto');
    expect(result.decision).toBe('rejected');
  });

  test('records decisions in approvals.json', () => {
    const approvals = loadApprovals(testProjectId);
    expect(approvals.decisions.length).toBe(2);
    expect(approvals.decisions[0].decision).toBe('approved');
    expect(approvals.decisions[1].decision).toBe('rejected');
  });

  test('gets approval summary', () => {
    const summary = getApprovalSummary(testProjectId);
    expect(summary.total).toBe(4);
    expect(summary.approved).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.pending).toBe(2);
  });

  test('approve-all approves remaining', () => {
    const results = approveAll(testProjectId);
    expect(results.length).toBe(2); // cut_002 and cut_003
    const summary = getApprovalSummary(testProjectId);
    expect(summary.approved).toBe(3);
    expect(summary.pending).toBe(0);
  });

  test('throws on missing cut', () => {
    expect(() => approveCut(testProjectId, 'cut_999')).toThrow('not found');
  });
});

// ── Learning ────────────────────────────────────────────────

describe('Learning Engine', () => {
  test('analyzes category preferences', () => {
    const decisions = [
      { category: 'viral', decision: 'approved' },
      { category: 'viral', decision: 'approved' },
      { category: 'cta', decision: 'rejected' },
    ];
    const patterns = analyzeCategoryPreferences(decisions);
    expect(patterns.length).toBe(2);
    const viral = patterns.find(p => p.category === 'viral');
    expect(viral.approvalRate).toBe(1.0);
  });

  test('analyzes duration preferences', () => {
    const decisions = [
      { decision: 'approved', duration: 30 },
      { decision: 'approved', duration: 40 },
      { decision: 'rejected', duration: 90 },
    ];
    const patterns = analyzeDurationPreferences(decisions);
    expect(patterns.length).toBe(1);
    expect(patterns[0].avgApprovedDuration).toBe(35);
  });

  test('learns from project decisions', () => {
    const learnings = learnFromProject(testProjectId);
    expect(learnings.patterns.length).toBeGreaterThan(0);
  });

  test('generates insights', () => {
    const insights = getLearningInsights(testProjectId);
    expect(insights.insights.length).toBeGreaterThan(0);
  });

  test('handles empty decisions', () => {
    const emptyId = generateProjectId();
    createProjectStructure(emptyId, 'Empty', 'upload', '/test.mp4');
    fs.mkdirSync(path.join(getProjectDir(emptyId), 'cuts'), { recursive: true });
    fs.writeFileSync(
      path.join(getProjectDir(emptyId), 'cuts', 'suggested-cuts.json'),
      JSON.stringify({ suggestedCuts: [] })
    );
    const result = learnFromProject(emptyId);
    expect(result.patterns).toHaveLength(0);
    fs.rmSync(getProjectDir(emptyId), { recursive: true, force: true });
  });
});

// ── Playbook ────────────────────────────────────────────────

describe('Playbook System', () => {
  test('generates playbook from learnings', () => {
    const pb = generatePlaybook(testProjectId);
    expect(pb.title).toContain('Test Approval');
    expect(pb.recommendations.length).toBeGreaterThan(0);
    expect(pb.templates.length).toBeGreaterThan(0);
  });

  test('loads saved playbook', () => {
    generatePlaybook(testProjectId);
    const pb = loadPlaybook(testProjectId);
    expect(pb).toBeTruthy();
    expect(pb.title).toContain('Test Approval');
  });

  test('returns null for missing playbook', () => {
    const emptyId = generateProjectId();
    createProjectStructure(emptyId, 'Empty', 'upload', '/test.mp4');
    expect(loadPlaybook(emptyId)).toBeNull();
    fs.rmSync(getProjectDir(emptyId), { recursive: true, force: true });
  });
});
