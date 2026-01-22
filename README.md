# Monash Nimbus Reports

A standalone Windows desktop application for generating read-only reports from the Nimbus time-to-work database.

## Overview

Built for Monash University to provide operational reporting capabilities including:

- **Deleted Agreements Report** - Track agreement deletions and who performed them
- **Activities Report** - Flag inappropriate TT to non-TT activity code changes
- **Missing Activities Report** - Identify shifts with allocations but no activity

## Tech Stack

- **Frontend**: React 19 + MUI 7 + TypeScript
- **Backend**: Tauri 2.0 + Rust
- **Data**: Nimbus OData/REST API (read-only)

## Project Structure

```
monash-nimbus-reports/
├── src/                  # Source code
│   ├── src/             # React frontend
│   └── src-tauri/       # Rust backend
├── docs/                # Documentation
│   └── REQUIREMENTS.md  # Full requirements spec
├── CLAUDE.md            # AI assistant instructions
├── PROBLEM_STATEMENT.md # Problem definition
├── ARCHITECTURE.md      # System design
└── .mcp.json           # MCP server config
```

## Development

### Prerequisites

- Node.js 20+
- Rust toolchain
- Tauri CLI

### Setup

```bash
# Install dependencies
npm install

# Run in development
npm run tauri dev

# Build for production
npm run tauri build
```

## Reports

### 1. Deleted Agreements Report

Filter by date range and shift to view:
- Shift details (description, date, times)
- Syllabus plus activity code
- Last updated by (user identity)
- Agreement deletion status

### 2. Activities Report

Filter by date range and location to flag:
- Shifts with ad hoc fill-ins
- TT activity codes changed to non-TT
- Original vs current activity codes

### 3. Missing Activities Report

Filter by date range and location to find:
- Shifts with person allocation
- Missing activity assignments

## Related Projects

- [nimbus-mui](../nimbus-mui) - Core Nimbus patterns, connection management
- [nimbus-import](../nimbus-import) - Batch operations, entity creation order

## License

Proprietary - Monash University

---

**Version**: 1.0
**Created**: 2026-01-20
**Updated**: 2026-01-20
