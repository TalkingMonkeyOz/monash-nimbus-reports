# Problem Statement - Monash Nimbus Reports

## The Problem

Monash University needs to generate specific operational reports from their Nimbus time-to-work database. Currently, there's no efficient way to:
- Track agreement deletions and identify who performed them
- Flag inappropriate activity code changes from timetable to non-timetable activities
- Identify shifts with person allocations but missing activity assignments

Manual data extraction is time-consuming and error-prone, making it difficult to maintain oversight of scheduling compliance.

## Current State

- Data exists in Nimbus time-to-work database (OData/REST API)
- No dedicated reporting tool for Monash-specific requirements
- Reports require manual database queries or exports
- No automated flagging of compliance concerns

## Desired State

- Standalone Windows desktop application (.exe)
- Three pre-configured reports with filtering and export capabilities
- Secure credential storage with environment switching
- Git-based distribution with controlled access
- Simple UX matching existing Nimbus MUI patterns

## Success Criteria

1. **Deleted Agreements Report** works with date range and shift filters
2. **Activities Report** flags TT to non-TT activity code changes
3. **Missing Activities Report** identifies shifts with allocation but no activity
4. All reports export to Excel and CSV formats
5. Application runs standalone without external dependencies
6. Credentials stored encrypted in local folder
7. Git-based update mechanism operational

## Constraints

- Read-only database access (no write operations)
- Must work in secured Windows environments
- Single executable deployment
- All file operations restricted to application folder

---

**Version**: 1.0
**Created**: 2026-01-20
**Updated**: 2026-01-20
**Location**: C:\Projects\monash-nimbus-reports\PROBLEM_STATEMENT.md
