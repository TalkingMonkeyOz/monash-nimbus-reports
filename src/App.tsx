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
  Alert,
  Snackbar,
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
import { APP_VERSION, checkForUpdates, VersionInfo } from "./core/versionService";
import ConnectionModule from "./components/ConnectionModule";
import DeletedAgreementsReport from "./components/reports/DeletedAgreementsReport";
import ActivitiesReport from "./components/reports/ActivitiesReport";
import MissingActivitiesReport from "./components/reports/MissingActivitiesReport";
import MissingJobRolesReport from "./components/reports/MissingJobRolesReport";
import type { Profile, NimbusCredentials } from "./core/types";
import { useConnectionStore } from "./stores/connectionStore";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [credentials, setCredentials] = useState<NimbusCredentials | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<VersionInfo | null>(null);
  const [updateSnackbarOpen, setUpdateSnackbarOpen] = useState(false);

  // Check for updates on startup
  useEffect(() => {
    checkForUpdates().then(({ hasUpdate, latestVersion }) => {
      if (hasUpdate && latestVersion) {
        setUpdateAvailable(latestVersion);
        setUpdateSnackbarOpen(true);
      }
    });
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
        user_id: creds.userId,
        auth_token: creds.authToken,
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
            v{APP_VERSION}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ flex: 1, py: 2, overflow: "auto" }}>
        {showSettings ? (
          <ConnectionModule
            onConnected={handleConnected}
            onDisconnected={handleDisconnected}
            isConnected={isConnected}
            currentProfile={currentProfile}
            credentials={credentials}
          />
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
          <>
            <Paper sx={{ mb: 2 }}>
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
              </Tabs>
            </Paper>

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
          </>
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
                    <strong>Purpose:</strong> Track agreement deletions and identify who performed them.
                    <br />
                    <strong>Criteria:</strong> Shows all shifts marked as deleted within the selected date range.
                    <br />
                    <strong>Option:</strong> Check "Include empty/unallocated shifts" to also show shifts with no person assigned.
                    <br />
                    <strong>Key fields:</strong> Status (Deleted/Empty), Modified By (username), Modified Date, Location.
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
                    <strong>Purpose:</strong> Flag inappropriate activity code changes from timetable to non-timetable activities.
                    <br />
                    <strong>Criteria:</strong> Shifts with ActivityType but missing Syllabus Plus code (TT activities should have this).
                    <br />
                    <strong>Flagged:</strong> Rows highlighted in red indicate potential TT→non-TT changes that need review.
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
                    <strong>Purpose:</strong> Identify shifts with person allocation but missing activity assignment.
                    <br />
                    <strong>Criteria:</strong> Shifts where UserID is set (person allocated) but ActivityTypeID is null.
                    <br />
                    <strong>Action:</strong> These shifts need an activity assigned to complete the allocation.
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
                    <strong>Purpose:</strong> Identify shifts that don't have a job role assigned.
                    <br />
                    <strong>Criteria:</strong> Active (non-deleted) shifts where JobRoleID is null.
                    <br />
                    <strong>Action:</strong> Assign appropriate job roles to complete shift configuration.
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
            1. <strong>Connect:</strong> Click the settings icon (⚙️) to configure and connect to a Nimbus server.
          </Typography>
          <Typography variant="body2" paragraph>
            2. <strong>Select dates:</strong> Use the date pickers to set your reporting period.
          </Typography>
          <Typography variant="body2" paragraph>
            3. <strong>Search:</strong> Click "Search" to load data from Nimbus.
          </Typography>
          <Typography variant="body2" paragraph>
            4. <strong>Export:</strong> Click "Export" to download results as an Excel file.
          </Typography>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" color="text.secondary">
            <InfoIcon sx={{ fontSize: 16, verticalAlign: "middle", mr: 0.5 }} />
            Version {APP_VERSION} • Built for Monash University
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Update Available Snackbar */}
      <Snackbar
        open={updateSnackbarOpen}
        autoHideDuration={10000}
        onClose={() => setUpdateSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setUpdateSnackbarOpen(false)}
          severity="info"
          variant="filled"
        >
          Update available: v{updateAvailable?.version}
          {updateAvailable?.downloadUrl && (
            <Button
              color="inherit"
              size="small"
              href={updateAvailable.downloadUrl}
              target="_blank"
              sx={{ ml: 1 }}
            >
              Download
            </Button>
          )}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default App;
