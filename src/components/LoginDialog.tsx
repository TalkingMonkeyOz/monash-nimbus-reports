import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  FormControlLabel,
  Checkbox,
  Stack,
  CircularProgress,
  Typography,
} from "@mui/material";
import { useConnectionStore } from "../stores/connectionStore";

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function LoginDialog({ open, onClose }: LoginDialogProps) {
  // Credential-based auth fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // App Token auth fields
  const [appToken, setAppToken] = useState("");
  const [appUsername, setAppUsername] = useState("");
  // Common
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    getActiveConnection,
    authenticate,
    authenticateWithAppToken,
    saveLoginCredentials,
    loadLoginCredentials,
    saveAppTokenCredentials,
    loadAppTokenCredentials,
  } = useConnectionStore();

  const connection = getActiveConnection();
  const isAppTokenMode = connection?.authMode === "apptoken";

  // Load saved credentials when dialog opens
  useEffect(() => {
    if (open && connection) {
      // Reset fields
      setUsername("");
      setPassword("");
      setAppToken("");
      setAppUsername("");
      setRememberMe(false);
      setError(null);

      if (isAppTokenMode) {
        loadAppTokenCredentials(connection.name).then((creds) => {
          if (creds) {
            setAppToken(creds.app_token);
            setAppUsername(creds.username);
            setRememberMe(true);
          }
        });
      } else {
        loadLoginCredentials(connection.name).then((creds) => {
          if (creds) {
            setUsername(creds.username);
            setPassword(creds.password);
            setRememberMe(true);
          }
        });
      }
    }
  }, [open, connection, isAppTokenMode, loadLoginCredentials, loadAppTokenCredentials]);

  const handleLogin = async () => {
    if (!connection) return;

    setLoading(true);
    setError(null);

    try {
      if (isAppTokenMode) {
        await authenticateWithAppToken(connection, appToken, appUsername);
        if (rememberMe) {
          await saveAppTokenCredentials(connection.name, {
            app_token: appToken,
            username: appUsername,
          });
        }
      } else {
        await authenticate(connection, username, password);
        if (rememberMe) {
          await saveLoginCredentials(connection.name, { username, password });
        }
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      if (isAppTokenMode && appToken && appUsername) {
        handleLogin();
      } else if (!isAppTokenMode && username && password) {
        handleLogin();
      }
    }
  };

  const canSubmit = isAppTokenMode
    ? appToken && appUsername
    : username && password;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Login to {connection?.name || "Nimbus"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {isAppTokenMode ? (
            <>
              <Typography variant="body2" color="text.secondary">
                Enter your App Token credentials provided by your administrator.
              </Typography>
              <TextField
                label="App Token"
                fullWidth
                value={appToken}
                onChange={(e) => setAppToken(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
                autoFocus
                placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              />
              <TextField
                label="Username"
                fullWidth
                value={appUsername}
                onChange={(e) => setAppUsername(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
                placeholder="email@monash.edu"
              />
            </>
          ) : (
            <>
              <TextField
                label="Username"
                fullWidth
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
                autoFocus
              />
              <TextField
                label="Password"
                type="password"
                fullWidth
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
              />
            </>
          )}

          <FormControlLabel
            control={
              <Checkbox
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
              />
            }
            label="Remember credentials"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleLogin}
          disabled={loading || !canSubmit}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? "Logging in..." : "Login"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
