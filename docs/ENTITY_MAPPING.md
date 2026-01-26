# Entity Mapping - Nimbus OData Overview

## CRITICAL: API Limitations (Verified 2026-01-22)

### Two OData Endpoints Exist

| Endpoint | Response Format | Adhoc Fields | Notes |
|----------|-----------------|--------------|-------|
| `/ODataApi/{Entity}` | `{"@odata.context":"...","value":[...]}` | ❌ NOT returned | Legacy endpoint |
| `/CoreApi/OData/{Entity}` | `[...]` (raw array) | ✅ With $select | **USE THIS ONE** |

Both endpoints use same auth headers: `AuthenticationToken`, `UserID`, `Authorization: Bearer {token}`

**CRITICAL**: Only `/CoreApi/OData/` returns adhoc fields when using `$select`. The legacy `/ODataApi/` ignores adhoc fields entirely.

### Monash Environment Limitations (Verified 2026-01-22)

**OData query parameters are SILENTLY IGNORED on BOTH test-monash AND copy-monash:**
- `$filter` - Returns ALL records regardless of condition
- `$top=N` - Returns ALL records (4473 Locations returned for $top=5)
- `$count=true` - No @odata.count in response
- `$expand` - Returns null for expanded navigation properties
- `contains()`, `year()` - Silently ignored

**Tested on**:
- `test-monash.nimbus.cloud` - All filters ignored
- `copy-monash.nimbus.cloud` - `$filter=Description eq 'nimbus'` returned 5 records, not 1

**This is ENVIRONMENT-SPECIFIC** - official Nimbus training shows these features work.
Different Nimbus environments (prod, UAT) may behave differently.

**Workaround**: Fetch ALL records, filter client-side in app.

---

## Available OData Entity Sets

| Entity | Available | Notes |
|--------|-----------|-------|
| `ScheduleShift` | YES | Main data source (103 properties) |
| `Location` | YES | 69 properties |
| `User` | YES | With $expand=Leave works |
| `Schedule` | YES | |
| `ActivityType` | YES | Includes `OdataAdhocFields` array for SyllabusPlus |
| `ScheduleShiftAgreement` | ⚠️ | May 404 on some environments |

---

## Entity Relationships

```
Schedule (date ranges: ScheduleStart, ScheduleFinish)
    └── ScheduleShift (individual shifts)
            ├── ActivityTypeID → ActivityType (contains SyllabusPlus)
            └── JobRoleID → JobRole
```

---

## Key Fields on ScheduleShift (OData)

Core fields returned directly:

- `Description`, `StartTime`, `FinishTime`, `Hours`
- `Deleted`, `Active` (filters don't work!)
- `ActivityTypeID` - Links to ActivityType for SyllabusPlus
- `DepartmentID`, `ScheduleID`
- `UserID`, `JobRoleID`
- `UpdatedBy`, `Updated` - For tracking who modified

---

## Adhoc Fields (OData with $select, or REST API)

**Source of truth for field names**: `/CoreApi/Odata/AdhocFieldDefinition`

**CRITICAL FINDING (verified 2026-01-22)**:
- OData **without** `$select` → adhoc fields NOT returned
- OData **with** `$select=adhoc_SyllabusPlus,...` → adhoc fields ARE returned!
- REST API → Always returns all adhoc fields in AdhocFields array

**Example OData query with adhoc fields**:
```
/CoreApi/OData/ScheduleShift?$select=Id,Description,adhoc_SyllabusPlus,adhoc_UnitCode
```

### ScheduleShift Adhoc Fields (verified via SQL 2026-01-26)

**Total: 24 adhoc columns verified** via direct SQL query to `test-Nimbus_Monash`

| Field | Description | Sample Values |
|-------|-------------|---------------|
| `adhoc_SyllabusPlus` | **SyllabusPlus activity code** | `#SPLUS33DDFC-2026`, `#SPLUSB46664-2026` |
| `adhoc_UnitCode` | Unit/course code | |
| `adhoc_TeachingPeriod` | Teaching period | e.g., "S2", "T3-58" |
| `adhoc_ActivityGroup` | Activity group | e.g., "Workshop", "Seminar" |
| `adhoc_ActivityCode` | Activity code | |
| `adhoc_PartNumber` | Part number | e.g., "P1", "P2" |
| `adhoc_Duration` | Duration in hours | Decimal |
| `adhoc_ClassTimeTableID` | Timetable ID | |
| `adhoc_ClassTimeTableDescription` | Timetable description | |
| `adhoc_ClassTimetableName` | Timetable name | |
| `adhoc_VenueCode` | Venue code | |
| `adhoc_VenueName` | Venue name | |
| `adhoc_VenueDescription` | Venue description | |
| `adhoc_VenueID` | Venue ID | |
| `adhoc_OriginalDate` | Original date | |
| `adhoc_OriginalStartTime` | Original start time | |
| `adhoc_OriginalEndTime` | Original end time | |
| `adhoc_JTADetails` | JTA details | |
| `adhoc_AgreementList` | Agreement list | |
| `adhoc_IsDeleted` | Deletion flag | |
| `adhoc_RepeatCheck` | Repeat check | |
| `adhoc_RepeatIdentification` | Repeat ID | |
| `adhoc_IgnorePartNumber` | Ignore part number flag | |
| `adhoc_PartNumberOverRide` | Part number override | |

### ActivityType Adhoc Fields

| Field | Purpose |
|-------|---------|
| `adhoc_SyllabusPlusActivity` | SyllabusPlus activity type |
| `adhoc_TaskCode` | Task code |
| `adhoc1_GL Code` | GL code |

---

## SyllabusPlus Field (Corrected 2026-01-22)

**Field Name**: `adhoc_SyllabusPlus`
**Entity**: ScheduleShift (directly on shifts, NOT via ActivityType join!)
**Source**: AdhocFieldDefinition ID 36

**Also on ActivityType**: `adhoc_SyllabusPlusActivity` contains type values:
- Applied, Assessment, Laboratory, Lecture, Practical, Seminar, Studio, Tutorial, Workshop

**Usage for Reports**:
1. Fetch ScheduleShift data (OData or REST)
2. SyllabusPlus code is directly in `adhoc_SyllabusPlus` field on each shift
3. No ActivityType join needed for SyllabusPlus!

**How to access adhoc fields**: Query AdhocFieldDefinition to get field names, then access via entity's AdhocFields array in REST API responses.

---

## Related Documents

- [[API_FIELD_REFERENCE]] - Complete field reference
- [[REQUIREMENTS]] - Report requirements

---

**Version**: 8.1
**Created**: 2026-01-20
**Updated**: 2026-01-26
**Location**: docs/ENTITY_MAPPING.md
