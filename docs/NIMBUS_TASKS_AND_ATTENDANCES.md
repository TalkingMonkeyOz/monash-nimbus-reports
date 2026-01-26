# Nimbus Tasks, User Tasks, and Attendance System

This document explains the relationships between Tasks, Attendances, and Timesheets in the Nimbus system, with practical API navigation examples.

---

## Executive Summary

| Concept | Entity | OData | REST | Key Fields |
|---------|--------|-------|------|------------|
| Task Definition | `Task` | ❌ No | ✅ Yes | TaskID, TaskHours, Description |
| Attendance Activity | `ScheduleShiftAttendanceActivity` | ❌ No | ✅ Yes | **TaskID**, ScheduleShiftAttendanceID |
| Actual Attendance | `ScheduleShiftAttendance` | ✅ Yes | ✅ Yes | UserID, Hours, ApprovalStatus |
| Timesheet Approval | `ScheduleShiftAttendanceApproval` | ❌ No | ✅ Yes | Status, Hours, ApprovalLevel |

**CRITICAL FINDINGS:**
1. `Task` entity is **REST only** (`/RESTApi/Task`) - NOT available via OData
2. For **unscheduled tasks**, attendance links via `ScheduleShiftAttendanceActivity.TaskID`
3. `$expand` on OData returns 500 errors - navigation properties unavailable
4. Only **6 EntitySets** exposed via OData (see below)

---

## OData Endpoints (TWO Different APIs!)

Nimbus has **two separate OData endpoints** with different capabilities:

### 1. `/ODataApi` (Limited)

| EntitySet | Available | Notes |
|-----------|-----------|-------|
| ScheduleShiftAttendance | ✅ | Has `Task` nav property (but $expand fails) |
| ScheduleShift | ✅ | Shift definitions |
| Schedule | ✅ | Schedule definitions |
| Location | ✅ | Venues |
| User | ✅ | User records |
| Skill | ✅ | Skills |
| **ScheduleShiftAttendanceActivity** | ❌ 404 | Schema has TaskID but NOT queryable |

**Limitation:** $expand returns 500 errors.

### 2. `/CoreAPI/Odata` (Full - Preferred)

Hundreds of EntitySets available. Key ones for tasks:

| EntitySet | TaskID? | Use For |
|-----------|---------|---------|
| ScheduleShiftAttendanceActivity | ❌ **NO** | Activity records (no task link) |
| UserTask | ✅ **YES** | Task allocations to users |
| TaskApplies | ✅ **YES** | Task applicability rules |
| TaskType | ❌ | Task type definitions |
| ScheduleShiftAttendance | ❌ | Attendance records |

**Critical Finding:** `ScheduleShiftAttendanceActivity` in CoreAPI OData does NOT expose `TaskID` - it's missing from the schema entirely.

### 3. REST API (Required for TaskID)

| Endpoint | TaskID? | Use For |
|----------|---------|---------|
| `/RESTApi/ScheduleShiftAttendanceActivity` | ✅ **YES** | **ONLY source for Activity→Task link** |
| `/RESTApi/Task/{id}` | N/A | Task details, TaskHours budget |

### Comparison Table

| Entity | `/ODataApi` | `/CoreAPI/Odata` | REST | TaskID Available? |
|--------|-------------|------------------|------|-------------------|
| ScheduleShiftAttendanceActivity | ❌ 404 | ✅ (no TaskID) | ✅ | **REST only** |
| Task | ❌ 404 | ❌ 404 | ✅ | N/A (is the task) |
| UserTask | ❌ 404 | ✅ (has TaskID) | ? | OData ✅ |
| ScheduleShiftAttendance | ✅ | ✅ | ✅ | None have TaskID |

### When to Use OData

| Query Type | Use OData? | Reason |
|------------|------------|--------|
| List all attendances | ✅ Yes | Efficient, supports $filter, $top, $skip |
| Attendance by date range | ✅ Yes | Filter: `$filter=UserStartTime ge 2026-01-01` |
| Attendance by user | ✅ Yes | Filter: `$filter=UserID eq 12345` |
| Attendance by location | ✅ Yes | Filter: `$filter=LocationID eq 7911` |
| **Attendance by ScheduleID** | ✅ Yes | Filter: `$filter=ScheduleID eq 236457` |
| **Attendance by TaskID** | ❌ No | Must use REST → ScheduleShiftAttendanceActivity |
| **All tasks for schedule** | ❌ No | Must use REST → `/RESTApi/Task?schedule=236457` |
| **Task budget hours** | ❌ No | Must use REST → /RESTApi/Task/{id} |
| **Hours per task** | ❌ No | Must join REST data (Activity → Attendance) |

### OData Query Examples

**Use `/CoreAPI/Odata` for most queries** (more EntitySets):

```http
# All attendances for a date range (CoreAPI)
GET /CoreAPI/Odata/ScheduleShiftAttendance?$filter=UserStartTime ge 2026-01-01T00:00:00Z

# User task allocations (CoreAPI - has TaskID!)
GET /CoreAPI/Odata/UserTask?$filter=TaskID eq 24

# Attendance activities (CoreAPI - NO TaskID)
GET /CoreAPI/Odata/ScheduleShiftAttendanceActivity?$filter=ScheduleShiftAttendanceID eq 39

# Shifts with TT activities (either endpoint works)
GET /CoreAPI/Odata/ScheduleShift?$filter=startswith(ActivityDescription,'TT:')
```

