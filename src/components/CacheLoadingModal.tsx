/**
 * Cache Loading Modal
 * Shows progress while preloading all lookup data after connection
 */

import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  LinearProgress,
  Stack,
  CircularProgress,
} from "@mui/material";
import StorageIcon from "@mui/icons-material/Storage";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import type { CacheLoadingProgress } from "../core/lookupService";

interface CacheLoadingModalProps {
  open: boolean;
  progress: CacheLoadingProgress | null;
}

export default function CacheLoadingModal({ open, progress }: CacheLoadingModalProps) {
  const percentComplete = progress
    ? Math.round((progress.step / progress.totalSteps) * 100)
    : 0;

  const isComplete = progress && progress.step === progress.totalSteps && progress.detail?.includes("loaded");

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 },
      }}
    >
      <DialogContent>
        <Stack spacing={3} sx={{ py: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
            <StorageIcon color="primary" sx={{ fontSize: 40 }} />
            <Typography variant="h5">Loading Cache</Typography>
          </Stack>

          <Typography color="text.secondary" textAlign="center">
            Preparing data for faster report filtering...
          </Typography>

          <Box sx={{ width: "100%", px: 2 }}>
            <LinearProgress
              variant="determinate"
              value={percentComplete}
              sx={{ height: 10, borderRadius: 5 }}
            />
          </Box>

          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
            {isComplete ? (
              <CheckCircleIcon color="success" />
            ) : (
              <CircularProgress size={20} />
            )}
            <Typography variant="body1">
              {progress?.currentTask || "Initializing..."}
              {progress?.detail && (
                <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
                  ({progress.detail})
                </Typography>
              )}
            </Typography>
          </Stack>

          <Typography variant="caption" color="text.secondary" textAlign="center">
            Step {progress?.step || 0} of {progress?.totalSteps || 6}
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
