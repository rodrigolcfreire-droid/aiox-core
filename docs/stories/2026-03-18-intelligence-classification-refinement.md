# Story: Intelligence Classification Refinement

**ID:** INTEL-1
**Status:** Done
**Created:** 2026-03-18
**Agent:** @dev

## Context

The Telegram and WhatsApp monitoring system currently classifies messages using naive regex pattern matching. Any message with "?" is flagged as a doubt, any "perdi" as a pain. This produces excessive noise and low-quality insights.

## Objective

Transform the classification engine from a **keyword matcher** into an **operational behavior analyzer** using a 3-filter pipeline: Intention, Context, Impact.

## Acceptance Criteria

- [x] AC1: Replace naive `classifyMessage()` with 3-filter pipeline (Intention → Context → Impact)
- [x] AC2: DUVIDAS — Only classify as doubt when there is clear operational intent (deposit, withdrawal, platform, strategy, access)
- [x] AC3: DORES — Only classify as pain when there is a real blocker, friction, or failure in the user journey
- [x] AC4: SUGESTOES — Only generate suggestions from validated patterns (threshold-based, 5+ min, 15+ high)
- [x] AC5: Add `OPERATIONAL_KEYWORDS` dictionary for context detection (70+ terms)
- [x] AC6: Add `NOISE_PATTERNS` to filter out casual/social messages
- [x] AC7: Both monitors (telegram + whatsapp) use the same shared classification module
- [x] AC8: Existing tests pass (7715), 25 new classification tests added
- [x] AC9: `npm run lint` passes with 0 warnings

## Out of Scope

- AI/LLM-based classification (future story)
- Changes to database schema
- Changes to report HTML format

## File List

- [x] `bin/lib/message-classifier.js` — NEW: Shared classification module (270 lines)
- [x] `bin/telegram-monitor.js` — MODIFIED: Import shared classifier, removed 80 lines of inline logic
- [x] `bin/whatsapp-monitor.js` — MODIFIED: Import shared classifier, removed 70 lines of inline logic
- [x] `tests/unit/message-classifier.test.js` — NEW: 25 tests covering all 3 filters
- [x] `docs/stories/2026-03-18-intelligence-classification-refinement.md` — Story file
