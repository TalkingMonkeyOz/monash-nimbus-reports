# Nimbus Reports Improvement Plan

## Summary

Based on demo feedback and Audit/Change History Log document.

---

## Existing Report Fixes (Priority Order)

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Fix Excel export ("nothing happening") | HIGH | Pending |
| 2 | Add Nimbus hyperlinks to rows | HIGH | Pending |
| 3 | Add agreement details (ID, payroll#, dates) | HIGH | Pending |
| 4 | Data accuracy review | MEDIUM | Pending |
| 5 | Gap analysis vs validation doc | MEDIUM | Blocked |
| 6 | In-app update mechanism | LOW | Pending |

---

## New Reports Required

From Audit/Change History Log document:

| Report | Purpose | Research Needed |
|--------|---------|-----------------|
| **Change History** | Track allocation changes (who/what/when) | Find audit tables |
| **Timesheet Status** | Track submission/approval status | Find timesheet entities |

---

## Key Technical Discoveries

**Nimbus URL Pattern**:
```
{base_url}/Schedule/ScheduleGrid.aspx?ScheduleID={id}
```

**MCP Resources**: nimbus-knowledge (OData), mcp-nimbus-analysis (DB queries)

---

## Next Steps

1. Fix export (check Tauri capabilities)
2. Add hyperlinks (URL pattern known)
3. Research agreement/audit entities via nimbus-knowledge MCP

---

**Version**: 1.0 | **Created**: 2026-01-24