**Use REST for Task→Activity link:**

```http
# Get activities WITH TaskID (REST only!)
GET /RESTApi/ScheduleShiftAttendanceActivity

# Get task budget hours
GET /RESTApi/Task/24
```

---

## Validated Relationship Chain (Unscheduled Tasks)

```
┌─────────────────────────────────────────────────────────────────┐
│                    TASK (REST API ONLY)                         │
│                   GET /RESTApi/Task/{id}                        │
├─────────────────────────────────────────────────────────────────┤
│  TaskID: 24                                                     │
│  Description: "jdvNewTaskUNsched"                               │
│  TaskHours: 35.0  ◄─── BUDGET HOURS                             │
│  TaskTypeDescription: "Marking"                                 │
│  ToBeScheduled: false  ◄─── UNSCHEDULED TASK                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ TaskID (link via activity)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│            SCHEDULE SHIFT ATTENDANCE ACTIVITY                   │
│        GET /RESTApi/ScheduleShiftAttendanceActivity             │
├─────────────────────────────────────────────────────────────────┤
│  ScheduleShiftAttendanceActivityID: 40                          │
│  TaskID: 24  ◄─── LINKS TO TASK                                 │
│  ScheduleShiftAttendanceID: 39  ◄─── LINKS TO ATTENDANCE        │
│  ActivityTypeID: 156 ("U: Marking")                             │
│  StartTime / FinishTime: actual activity times                  │
│  ScheduleShiftID: null  ◄─── NULL FOR UNSCHEDULED               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ ScheduleShiftAttendanceID
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               SCHEDULE SHIFT ATTENDANCE                         │
│           GET /RESTApi/ScheduleShiftAttendance/{id}             │
├─────────────────────────────────────────────────────────────────┤
│  ScheduleShiftAttendanceID: 39                                  │
│  UserID: 18566  ◄─── WHO SUBMITTED                              │
│  Forename: "Kate", Surname: "Tran"                              │
│  ScheduleID: 236457  ◄─── SCHEDULE (NOT SHIFT)                  │
│  ScheduleShiftID: 0  ◄─── NO SHIFT FOR UNSCHEDULED              │
│  Hours: 0.0 (calculated from activities)                        │
│  ApprovalStatus: 1 ("Pending")                                  │
│  UserStartTime / UserFinishTime: user-entered times             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ (1:many approvals)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│           SCHEDULE SHIFT ATTENDANCE APPROVAL                    │
│      (embedded in ScheduleShiftAttendance response)             │
├─────────────────────────────────────────────────────────────────┤
│  Status: 1 (Pending), 2 (Approved), 4 (Rejected)                │
│  ApprovalLevel: 1, 2, etc.                                      │
│  ConfirmedBy: approver UserID                                   │
│  Hours: approved hours                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Query Examples (Validated)

### 1. Get Task with Budget Hours

```http
GET /RESTApi/Task/24
Headers: UserID, AuthenticationToken, Accept: application/json
```

Response:
```json
{
  "Tasks": [{
    "TaskID": 24,
    "Description": "jdvNewTaskUNsched",
    "TaskHours": 35.0,
    "TaskTypeDescription": "Marking",
    "ToBeScheduled": false
  }]
}
```

### 2. Get All Attendance Activities (with TaskID)

```http
GET /RESTApi/ScheduleShiftAttendanceActivity
```

Response includes `TaskID` field - filter client-side for specific task.

### 3. Get Attendance Record by ID

```http
GET /RESTApi/ScheduleShiftAttendance/39
```

Returns user details, times, approval status.

### 4. Get All Attendance Records

```http
GET /RESTApi/ScheduleShiftAttendance
```

---

## Query Pattern: Hours Submitted Against a Task

To find all hours submitted against a specific task:

```python
# Step 1: Get all attendance activities
activities = GET /RESTApi/ScheduleShiftAttendanceActivity

# Step 2: Filter for TaskID
task_activities = [a for a in activities if a['TaskID'] == 24]

# Step 3: Get attendance details for each
for activity in task_activities:
    attendance = GET /RESTApi/ScheduleShiftAttendance/{activity['ScheduleShiftAttendanceID']}
    # attendance contains: UserID, Forename, Surname, ApprovalStatus, etc.
    # activity contains: StartTime, FinishTime (calculate hours from these)
