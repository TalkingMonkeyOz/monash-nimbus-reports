import { useState, useEffect } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  Container,
  Tab,
  Tabs,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import AssessmentIcon from "@mui/icons-material/Assessment";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import HelpIcon from "@mui/icons-material/Help";
import InfoIcon from "@mui/icons-material/Info";
import DeleteIcon from "@mui/icons-material/Delete";
import WarningIcon from "@mui/icons-material/Warning";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import WorkOffIcon from "@mui/icons-material/WorkOff";
import { getAppVersion } from "./core/versionService";
import UpdateNotification from "./components/UpdateNotification";
import ConnectionModule from "./components/ConnectionModule";
import ReportPreferences from "./components/ReportPreferences";
import DeletedAgreementsReport from "./components/reports/DeletedAgreementsReport";
import ActivitiesReport from "./components/reports/ActivitiesReport";
import MissingActivitiesReport from "./components/reports/MissingActivitiesReport";
import MissingJobRolesReport from "./components/reports/MissingJobRolesReport";
import ChangeHistoryReport from "./components/reports/ChangeHistoryReport";
import type { Profile, NimbusCredentials } from "./core/types";
import { useConnectionStore } from "./stores/connectionStore";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index} style={{ height: value === index ? "100%" : 0, display: value === index ? "flex" : "none", flexDirection: "column" }}>
      {value === index && <Box sx={{ py: 1, flex: 1, display: "flex", flexDirection: "column" }}>{children}</Box>}
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState(0); // 0 = Connections, 1 = Preferences
  const [isConnected, setIsConnected] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [credentials, setCredentials] = useState<NimbusCredentials | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("0.1.0");

  // Get current version on startup
  useEffect(() => {
    getAppVersion().then(setAppVersion);
  }, []);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleConnected = (creds: NimbusCredentials, profile: Profile) => {
    setCredentials(creds);
    setCurrentProfile(profile);
    setIsConnected(true);
    setShowSettings(false); // Go to reports after connecting

    // Sync to store for reports to access
    useConnectionStore.setState({
      isAuthenticated: true,
      session: {
        base_url: creds.baseUrl,
        auth_mode: creds.authMode,
        user_id: creds.userId,
        auth_token: creds.authToken,
        app_token: creds.appToken,
        username: creds.username,
      },
    });
  };

  const handleDisconnected = () => {
    setCredentials(null);
    setCurrentProfile(null);
    setIsConnected(false);

    // Clear store
    useConnectionStore.setState({
      isAuthenticated: false,
      session: null,
    });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar position="static">
        <Toolbar>
          <AssessmentIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Monash Nimbus Reports
          </Typography>

          {isConnected && currentProfile && (
            <>
              <Chip
                label={currentProfile.displayName}
                color={currentProfile.environment === "Production" ? "error" : "warning"}
                sx={{ mr: 2, color: "white", fontWeight: "bold" }}
              />
              <Tooltip title="Disconnect">
                <IconButton color="inherit" onClick={handleDisconnected}>
                  <LogoutIcon />
                </IconButton>
              </Tooltip>
            </>
          )}

          <Tooltip title="Help">
            <IconButton color="inherit" onClick={() => setHelpOpen(true)}>
              <HelpIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Connection Settings">
            <IconButton
              color="inherit"
              onClick={() => setShowSettings(!showSettings)}
              sx={{ ml: 1 }}
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>

          <Typography variant="caption" sx={{ ml: 2, opacity: 0.7 }}>
            v{appVersion}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ flex: 1, py: 1, px: 2, overflow: "auto" }}>
        <UpdateNotification checkDelay={5000} />
        {showSettings ? (
          <Box>
            <Paper sx={{ mb: 2 }}>
              <Tabs
                value={settingsTab}
                onChange={(_, v) => setSettingsTab(v)}
                indicatorColor="primary"
                textColor="primary"
              >
                <Tab label="Connections" />
                <Tab label="Report Preferences" disabled={!isConnected} />
              </Tabs>
            </Paper>
            {settingsTab === 0 ? (
              <ConnectionModule
                onConnected={handleConnected}
                onDisconnected={handleDisconnected}
                isConnected={isConnected}
                currentProfile={currentProfile}
                credentials={credentials}
              />
            ) : (
              <ReportPreferences />
            )}
          </Box>
        ) : !isConnected ? (
          <Paper sx={{ p: 4, textAlign: "center", mt: 4 }}>
            <Typography variant="h5" gutterBottom>
              Welcome to Monash Nimbus Reports
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Connect to a Nimbus server to access reports.
            </Typography>
            <Button
              variant="contained"
              size="large"
              startIcon={<SettingsIcon />}
              onClick={() => setShowSettings(true)}
            >
              Manage Connections
            </Button>
          </Paper>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Paper sx={{ mb: 1, flexShrink: 0 }}>
              <Tabs
                value={tabValue}
                onChange={handleTabChange}
                indicatorColor="primary"
                textColor="primary"
              >
                <Tab label="Deleted Agreements" />
                <Tab label="Activities (TT Changes)" />
                <Tab label="Missing Activities" />
                <Tab label="Missing Job Roles" />
                <Tab label="Change History" />
              </Tabs>
            </Paper>

            <Box sx={{ flex: 1, minHeight: 0 }}>
              <TabPanel value={tabValue} index={0}>
                <DeletedAgreementsReport />
              </TabPanel>
              <TabPanel value={tabValue} index={1}>
                <ActivitiesReport />
              </TabPanel>
              <TabPanel value={tabValue} index={2}>
                <MissingActivitiesReport />
              </TabPanel>
              <TabPanel value={tabValue} index={3}>
                <MissingJobRolesReport />
              </TabPanel>
              <TabPanel value={tabValue} index={4}>
                <ChangeHistoryReport />
              </TabPanel>
            </Box>
          </Box>
        )}
      </Container>

      {/* Help Dialog */}
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <HelpIcon color="primary" />
          Monash Nimbus Reports - Help
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="h6" gutterBottom>
            Report Descriptions
          </Typography>

          <List>
            <ListItem>
              <ListItemIcon>
                <DeleteIcon color="error" />
              </ListItemIcon>
              <ListItemText
                primary="Deleted Agreements Report"
                secondary={
                  <>
                    <strong>Problem it solves:</strong> "Why was this shift deleted? Who did it?" - Helps investigate unexpected deletions and identify patterns of incorrect data changes.
                    <br />
                    <strong>Criteria:</strong> All shifts marked as deleted within the date range.
                    <br />
                    <strong>Option:</strong> "Include empty shifts" also shows unallocated shifts (no person assigned).
                    <br />
                    <strong>Key fields:</strong> Modified By, Modified Date, Location, Schedule ID.
                  </>
                }
              />
            </ListItem>
            <Divider component="li" />

            <ListItem>
              <ListItemIcon>
                <WarningIcon color="warning" />
              </ListItemIcon>
              <ListItemText
                primary="Activities Report (TT Changes)"
                secondary={
                  <>
                    <strong>Problem it solves:</strong> "Has someone incorrectly changed a timetabled activity to a non-timetable activity?" - Catches inappropriate TT→non-TT changes that could affect payroll coding.
                    <br />
                    <strong>Criteria:</strong> Shifts with activities that lack the "TT:" prefix but have a Syllabus Plus code.
                    <br />
                    <strong>Flagged (red):</strong> Rows that need review - potential incorrect activity code changes.
                  </>
                }
              />
            </ListItem>
            <Divider component="li" />

            <ListItem>
              <ListItemIcon>
                <PersonOffIcon color="warning" />
              </ListItemIcon>
              <ListItemText
                primary="Missing Activities Report"
                secondary={
                  <>
                    <strong>Problem it solves:</strong> "Someone is allocated but what are they doing?" - Identifies incomplete allocations where a person is assigned but no activity is specified.
                    <br />
                    <strong>Criteria:</strong> Shifts with a person allocated but no activity type set.
                    <br />
                    <strong>Action needed:</strong> Assign the appropriate activity to complete the allocation.
                  </>
                }
              />
            </ListItem>
            <Divider component="li" />

            <ListItem>
              <ListItemIcon>
                <WorkOffIcon color="info" />
              </ListItemIcon>
              <ListItemText
                primary="Missing Job Roles Report"
                secondary={
                  <>
                    <strong>Problem it solves:</strong> "This shift doesn't have a job role - it may not cost correctly." - Finds configuration gaps that could affect payroll processing.
                    <br />
                    <strong>Criteria:</strong> Active shifts without a job role assigned.
                    <br />
                    <strong>Action needed:</strong> Assign the appropriate job role for correct costing.
                  </>
                }
              />
            </ListItem>
            <Divider component="li" />

            <ListItem>
              <ListItemIcon>
                <InfoIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary="Change History Report"
                secondary={
                  <>
                    <strong>Problem it solves:</strong> "Who changed this allocation and when?" - Tracks all modifications to shifts and allocations for audit purposes.
                    <br />
                    <strong>Criteria:</strong> All change records within the date range (based on change date, not shift date).
                    <br />
                    <strong>Use case:</strong> Investigate why an allocation was changed, who made the change, and when.
                  </>
                }
              />
            </ListItem>
          </List>

          <Divider sx={{ my: 2 }} />

          <Typography variant="h6" gutterBottom>
            How to Use
          </Typography>
          <Typography variant="body2" paragraph>
            1. <strong>Connect:</strong> Click the settings icon to configure and connect to a Nimbus server.
          </Typography>
          <Typography variant="body2" paragraph>
            2. <strong>Select dates:</strong> Use the date pickers to set your reporting period.
          </Typography>
          <Typography variant="body2" paragraph>
            3. <strong>Filter:</strong> Optionally select a location to narrow results.
          </Typography>
          <Typography variant="body2" paragraph>
            4. <strong>Search:</strong> Click "Search" to load data from Nimbus.
          </Typography>
          <Typography variant="body2" paragraph>
            5. <strong>Open in Nimbus:</strong> Click the arrow icon on any row to open that schedule directly in Nimbus.
          </Typography>
          <Typography variant="body2" paragraph>
            6. <strong>Export:</strong> Click "Export" to download the current filtered results as an Excel file.
          </Typography>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" color="text.secondary">
            <InfoIcon sx={{ fontSize: 16, verticalAlign: "middle", mr: 0.5 }} />
            Version {appVersion} • Built for Monash University
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

export default App;
