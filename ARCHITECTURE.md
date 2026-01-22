# Architecture - Monash Nimbus Reports

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Application                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              React Frontend (MUI 7)                  │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────────────┐  │   │
│  │  │Connection │ │  Report   │ │   Export/Filter   │  │   │
│  │  │ Selector  │ │  Viewer   │ │    Controls       │  │   │
│  │  └───────────┘ └───────────┘ └───────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Rust Backend (Tauri 2.0)               │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────────────┐  │   │
│  │  │ Nimbus    │ │ Encrypted │ │   Report Logic    │  │   │
│  │  │ OData API │ │ Keyring   │ │   & Filtering     │  │   │
│  │  └───────────┘ └───────────┘ └───────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Nimbus Time-to-Work   │
              │    (OData/REST API)    │
              │     [READ-ONLY]        │
              └────────────────────────┘
```

## Components

### Frontend (React + MUI 7)

| Component | Responsibility |
|-----------|----------------|
| ConnectionSelector | Dropdown for active connection + env switching |
| ReportViewer | Data grid with built-in filtering |
| ExportControls | Excel/CSV export buttons |
| FilterPanel | Date range, location, shift filters |

### Backend (Rust/Tauri)

| Component | Responsibility |
|-----------|----------------|
| NimbusApiClient | OData/REST API calls with session affinity |
| CredentialManager | Encrypted keyring storage |
| ReportEngine | Business logic for 3 report types |
| ExportService | Excel/CSV file generation |

## Data Flow

1. **Authentication**
   - User selects connection → Rust backend retrieves encrypted credentials
   - Backend authenticates with Nimbus (XML response)
   - Session cookie stored for subsequent requests

2. **Report Generation**
   - User sets filters → Frontend sends parameters to backend
   - Backend queries Nimbus OData API
   - Response parsed (flexible JSON format)
   - Data returned to frontend for grid display

3. **Export**
   - User clicks Export → Frontend requests export with current data
   - Backend generates Excel/CSV in app folder
   - File saved to user-accessible location

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, MUI 7, TypeScript |
| Backend | Tauri 2.0, Rust |
| API | OData/REST (Nimbus) |
| Storage | Encrypted keyring (local) |
| Export | xlsx-rs (Rust), CSV native |

## Key Patterns (from nimbus-mui)

1. **Session Affinity**: Use CookieContainer for Nimbus session persistence
2. **OData Parsing**: Handle flexible JSON response format (wrapped vs direct)
3. **Auth Flow**: XML response from authentication endpoint
4. **Connection Dropdown**: Single active connection with environment switching

## Security Model

- Credentials encrypted using OS keyring
- All writes restricted to app folder
- Read-only database access
- No sensitive data persistence outside encrypted storage

## Distribution

- Single .exe deployment
- Git-based updates with key authentication
- Version management and rollback support

---

**Version**: 1.0
**Created**: 2026-01-20
**Updated**: 2026-01-20
**Location**: C:\Projects\monash-nimbus-reports\ARCHITECTURE.md
