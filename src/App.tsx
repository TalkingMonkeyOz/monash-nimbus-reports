import { useState } from "react";
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
} from "@mui/material";
import AssessmentIcon from "@mui/icons-material/Assessment";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
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

          <Tooltip title="Connection Settings">
            <IconButton
              color="inherit"
              onClick={() => setShowSettings(!showSettings)}
              sx={{ ml: 1 }}
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>
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
    </Box>
  );
}

export default App;
