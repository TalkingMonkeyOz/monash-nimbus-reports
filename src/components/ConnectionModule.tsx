/**
 * Connection Module
 * Full CRUD for managing Nimbus connections with test connection support
 */

import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  Divider,
  Stack,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";

import { ProfileManager } from "../core/profileManager";
import { AuthService } from "../core/authService";
import type { Profile, NimbusCredentials, AuthMode } from "../core/types";

interface ConnectionModuleProps {
  onConnected: (credentials: NimbusCredentials, profile: Profile) => void;
  onDisconnected: () => void;
  isConnected: boolean;
  currentProfile: Profile | null;
  credentials: NimbusCredentials | null;
}

export default function ConnectionModule({
  onConnected,
  onDisconnected,
  isConnected,
  currentProfile,
  credentials,
}: ConnectionModuleProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [loginMode, setLoginMode] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formEnvironment, setFormEnvironment] = useState<"UAT" | "Production">("UAT");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formAuthMode, setFormAuthMode] = useState<AuthMode>("apptoken");
  // Credential-based auth
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  // App Token auth
  const [formAppToken, setFormAppToken] = useState("");
  const [formAppUsername, setFormAppUsername] = useState("");
  // Common
  const [formSaveCredentials, setFormSaveCredentials] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = () => {
    setProfiles(ProfileManager.loadProfiles());
  };

  const handleNewProfile = () => {
    setEditingProfile(null);
    setLoginMode(false);
    setFormName("");
    setFormDisplayName("");
    setFormEnvironment("UAT");
    setFormBaseUrl("");
    setFormAuthMode("apptoken");
    setFormUsername("");
    setFormPassword("");
    setFormAppToken("");
    setFormAppUsername("");
    setFormSaveCredentials(true);
    setFormError(null);
    setTestSuccess(null);
    setShowDialog(true);
  };

  const handleEditProfile = async (profile: Profile) => {
    const authMode = profile.authMode || "apptoken";
    setEditingProfile(profile);
    setLoginMode(false);
    setFormName(profile.name);
    setFormDisplayName(profile.displayName);
    setFormEnvironment(profile.environment);
    setFormBaseUrl(profile.baseUrl);
    setFormAuthMode(authMode);
    setFormSaveCredentials(true);
    setFormError(null);
    setTestSuccess(null);

    // Reset all credential fields
    setFormUsername("");
    setFormPassword("");
    setFormAppToken("");
    setFormAppUsername("");

    if (profile.hasStoredCredentials) {
      if (authMode === "apptoken") {
        const saved = await AuthService.loadAppTokenCredentials(profile.name);
        if (saved) {
          setFormAppToken(saved.appToken);
          setFormAppUsername(saved.username);
        }
      } else {
        const saved = await AuthService.loadLoginCredentials(profile.name);
        if (saved) {
          setFormUsername(saved.username);
          setFormPassword(saved.password);
        }
      }
    }

    setShowDialog(true);
  };

  const handleDeleteProfile = async (profileName: string) => {
    if (!confirm(`Delete profile "${profileName}"?`)) return;

    await AuthService.deleteCredentialsFromKeyring(profileName);
    await AuthService.deleteLoginCredentials(profileName);
    ProfileManager.deleteProfile(profileName);
    loadProfiles();

    if (currentProfile?.name === profileName) {
      onDisconnected();
    }
  };

  const handleTestConnection = async () => {
    setFormError(null);
    setTestSuccess(null);

    if (!AuthService.validateUrl(formBaseUrl)) {
      setFormError("Invalid URL format. Must start with http:// or https://");
      return;
    }

    if (formAuthMode === "apptoken") {
      if (!formBaseUrl.trim() || !formAppToken.trim() || !formAppUsername.trim()) {
        setFormError("URL, App Token, and Username are required to test");
        return;
      }
    } else {
      if (!formBaseUrl.trim() || !formUsername.trim() || !formPassword.trim()) {
        setFormError("URL, username, and password are required to test");
        return;
      }
    }

    setIsTesting(true);
    try {
      let creds: NimbusCredentials;
      if (formAuthMode === "apptoken") {
        creds = await AuthService.authenticateWithAppToken(
          formBaseUrl,
          formAppToken,
          formAppUsername
        );
        setTestSuccess(`Connection successful! User ID: ${creds.userId}`);
      } else {
        creds = await AuthService.authenticateWithNimbus(
          formBaseUrl,
          formUsername,
          formPassword
        );
        setTestSuccess(`Connection successful! User ID: ${creds.userId}`);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveProfile = async () => {
    setFormError(null);

    if (!formName.trim() || !formDisplayName.trim() || !formBaseUrl.trim()) {
      setFormError("Name, display name, and URL are required");
      return;
    }

    if (!AuthService.validateUrl(formBaseUrl)) {
      setFormError("Invalid URL format");
      return;
    }

    if (!editingProfile && ProfileManager.getProfile(formName)) {
      setFormError("Profile name already exists");
      return;
    }

    let hasCredentials = editingProfile?.hasStoredCredentials || false;

    // Save credentials based on auth mode
    if (formSaveCredentials) {
      try {
        if (formAuthMode === "apptoken" && formAppToken.trim() && formAppUsername.trim()) {
          await AuthService.saveAppTokenCredentials(formName, formAppToken.trim(), formAppUsername.trim());
          hasCredentials = true;
        } else if (formAuthMode === "credential" && formUsername.trim() && formPassword.trim()) {
          await AuthService.saveLoginCredentials(formName, formUsername.trim(), formPassword);
          hasCredentials = true;
        }
      } catch (error) {
        setFormError("Failed to save credentials");
        return;
      }
    }

    const profile: Profile = {
      name: formName,
      displayName: formDisplayName,
      environment: formEnvironment,
      baseUrl: formBaseUrl.trim().replace(/\/$/, ""),
      hasStoredCredentials: hasCredentials,
      authMode: formAuthMode,
    };

    ProfileManager.saveProfile(profile);
    loadProfiles();

    if (hasCredentials) {
      setTestSuccess("Profile saved!");
      setTimeout(() => {
        setShowDialog(false);
        setTestSuccess(null);
      }, 1000);
    } else {
      setShowDialog(false);
    }
  };

  const handleConnect = async (profile: Profile) => {
    const authMode = profile.authMode || "apptoken";
    setStatus("connecting");
    setErrorMessage(null);

    try {
      // Try stored session credentials first
      const storedSession = await AuthService.loadCredentialsFromKeyring(profile.name);
      if (storedSession) {
        const isValid = await AuthService.testConnection(storedSession);
        if (isValid) {
          ProfileManager.updateLastUsed(profile.name);
          onConnected(storedSession, profile);
          setStatus("idle");
          return;
        }
      }

      // Try stored credentials based on auth mode
      if (authMode === "apptoken") {
        const storedAppToken = await AuthService.loadAppTokenCredentials(profile.name);
        if (storedAppToken) {
          const newCreds = await AuthService.authenticateWithAppToken(
            profile.baseUrl,
            storedAppToken.appToken,
            storedAppToken.username
          );
          await AuthService.saveCredentialsToKeyring(profile.name, newCreds);
          ProfileManager.updateLastUsed(profile.name);
          onConnected(newCreds, profile);
          setStatus("idle");
          return;
        }
      } else {
        const storedLogin = await AuthService.loadLoginCredentials(profile.name);
        if (storedLogin) {
          const newCreds = await AuthService.authenticateWithNimbus(
            profile.baseUrl,
            storedLogin.username,
            storedLogin.password
          );
          await AuthService.saveCredentialsToKeyring(profile.name, newCreds);
          ProfileManager.updateLastUsed(profile.name);
          onConnected(newCreds, profile);
          setStatus("idle");
          return;
        }
      }

      // No stored credentials - open login dialog
      setEditingProfile(profile);
      setLoginMode(true);
      setFormName(profile.name);
      setFormDisplayName(profile.displayName);
      setFormEnvironment(profile.environment);
      setFormBaseUrl(profile.baseUrl);
      setFormAuthMode(authMode);
      setFormUsername("");
      setFormPassword("");
      setFormAppToken("");
      setFormAppUsername("");
      setFormSaveCredentials(true);
      setFormError(null);
      setStatus("idle");
      setShowDialog(true);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Connection failed");
    }
  };

  const handleLogin = async () => {
    if (formAuthMode === "apptoken") {
      if (!formAppToken.trim() || !formAppUsername.trim()) {
        setFormError("App Token and Username required");
        return;
      }
    } else {
      if (!formUsername.trim() || !formPassword.trim()) {
        setFormError("Username and password required");
        return;
      }
    }

    setStatus("connecting");
    setFormError(null);

    try {
      let creds: NimbusCredentials;

      if (formAuthMode === "apptoken") {
        creds = await AuthService.authenticateWithAppToken(
          formBaseUrl,
          formAppToken,
          formAppUsername
        );

        if (formSaveCredentials) {
          await AuthService.saveAppTokenCredentials(formName, formAppToken.trim(), formAppUsername.trim());
          await AuthService.saveCredentialsToKeyring(formName, creds);
          ProfileManager.markCredentialsStored(formName, true);
        }
      } else {
        creds = await AuthService.authenticateWithNimbus(
          formBaseUrl,
          formUsername,
          formPassword
        );

        if (formSaveCredentials) {
          await AuthService.saveLoginCredentials(formName, formUsername.trim(), formPassword);
          await AuthService.saveCredentialsToKeyring(formName, creds);
          ProfileManager.markCredentialsStored(formName, true);
        }
      }

      const profile: Profile = {
        name: formName,
        displayName: formDisplayName,
        environment: formEnvironment,
        baseUrl: formBaseUrl.trim().replace(/\/$/, ""),
        hasStoredCredentials: formSaveCredentials,
        authMode: formAuthMode,
      };

      ProfileManager.updateLastUsed(formName);
      loadProfiles();
      onConnected(creds, profile);
      setShowDialog(false);
      setStatus("idle");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Login failed");
      setStatus("error");
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Connection Management
      </Typography>

      {isConnected && credentials && currentProfile && (
        <Card sx={{ mb: 3, bgcolor: "success.light" }}>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <CheckCircleIcon color="success" />
              <Typography variant="h6">Connected</Typography>
            </Stack>
            <Typography>
              <strong>Profile:</strong> {currentProfile.displayName}
            </Typography>
            <Typography>
              <strong>Environment:</strong>{" "}
              <Chip
                label={currentProfile.environment}
                color={currentProfile.environment === "Production" ? "error" : "warning"}
                size="small"
              />
            </Typography>
            <Typography sx={{ fontFamily: "monospace", fontSize: "0.875rem" }}>
              {credentials.baseUrl}
            </Typography>
            <Button
              variant="outlined"
              color="error"
              onClick={onDisconnected}
              size="small"
              sx={{ mt: 2 }}
            >
              Disconnect
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "error" && errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }} icon={<ErrorIcon />}>
          {errorMessage}
        </Alert>
      )}

      {status === "connecting" && (
        <Alert severity="info" sx={{ mb: 2 }} icon={<CircularProgress size={20} />}>
          Connecting...
        </Alert>
      )}

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Saved Profiles</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleNewProfile}>
              New Profile
            </Button>
          </Stack>

          {profiles.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
              No profiles saved. Create a new profile to get started.
            </Typography>
          ) : (
            <List>
              {profiles.map((profile, index) => (
                <Box key={profile.name}>
                  {index > 0 && <Divider />}
                  <ListItem>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography>{profile.displayName}</Typography>
                          <Chip
                            label={profile.environment}
                            color={profile.environment === "Production" ? "error" : "warning"}
                            size="small"
                          />
                          {profile.hasStoredCredentials && (
                            <Chip label="Saved" color="success" size="small" variant="outlined" />
                          )}
                        </Stack>
                      }
                      secondary={profile.baseUrl}
                    />
                    <ListItemSecondaryAction>
                      <Button
                        variant="contained"
                        onClick={() => handleConnect(profile)}
                        disabled={
                          status === "connecting" ||
                          (isConnected && currentProfile?.name === profile.name)
                        }
                        sx={{ mr: 1 }}
                      >
                        Connect
                      </Button>
                      <IconButton onClick={() => handleEditProfile(profile)} sx={{ mr: 1 }}>
                        <EditIcon />
                      </IconButton>
                      <IconButton onClick={() => handleDeleteProfile(profile.name)}>
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </Box>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Profile Dialog */}
      <Dialog open={showDialog} onClose={() => setShowDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {loginMode
            ? `Login to ${editingProfile?.displayName}`
            : editingProfile
              ? `Edit: ${editingProfile.displayName}`
              : "New Profile"}
        </DialogTitle>
        <DialogContent>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          {testSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {testSuccess}
            </Alert>
          )}

          {!loginMode && (
            <>
              <TextField
                label="Profile Name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                fullWidth
                margin="normal"
                required
                disabled={!!editingProfile}
              />
              <TextField
                label="Display Name"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                fullWidth
                margin="normal"
                required
              />
              <FormControl fullWidth margin="normal">
                <InputLabel>Environment</InputLabel>
                <Select
                  value={formEnvironment}
                  onChange={(e) => setFormEnvironment(e.target.value as "UAT" | "Production")}
                  label="Environment"
                >
                  <MenuItem value="UAT">UAT</MenuItem>
                  <MenuItem value="Production">Production</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Base URL"
                value={formBaseUrl}
                onChange={(e) => setFormBaseUrl(e.target.value)}
                fullWidth
                margin="normal"
                required
                placeholder="https://nimbus.example.com"
              />
              <FormControl fullWidth margin="normal">
                <InputLabel>Authentication Method</InputLabel>
                <Select
                  value={formAuthMode}
                  onChange={(e) => setFormAuthMode(e.target.value as AuthMode)}
                  label="Authentication Method"
                >
                  <MenuItem value="apptoken">App Token (Recommended)</MenuItem>
                  <MenuItem value="credential">Username / Password</MenuItem>
                </Select>
              </FormControl>
              <Divider sx={{ my: 2 }} />
            </>
          )}

          {formAuthMode === "apptoken" ? (
            <>
              <TextField
                label="App Token"
                value={formAppToken}
                onChange={(e) => setFormAppToken(e.target.value)}
                fullWidth
                margin="normal"
                placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              />
              <TextField
                label="Username"
                value={formAppUsername}
                onChange={(e) => setFormAppUsername(e.target.value)}
                fullWidth
                margin="normal"
                placeholder="email@monash.edu"
              />
            </>
          ) : (
            <>
              <TextField
                label="Username"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                fullWidth
                margin="normal"
              />
              <TextField
                label="Password"
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                fullWidth
                margin="normal"
              />
            </>
          )}

          <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formSaveCredentials}
                  onChange={(e) => setFormSaveCredentials(e.target.checked)}
                />
              }
              label="Save credentials"
            />
            <Button
              variant="outlined"
              onClick={handleTestConnection}
              disabled={
                isTesting ||
                !formBaseUrl ||
                (formAuthMode === "apptoken"
                  ? !formAppToken || !formAppUsername
                  : !formUsername || !formPassword)
              }
              size="small"
            >
              {isTesting ? "Testing..." : "Test Connection"}
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDialog(false)}>Cancel</Button>
          {loginMode ? (
            <Button onClick={handleLogin} variant="contained">
              Connect
            </Button>
          ) : (
            <>
              <Button onClick={handleSaveProfile} variant="outlined">
                Save Profile
              </Button>
              {((formAuthMode === "apptoken" && formAppToken && formAppUsername) ||
                (formAuthMode === "credential" && formUsername && formPassword)) && (
                <Button onClick={handleLogin} variant="contained">
                  Save & Connect
                </Button>
              )}
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
