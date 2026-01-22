# Nimbus API Field Reference

## ScheduleShift OData Fields (Verified 2026-01-21)

### Core Fields
| Field | Type | Example |
|-------|------|---------|
| `ScheduleShiftID` | Int64 | 200059 |
| `Description` | String | "17/11/25 // BFB1001 // Tutorial" |
| `StartTime` | DateTime | "2025-11-17T08:00:00Z" |
| `FinishTime` | DateTime | "2025-11-17T08:30:00Z" |
| `Hours` | Decimal | 0.5 |
| `Deleted` | Boolean | false |
| `Active` | Boolean | true |

### User Fields (Flattened)
| Field | Type | Notes |
|-------|------|-------|
| `UserID` | Int64 | |
| `Forename` | String | Directly on shift |
| `Surname` | String | Directly on shift |
| `Username` | String | Email address |

### Activity Fields (Flattened)
| Field | Type | Notes |
|-------|------|-------|
| `ActivityTypeID` | Int64 | For REST lookup |
| `ActivityDescription` | String | e.g., "TT: Tutorial" |

### Location Fields (Flattened)
| Field | Type | Notes |
|-------|------|-------|
| `LocationID` | Int64 | |
| `LocationName` | String | e.g., "BFB1001" |
| `DepartmentID` | Int64 | |
| `DepartmentDescription` | String | |

### Job Role Fields (Flattened)
| Field | Type | Notes |
|-------|------|-------|
| `JobRoleID` | Int64 | |
| `JobRoleDescription` | String | e.g., "Sessional" |

---

## ActivityType REST Fields

**Endpoint**: `GET /RESTApi/ActivityType`

### Adhoc Fields on ActivityType
| FieldName | DisplayName |
|-----------|-------------|
| `adhoc_SyllabusPlusActivity` | SyllabusPlusActivity |
| `adhoc_TaskCode` | TaskCode |
| `adhoc1_GL Code` | GL Code |

### TT Activity Types (Verified)
| ID | Description | SyllabusPlus |
|----|-------------|--------------|
| 135 | TT: Applied Class | Applied |
| 136 | TT: Assessment | Assessment |
| 137 | TT: Practical | Practical |
| 138 | TT: Laboratory | Laboratory |
| 139 | TT: Lecture | Lecture |
| 140 | TT: Seminar | Seminar |
| 141 | TT: Workshop | Workshop |
| 142 | TT: Studio | Studio |
| 143 | TT: Tutorial | Tutorial |

---

## SyllabusPlus Lookup Pattern

```typescript
// Cache ActivityTypes from REST API
const activityTypes = await fetch('/RESTApi/ActivityType');
const lookup = new Map<number, string>();

for (const at of activityTypes.ActivityTypes) {
  const field = at.AdhocFields?.find(
    f => f.FieldName === 'adhoc_SyllabusPlusActivity'
  );
  lookup.set(at.ActivityTypeID, field?._Value || '');
}

// Use: lookup.get(shift.ActivityTypeID)
```

---

**Version**: 1.0
**Created**: 2026-01-21
**Updated**: 2026-01-21
**Location**: docs/API_FIELD_REFERENCE.md
