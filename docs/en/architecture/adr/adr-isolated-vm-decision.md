# ADR: isolated-vm macOS Compatibility

**Status:** Accepted
**Date:** 2026-01-04
**Story:** TD-6 - CI Stability & Test Coverage Improvements
**Author:** @devops (Gage)

## Context

During CI testing, we observed SIGSEGV crashes on macOS with Node.js 18.x and 20.x when using `isolated-vm`. This affects the CI matrix coverage.

## Investigation Findings

### Affected Configurations

| Platform    | Node Version | Status           |
| ----------- | ------------ | ---------------- |
| macOS ARM64 | 18.x         | ❌ SIGSEGV crash |
| macOS ARM64 | 20.x         | ❌ SIGSEGV crash |
| macOS ARM64 | 22.x         | ✅ Works         |
| macOS x64   | All          | ✅ Works         |
| Ubuntu      | All          | ✅ Works         |
| Windows     | All          | ✅ Works         |

### Root Cause

**GitHub Issue:** [laverdet/isolated-vm#424](https://github.com/laverdet/isolated-vm/issues/424) - "Segmentation fault on Node 20 macos arm64"

The issue is a known incompatibility between `isolated-vm` native bindings and Node.js ARM64 builds on macOS for versions 18.x and 20.x. The crash occurs during native module initialization.

### Current Version

- **Installed:** `isolated-vm@5.0.4`
- **Latest Available:** `isolated-vm@6.0.2`

## Decision

**Maintain current CI matrix exclusion** for macOS + Node 18/20.

### Rationale

1. **Low Impact:** macOS is not a production deployment target; it's only for developer workstations
2. **Node 22 Works:** Developers on macOS can use Node 22.x
3. **CI Coverage Acceptable:** 7/9 matrix combinations (78%) is sufficient
4. **Upgrade Risk:** v6.x is a major version with potential breaking changes
5. **Workaround is Non-Invasive:** Simple matrix exclusion in CI config

### Current Workaround (ci.yml)

```yaml
matrix:
  exclude:
    - os: macos-latest
      node: '18'
    - os: macos-latest
      node: '20'
```

## Alternatives Considered

| Option           | Effort | Risk   | Coverage | Decision            |
| ---------------- | ------ | ------ | -------- | ------------------- |
| Keep exclusion   | None   | Low    | 78%      | ✅ **Selected**     |
| Upgrade to v6.x  | Medium | Medium | 100%?    | ❌ Test first       |
| Replace with vm2 | High   | High   | 100%     | ❌ Breaking changes |
| Use Node.js vm   | Medium | Medium | 100%     | ❌ Less secure      |

## Future Actions

1. **Monitor:** Watch [isolated-vm#424](https://github.com/laverdet/isolated-vm/issues/424) for fixes
2. **Test v6.x:** When time permits, test `isolated-vm@6.0.2` on macOS ARM64
3. **Re-evaluate:** If v6.x fixes the issue, consider upgrade in future sprint

## Consequences

### Positive

- CI pipeline remains stable
- No code changes required
- Development workflow unaffected (Node 22 works)

### Negative

- 2 CI matrix combinations unavailable
- macOS developers must use Node 22.x for full compatibility

## References

- [isolated-vm#424 - Segmentation fault on Node 20 macos arm64](https://github.com/laverdet/isolated-vm/issues/424)
- [isolated-vm releases](https://github.com/laverdet/isolated-vm/releases)
- [Story TD-6](../../../docs/stories/v2.1/sprint-18/story-td-6-ci-stability.md)
