import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  TextField,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import LogoutIcon from "@mui/icons-material/Logout";
import { useConnectionStore, Connection, AuthMode } from "../stores/connectionStore";

interface ConnectionSelectorProps {
  onLoginRequired: () => void;
}

export default function ConnectionSelector({ onLoginRequired }: ConnectionSelectorProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newConnection, setNewConnection] = useState<Partial<Connection>>({
    environment: "production",
    authMode: "apptoken", // Default to App Token for new connections
  });

  const {
    connections,
    activeConnectionName,
    isAuthenticated,
    addConnection,
    removeConnection,
    setActiveConnection,
    logout,
  } = useConnectionStore();

  const handleConnectionChange = (event: SelectChangeEvent<string>) => {
    const name = event.target.value;
    setActiveConnection(name || null);
    if (name) {
      onLoginRequired();
    }
  };

  const handleAddConnection = () => {
    if (newConnection.name && newConnection.baseUrl) {
      addConnection(newConnection as Connection);
      setNewConnection({ environment: "production" });
      setAddDialogOpen(false);
    }
  };

  const handleDeleteConnection = (name: string) => {
    removeConnection(name);
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel sx={{ color: "white" }}>Connection</InputLabel>
        <Select
          value={activeConnectionName || ""}
          onChange={handleConnectionChange}
          label="Connection"
          sx={{
            color: "white",
            ".MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.5)" },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "white" },
            ".MuiSvgIcon-root": { color: "white" },
          }}
        >
          {connections.map((conn) => (
            <MenuItem key={conn.name} value={conn.name}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                <span>{conn.name}</span>
                <Chip
                  label={conn.environment}
                  size="small"
                  color={conn.environment === "production" ? "error" : "default"}
                  sx={{ ml: "auto" }}
                />
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Tooltip title="Add Connection">
        <IconButton color="inherit" onClick={() => setAddDialogOpen(true)}>
          <AddIcon />
        </IconButton>
      </Tooltip>

      {activeConnectionName && (
        <Tooltip title="Remove Connection">
          <IconButton
            color="inherit"
            onClick={() => handleDeleteConnection(activeConnectionName)}
          >
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      )}

      {activeConnectionName && !isAuthenticated && (
        <Button
          color="inherit"
          variant="outlined"
          size="small"
          onClick={onLoginRequired}
          sx={{ ml: 1, borderColor: "rgba(255,255,255,0.5)" }}
        >
          Login
        </Button>
      )}

      {isAuthenticated && (
        <Tooltip title="Logout">
          <IconButton color="inherit" onClick={logout}>
            <LogoutIcon />
          </IconButton>
        </Tooltip>
      )}

      {/* Add Connection Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)}>
        <DialogTitle>Add Connection</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: 350 }}>
            <TextField
              label="Connection Name"
              fullWidth
              value={newConnection.name || ""}
              onChange={(e) => setNewConnection({ ...newConnection, name: e.target.value })}
              placeholder="e.g., Monash Production"
            />
            <TextField
              label="Base URL"
              fullWidth
              value={newConnection.baseUrl || ""}
              onChange={(e) => setNewConnection({ ...newConnection, baseUrl: e.target.value })}
              placeholder="https://monash.nimbussoftware.com.au"
            />
            <FormControl fullWidth>
              <InputLabel>Environment</InputLabel>
              <Select
                value={newConnection.environment || "production"}
                onChange={(e) =>
                  setNewConnection({
                    ...newConnection,
                    environment: e.target.value as Connection["environment"],
                  })
                }
                label="Environment"
              >
                <MenuItem value="production">Production</MenuItem>
                <MenuItem value="uat">UAT</MenuItem>
                <MenuItem value="test">Test</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Authentication</InputLabel>
              <Select
                value={newConnection.authMode || "apptoken"}
                onChange={(e) =>
                  setNewConnection({
                    ...newConnection,
                    authMode: e.target.value as AuthMode,
                  })
                }
                label="Authentication"
              >
                <MenuItem value="apptoken">App Token (Recommended)</MenuItem>
                <MenuItem value="credential">Username / Password</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddConnection}
            disabled={!newConnection.name || !newConnection.baseUrl}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