```

---

## Key Fields Reference

### Task (REST: /RESTApi/Task)

| Field | Description |
|-------|-------------|
| TaskID | Primary key |
| **TaskHours** | Budget hours (e.g., 35.0) |
| Description | Task name |
| TaskTypeDescription | Category (e.g., "Marking") |
| ToBeScheduled | false = unscheduled task |
| StartAfter / CompleteBefore | Date range |

### ScheduleShiftAttendanceActivity (REST)

| Field | Description |
|-------|-------------|
| ScheduleShiftAttendanceActivityID | Primary key |
| **TaskID** | Links to Task |
| ScheduleShiftAttendanceID | Links to attendance |
| ActivityTypeID | Type of activity |
| StartTime / FinishTime | Actual worked times |
| ScheduleShiftID | null for unscheduled tasks |

### ScheduleShiftAttendance (REST)

| Field | Description |
|-------|-------------|
| ScheduleShiftAttendanceID | Primary key |
| UserID | Who submitted |
| Forename / Surname | User name |
| ScheduleID | Parent schedule |
| ApprovalStatus | 1=Pending, 2=Approved, 4=Rejected |
| UserStartTime / UserFinishTime | User-entered times |

---

## Hybrid Query Patterns (OData + REST)

### Pattern 0: Get All Tasks for a Schedule (KEY PATTERN)

**Goal**: Get all tasks with budget hours for a schedule.

```http
# REST - Get all tasks for schedule (includes TaskHours budget)
GET /RESTApi/Task?schedule=236457
```

This returns all tasks associated with that schedule including:
- `TaskID`, `TaskHours` (budget), `Description`, `TaskTypeDescription`

**Then join with OData for attendances:**

```python
# Step 1: REST - Get tasks with budget
tasks = GET /RESTApi/Task?schedule={schedule_id}

# Step 2: OData - Get attendances for schedule (has ScheduleID!)
attendances = GET /CoreAPI/Odata/ScheduleShiftAttendance?$filter=ScheduleID eq {schedule_id}

# Step 3: REST - Get activities with TaskID
activities = GET /RESTApi/ScheduleShiftAttendanceActivity
# Filter by ScheduleShiftAttendanceID from step 2
```

---

### Pattern 1: Report on Task Hours by User

**Goal**: For a task, show all users who submitted time and their hours.

```python
# Step 1: REST - Get task details (budget hours)
task = GET /RESTApi/Task/{task_id}
budget_hours = task['Tasks'][0]['TaskHours']

# Step 2: REST - Get all activities for this task
activities = GET /RESTApi/ScheduleShiftAttendanceActivity
task_activities = [a for a in activities if a['TaskID'] == task_id]

# Step 3: OData - Get attendance details (more efficient than REST for bulk)
attendance_ids = [a['ScheduleShiftAttendanceID'] for a in task_activities]
for att_id in attendance_ids:
    attendance = GET /ODataApi/ScheduleShiftAttendance?$filter=ScheduleShiftAttendanceID eq {att_id}
    # Has: UserID, Forename, Surname, ApprovalStatus
```

### Pattern 2: Report on Non-TT Activities (Report 2)

**Goal**: Flag ad-hoc fill-ins with non-TT activity codes.

```python
# Step 1: OData - Get shifts with non-TT activities
shifts = GET /ODataApi/ScheduleShift?$filter=not startswith(ActivityDescription,'TT:')

# Step 2: OData - Get attendances for these shifts
for shift in shifts:
    attendance = GET /ODataApi/ScheduleShiftAttendance?$filter=ScheduleShiftID eq {shift['ScheduleShiftID']}
    # Filter further for ad-hoc fill-ins based on business rules
```

### Pattern 3: Missing Activities Report (Report 3)

**Goal**: Shifts with person allocation but no activity.

```python
# Step 1: OData - Get all attendances with no shift activities
attendances = GET /ODataApi/ScheduleShiftAttendance?$filter=Hours eq 0

# Step 2: REST - Check if they have any activities
for att in attendances:
    activities = GET /RESTApi/ScheduleShiftAttendanceActivity
    has_activity = any(a['ScheduleShiftAttendanceID'] == att['ScheduleShiftAttendanceID'] for a in activities)
    if not has_activity:
        # Flag as missing activity
```

---

## Important Notes

1. **Task is REST-only** - No OData access to Task entity (both endpoints return 404)
2. **TaskID on activities is REST-only** - CoreAPI OData has the entity but NOT the TaskID field
3. **Two OData endpoints** - `/ODataApi` (limited) and `/CoreAPI/Odata` (full)
4. **$expand doesn't work** on `/ODataApi` - Returns 500 errors
5. **Unscheduled tasks** link via ScheduleShiftAttendanceActivity.TaskID (REST)
6. **ScheduleShiftID = null/0** for unscheduled task attendance
7. **Hours calculated** from activity StartTime/FinishTime, not stored directly

---

## OData Endpoint Comparison

| Aspect | `/ODataApi` | `/CoreAPI/Odata` |
|--------|-------------|------------------|
| EntitySets | 6 | Hundreds |
| $metadata EntityTypes | 51 | ~300+ |
| $expand support | ❌ 500 errors | Not tested |
| ScheduleShiftAttendanceActivity | ❌ 404 | ✅ (but no TaskID) |
| UserTask | ❌ 404 | ✅ (has TaskID) |
| Task | ❌ 404 | ❌ 404 |

**Recommendation:** Use `/CoreAPI/Odata` for bulk queries, REST for TaskID.

---


---

**Version**: 1.3
**Created**: 2026-01-22
**Updated**: 2026-01-22

