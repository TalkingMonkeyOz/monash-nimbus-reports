# Monash Nimbus Reports

**Type**: Application (Tauri + React)
**Status**: Planning
**Project ID**: `e61da6b5-0364-400b-9eb2-beff2f10d90f`
**Customer**: Monash University

---

## Problem Statement

Build a standalone Windows desktop application for Monash University to generate read-only reports from their Nimbus time-to-work database. The app must:
- Connect to Nimbus via OData/REST API (read-only)
- Generate 3 specific reports with filtering and export
- Store credentials securely (encrypted local storage)
- Distribute via controlled git-based mechanism

**Full requirements**: See `docs/REQUIREMENTS.md`

---

## Architecture

**Stack** (inherited from nimbus-mui):
- **Frontend**: React 19 + MUI 7 + TypeScript
- **Backend**: Tauri 2.0 + Rust
- **Data**: OData/REST API to Nimbus
- **Distribution**: Single .exe, git-based updates

**Key Patterns** (from nimbus-mui):
- Connection management with dropdown selector
- Session affinity with CookieContainer
- OData flexible JSON response parsing
- Encrypted credential storage (keyring)

---

## Reports

### 1. Deleted Agreements Report
- **Purpose**: Track agreement deletions and who performed them
- **Filters**: Date range, shift
- **Key fields**: Shift details, syllabus plus activity code, last updated by

### 2. Activities Report
- **Purpose**: Flag TT activity code changes to non-TT activities
- **Filters**: Date range, location, location group
- **Logic**: IF ad hoc fill-in AND activity lacks TT prefix → FLAG

### 3. Missing Activities Report
- **Purpose**: Identify shifts with person allocation but no activity
- **Filters**: Date range, location

---

## MCP Servers

| Server | Purpose |
|--------|---------|
| **nimbus-knowledge** | OData entities, code patterns, learnings |
| **mui** | MUI component documentation |
| postgres | Database access |
| orchestrator | Agent spawning, messaging |
| project-tools | Work tracking, knowledge |

**IMPORTANT**: Use `nimbus-knowledge` MCP before implementing ANY Nimbus API integration.

---

## Knowledge Sources

**ALWAYS check these before coding**:
1. `nimbus-knowledge.get_entity_schema(entity)` - OData entity structure
2. `nimbus-knowledge.get_code_pattern(keyword)` - Reusable patterns
3. `nimbus-knowledge.get_facts(category='api')` - API quirks and constraints
4. `nimbus-knowledge.get_learnings()` - Successes and failures

**Key Nimbus patterns** (already documented):
- Auth returns XML, not JSON
- Session affinity via CookieContainer
- OData response format varies (wrapped vs direct)
- REST User update requires Username field

---

## Related Projects

| Project | What to reference |
|---------|-------------------|
| **nimbus-mui** | Connection management, OData parsing, Tauri patterns |
| **nimbus-import** | Batch operations, entity creation order |

---

## Feature Tracking

**Feature**: F79 - Monash Nimbus Reports App
**Build Tasks**: BT267-BT274

Check ready tasks:
```sql
SELECT 'BT' || bt.short_code, bt.task_name, bt.status
FROM claude.build_tasks bt
WHERE bt.feature_id = '98fcaf7e-21a8-4f98-b195-f6f747adc8d5'
ORDER BY bt.step_order;
```

---

## Skills to Use

When planning or architecting, invoke these skills:
- `Plan Mode - Strategic Planning & Architecture`
- `Implementation Plan Generation Mode`
- `Senior Cloud Architect` (for diagrams, NFRs)
- `Expert React Frontend Engineer` (for components)

---

## Open Questions (Resolve Before Implementing)

| Question | Impact | Owner |
|----------|--------|-------|
| Exact field name for "syllabus plus activity code" | Reports 1-3 | Monash |
| User identity mapping for "last updated by" | Report 1 | Monash |
| Complete TT activity code prefix list | Report 2 | Monash |
| Location vs location group structure | Reports 2-3 | Monash |

---

## Coding Standards

- Use patterns from nimbus-mui (don't reinvent)
- All Nimbus API calls go through established patterns
- Encrypt all stored credentials
- Log API errors with context
- Export must support Excel AND CSV

---

**Version**: 1.0
**Created**: 2026-01-20
**Updated**: 2026-01-20
**Location**: C:\Projects\monash-nimbus-reports\CLAUDE.md
