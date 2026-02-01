import { useState, useCallback, useEffect } from "react";
import {
  Paper,
  Typography,
  Alert,
  Chip,
  Box,
  Tooltip,
  FormControlLabel,
  Switch,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import DownloadIcon from "@mui/icons-material/Download";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonIcon from "@mui/icons-material/Person";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import WorkIcon from "@mui/icons-material/Work";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import DescriptionIcon from "@mui/icons-material/Description";
import StarIcon from "@mui/icons-material/Star";
import LoopIcon from "@mui/icons-material/Loop";
import SecurityIcon from "@mui/icons-material/Security";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportUATExtractExcel, UATSheetDefinition } from "../../core/export";
import {
  fetchUATExtract,
  checkUserSecurityRole,
  UATExtractData,
} from "../../hooks/useUATExtract";

// Security configuration - roles that can access this report
const ALLOWED_SECURITY_ROLES = ["monash super user", "payroll", "administrator"];

// Feature flag to disable security for testing
const SECURITY_ENABLED = false; // Set to true to enable security checks

export default function UATExtractReport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [extractData, setExtractData] = useState<UATExtractData | null>(null);

  const { session } = useConnectionStore();

  // Check security role on mount (if security is enabled)
  useEffect(() => {
    if (!session || !SECURITY_ENABLED) {
      // If security disabled, grant access
      if (!SECURITY_ENABLED) {
        setHasAccess(true);
      }
      return;
    }

    const checkAccess = async () => {
      setCheckingAccess(true);
      try {
        const sessionData = {
          base_url: session.base_url,
          auth_mode: session.auth_mode,
          user_id: session.user_id,
          auth_token: session.auth_token,
          app_token: session.app_token,
          username: session.username,
        };

        const result = await checkUserSecurityRole(sessionData, ALLOWED_SECURITY_ROLES);
        setHasAccess(result.hasAccess);
        setUserRoles(result.userRoles);
      } catch (err) {
        console.error("Failed to check security roles:", err);
        setHasAccess(false);
      } finally {
        setCheckingAccess(false);
      }
    };

    checkAccess();
  }, [session]);

  const handleExtract = useCallback(async () => {
    if (!session) {
      setError("Not connected. Please connect first.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatus("Starting UAT Extract...");

    try {
      const sessionData = {
        base_url: session.base_url,
        auth_mode: session.auth_mode,
        user_id: session.user_id,
        auth_token: session.auth_token,
        app_token: session.app_token,
        username: session.username,
      };

      const data = await fetchUATExtract({
        session: sessionData,
        activeOnly,
        onProgress: setStatus,
      });

      setExtractData(data);
      setStatus(
        `Loaded: ${data.users.length} users, ${data.userLocations.length} locations, ` +
          `${data.userJobRoles.length} job roles, ${data.userSecurityRoles.length} security roles`
      );
    } catch (err) {
      console.error("Extract failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to extract data");
    } finally {
      setLoading(false);
    }
  }, [session, activeOnly]);

  const handleExport = useCallback(async () => {
    if (!extractData) {
      setError("No data to export. Run extract first.");
      return;
    }

    setStatus("Exporting to Excel...");

    // Build the 12 sheets with Payroll linking for hyperlink navigation
    const sheets: UATSheetDefinition[] = [
      // 1. Staff Profile
      {
        name: "Staff Profile",
        data: extractData.users.map((u) => ({
          Id: u.Id,
          Username: u.Username,
          Forename: u.Forename,
          Surname: u.Surname,
          FullName: `${u.Forename || ""} ${u.Surname || ""}`.trim(),
          Payroll: u.Payroll,
          Email: u.Email,
          Phone: u.Phone,
          DateOfBirth: u.DateOfBirth,
          StartDate: u.StartDate,
          FinishDate: u.FinishDate,
          Active: u.Active,
          Rosterable: u.Rosterable,
        })),
        columns: [
          { field: "Id", headerName: "ID" },
          { field: "Username", headerName: "Username" },
          { field: "Forename", headerName: "Forename" },
          { field: "Surname", headerName: "Surname" },
          { field: "FullName", headerName: "Full Name" },
          { field: "Payroll", headerName: "Payroll" },
          { field: "Email", headerName: "Email" },
          { field: "Phone", headerName: "Phone" },
          { field: "DateOfBirth", headerName: "DOB" },
          { field: "StartDate", headerName: "Start Date" },
          { field: "FinishDate", headerName: "Finish Date" },
          { field: "Active", headerName: "Active" },
          { field: "Rosterable", headerName: "Rosterable" },
        ],
      },

      // 2. Location
      {
        name: "Location",
        data: extractData.userLocations.map((ul) => ({
          Payroll: ul.UserObject?.Payroll || "",
          UserID: ul.UserID,
          LocationID: ul.LocationID,
          Location: ul.Location?.Description || "",
          Active: ul.Active,
        })),
        columns: [
          { field: "Payroll", headerName: "Payroll" },
          { field: "UserID", headerName: "User ID" },
          { field: "LocationID", headerName: "Location ID" },
          { field: "Location", headerName: "Location" },
          { field: "Active", headerName: "Active" },
        ],
        linkField: "Payroll",
      },

      // 3. Employment Hours
      {
        name: "Employment Hours",
        data: extractData.userHours.map((uh) => ({
          Payroll: uh.UserObject?.Payroll || "",
          UserID: uh.UserID,
          Hours: uh.Hours,
          HoursType: uh.HoursType,
          EffectiveDate: uh.EffectiveDate,
          Active: uh.Active,
        })),
        columns: [
          { field: "Payroll", headerName: "Payroll" },
          { field: "UserID", headerName: "User ID" },
          { field: "Hours", headerName: "Hours" },
          { field: "HoursType", headerName: "Hours Type" },
          { field: "EffectiveDate", headerName: "Effective Date" },
          { field: "Active", headerName: "Active" },
        ],
        linkField: "Payroll",
      },

      // 4. Employment Type
      {
        name: "Employment Type",
        data: extractData.userEmployments.map((ue) => ({
          Payroll: ue.UserObject?.Payroll || "",
          UserID: ue.UserID,
          EmploymentTypeID: ue.EmploymentTypeID,
          EmploymentType: ue.EmploymentType?.Description || "",
          EffectiveDate: ue.EffectiveDate,
          Active: ue.Active,
        })),
        columns: [
          { field: "Payroll", headerName: "Payroll" },
          { field: "UserID", headerName: "User ID" },
          { field: "EmploymentTypeID", headerName: "Type ID" },
          { field: "EmploymentType", headerName: "Employment Type" },
          { field: "EffectiveDate", headerName: "Effective Date" },
          { field: "Active", headerName: "Active" },
        ],
        linkField: "Payroll",
      },

      // 5. Role (Job Roles)
      {
        name: "Role",
        data: extractData.userJobRoles.map((ujr) => ({
          Payroll: ujr.UserObject?.Payroll || "",
          UserID: ujr.UserID,
          JobRoleID: ujr.JobRoleID,
          JobRole: ujr.JobRole?.Description || "",
          DefaultRole: ujr.DefaultRole,
          Active: ujr.Active,
        })),
        columns: [
          { field: "Payroll", headerName: "Payroll" },
          { field: "UserID", headerName: "User ID" },
          { field: "JobRoleID", headerName: "Job Role ID" },
          { field: "JobRole", headerName: "Job Role" },
          { field: "DefaultRole", headerName: "Default" },
          { field: "Active", headerName: "Active" },
        ],
        linkField: "Payroll",
      },

      // 6. Pay
      {
        name: "Pay",
        data: extractData.userPayRates.map((upr) => ({
          Payroll: upr.UserObject?.Payroll || "",
          UserID: upr.UserID,
          PayRateID: upr.PayRateID,
          PayRateName: upr.PayRateObject?.Description || "",
          HourlyRate: upr.PayRate,
          EffectiveDate: upr.EffectiveDate,
          Active: upr.Active,
        })),
        columns: [
          { field: "Payroll", headerName: "Payroll" },
          { field: "UserID", headerName: "User ID" },
          { field: "PayRateID", headerName: "Pay Rate ID" },
          { field: "PayRateName", headerName: "Pay Rate" },
          { field: "HourlyRate", headerName: "Hourly Rate" },
          { field: "EffectiveDate", headerName: "Effective Date" },
          { field: "Active", headerName: "Active" },
        ],
        linkField: "Payroll",
      },

      // 7. Variation
      {
        name: "Variation",
        data: extractData.userPayRateVariations.map((uprv) => ({
          Payroll: uprv.UserObject?.Payroll || "",
          UserID: uprv.UserID,
          Award: uprv.AwardObject?.Description || "",
          VariationPayRate: uprv.PayRate,
          JobRole: uprv.JobRoleObject?.Description || "",
          EffectiveDate: uprv.EffectiveDate,
          Active: uprv.Active,
        })),
        columns: [
          { field: "Payroll", headerName: "Payroll" },
          { field: "UserID", headerName: "User ID" },
          { field: "Award", headerName: "Award" },
          { field: "VariationPayRate", headerName: "Pay Rate" },
          { field: "JobRole", headerName: "Job Role" },
          { field: "EffectiveDate", headerName: "Effective Date" },
          { field: "Active", headerName: "Active" },
        ],
        linkField: "Payroll",
      },

      // 8. Agreements
      {
        name: "Agreements",
        data: extractData.userAgreements.map((ua) => ({
          Payroll: ua.UserObject?.Payroll || "",
          UserID: ua.UserID,
          AgreementID: ua.AgreementID,
          Agreement: ua.Agreement?.Description || "",
          EffectiveDate: ua.EffectiveDate,
          Active: ua.Active,
        })),
        columns: [
          { field: "Payroll", headerName: "Payroll" },
          { field: "UserID", headerName: "User ID" },
          { field: "AgreementID", headerName: "Agreement ID" },
          { field: "Agreement", headerName: "Agreement" },
          { field: "EffectiveDate", headerName: "Effective Date" },
          { field: "Active", headerName: "Active" },
        ],
        linkField: "Payroll",
      },

      // 9. Skill
      {
        name: "Skill",
        data: extractData.userSkills.map((us) => ({
          Payroll: us.UserObject?.Payroll || "",
          UserID: us.UserID,
          SkillID: us.SkillID,
          Skill: us.Skill?.Description || "",
          Active: us.Active,
        })),
        columns: [
          { field: "Payroll", headerName: "Payroll" },
          { field: "UserID", headerName: "User ID" },
          { field: "SkillID", headerName: "Skill ID" },
          { field: "Skill", headerName: "Skill" },
          { field: "Active", headerName: "Active" },
        ],
        linkField: "Payroll",
      },

      // 10. Cycle
      {
        name: "Cycle",
        data: extractData.userCycles.map((uc) => ({
          Payroll: uc.UserObject?.Payroll || "",
          UserID: uc.UserID,
          CycleID: uc.CycleID,
          Cycle: uc.CycleObject?.Description || "",
          DaysInCycle: uc.CycleObject?.DaysInCycle || 0,
          EffectiveDate: uc.EffectiveDate,
          Active: uc.Active,
        })),
        columns: [
          { field: "Payroll", headerName: "Payroll" },
          { field: "UserID", headerName: "User ID" },
          { field: "CycleID", headerName: "Cycle ID" },
          { field: "Cycle", headerName: "Cycle" },
          { field: "DaysInCycle", headerName: "Days In Cycle" },
          { field: "EffectiveDate", headerName: "Effective Date" },
          { field: "Active", headerName: "Active" },
        ],
        linkField: "Payroll",
      },

      // 11. Cycle Details - simplified (CycleDay data would need separate query)
      {
        name: "Cycle Details",
        data: extractData.userCycles.map((uc) => ({
          Payroll: uc.UserObject?.Payroll || "",
          UserID: uc.UserID,
          CycleID: uc.CycleID,
          Cycle: uc.CycleObject?.Description || "",
          DaysInCycle: uc.CycleObject?.DaysInCycle || 0,
        })),
        columns: [
          { field: "Payroll", headerName: "Payroll" },
          { field: "UserID", headerName: "User ID" },
          { field: "CycleID", headerName: "Cycle ID" },
          { field: "Cycle", headerName: "Cycle" },
          { field: "DaysInCycle", headerName: "Days In Cycle" },
        ],
        linkField: "Payroll",
      },

      // 12. Security
      {
        name: "Security",
        data: extractData.userSecurityRoles.map((usr) => ({
          Payroll: usr.UserObject?.Payroll || "",
          UserID: usr.UserID,
          SecurityRoleID: usr.SecurityRoleID,
          SecurityRole: usr.SecurityRole?.Description || "",
          LocationID: usr.LocationID,
          Location: usr.LocationObject?.Description || "",
          LocationGroupID: usr.LocationGroupID,
          LocationGroup: usr.LocationGroupObject?.Description || "",
          Active: usr.Active,
        })),
        columns: [
          { field: "Payroll", headerName: "Payroll" },
          { field: "UserID", headerName: "User ID" },
          { field: "SecurityRoleID", headerName: "Role ID" },
          { field: "SecurityRole", headerName: "Security Role" },
          { field: "LocationID", headerName: "Location ID" },
          { field: "Location", headerName: "Location" },
          { field: "LocationGroupID", headerName: "Loc Group ID" },
          { field: "LocationGroup", headerName: "Location Group" },
          { field: "Active", headerName: "Active" },
        ],
        linkField: "Payroll",
      },
    ];

    const result = await exportUATExtractExcel(sheets, "UAT_Extract");
    if (result.success) {
      setStatus(result.message);
    } else {
      setError(result.message);
    }
  }, [extractData]);

  // Show access denied if security is enabled and user doesn't have access
  if (SECURITY_ENABLED && hasAccess === false) {
    return (
      <Paper sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <LockIcon sx={{ fontSize: 64, color: "error.main", mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          Access Denied
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2, textAlign: "center" }}>
          You do not have permission to access the UAT Extract Report.
          <br />
          Required roles: {ALLOWED_SECURITY_ROLES.join(", ")}
        </Typography>
        {userRoles.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            Your roles: {userRoles.join(", ")}
          </Typography>
        )}
      </Paper>
    );
  }

  // Show loading while checking access
  if (SECURITY_ENABLED && checkingAccess) {
    return (
      <Paper sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress sx={{ mb: 2 }} />
        <Typography>Checking access permissions...</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="h6">UAT Extract Report</Typography>
        <Tooltip
          title={
            <>
              <strong>Purpose:</strong> Export comprehensive user data for UAT/testing.
              <br /><br />
              Creates a 12-sheet Excel workbook with:
              <br />• Staff Profile, Location, Hours, Employment
              <br />• Job Roles, Pay Rates, Variations
              <br />• Agreements, Skills, Cycles, Security Roles
              <br /><br />
              <strong>Note:</strong> This report contains sensitive data.
            </>
          }
          arrow
        >
          <HelpOutlineIcon fontSize="small" color="action" sx={{ cursor: "help" }} />
        </Tooltip>
        <Chip
          icon={SECURITY_ENABLED ? <LockIcon /> : <LockOpenIcon />}
          label={SECURITY_ENABLED ? "Secured" : "Security Disabled"}
          color={SECURITY_ENABLED ? "success" : "warning"}
          size="small"
          variant="outlined"
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {status || "Export comprehensive user data across 12 sheets."}
      </Typography>

      <Box sx={{ mb: 2, display: "flex", gap: 2, alignItems: "center" }}>
        <FormControlLabel
          control={
            <Switch
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              size="small"
            />
          }
          label="Active records only"
        />
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
          onClick={extractData ? handleExport : handleExtract}
          disabled={loading}
        >
          {extractData ? "Export to Excel" : "Extract Data"}
        </Button>
        {extractData && (
          <Button
            variant="outlined"
            onClick={handleExtract}
            disabled={loading}
          >
            Re-extract
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Data summary */}
      {extractData && (
        <Paper variant="outlined" sx={{ p: 2, flex: 1, overflow: "auto" }}>
          <Typography variant="subtitle1" gutterBottom>
            <CheckCircleIcon color="success" sx={{ verticalAlign: "middle", mr: 1 }} />
            Data Extracted Successfully
          </Typography>
          <List dense>
            <ListItem>
              <ListItemIcon><PersonIcon /></ListItemIcon>
              <ListItemText primary="Staff Profile" secondary={`${extractData.users.length} users`} />
            </ListItem>
            <ListItem>
              <ListItemIcon><LocationOnIcon /></ListItemIcon>
              <ListItemText primary="Location" secondary={`${extractData.userLocations.length} assignments`} />
            </ListItem>
            <ListItem>
              <ListItemIcon><AccessTimeIcon /></ListItemIcon>
              <ListItemText primary="Employment Hours" secondary={`${extractData.userHours.length} records`} />
            </ListItem>
            <ListItem>
              <ListItemIcon><WorkIcon /></ListItemIcon>
              <ListItemText primary="Employment Type" secondary={`${extractData.userEmployments.length} records`} />
            </ListItem>
            <ListItem>
              <ListItemIcon><WorkIcon /></ListItemIcon>
              <ListItemText primary="Job Roles" secondary={`${extractData.userJobRoles.length} roles`} />
            </ListItem>
            <ListItem>
              <ListItemIcon><AttachMoneyIcon /></ListItemIcon>
              <ListItemText primary="Pay Rates" secondary={`${extractData.userPayRates.length} rates`} />
            </ListItem>
            <ListItem>
              <ListItemIcon><AttachMoneyIcon /></ListItemIcon>
              <ListItemText primary="Pay Variations" secondary={`${extractData.userPayRateVariations.length} variations`} />
            </ListItem>
            <ListItem>
              <ListItemIcon><DescriptionIcon /></ListItemIcon>
              <ListItemText primary="Agreements" secondary={`${extractData.userAgreements.length} agreements`} />
            </ListItem>
            <ListItem>
              <ListItemIcon><StarIcon /></ListItemIcon>
              <ListItemText primary="Skills" secondary={`${extractData.userSkills.length} skills`} />
            </ListItem>
            <ListItem>
              <ListItemIcon><LoopIcon /></ListItemIcon>
              <ListItemText primary="Cycles" secondary={`${extractData.userCycles.length} cycles`} />
            </ListItem>
            <ListItem>
              <ListItemIcon><SecurityIcon /></ListItemIcon>
              <ListItemText primary="Security Roles" secondary={`${extractData.userSecurityRoles.length} roles`} />
            </ListItem>
          </List>
        </Paper>
      )}

      {/* Instructions when no data */}
      {!extractData && !loading && (
        <Paper variant="outlined" sx={{ p: 3, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <DownloadIcon sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Ready to Extract
          </Typography>
          <Typography color="text.secondary" textAlign="center">
            Click "Extract Data" to fetch user data from Nimbus.
            <br />
            Once complete, click "Export to Excel" to download.
          </Typography>
        </Paper>
      )}
    </Paper>
  );
}
