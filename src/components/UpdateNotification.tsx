/**
 * Update Notification Component
 * Shows a banner when a new version is available
 */

import { useState, useEffect } from "react";
import { Alert, AlertTitle, Button, Collapse, IconButton, Link } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { checkForUpdates, openReleaseUrl, getAppVersion } from "../core/versionService";

interface UpdateNotificationProps {
  /** GitHub token for private repos (optional) */
  githubToken?: string;
  /** Delay before checking (ms), default 5000 */
  checkDelay?: number;
}

export default function UpdateNotification({
  githubToken,
  checkDelay = 5000,
}: UpdateNotificationProps) {
  const [updateInfo, setUpdateInfo] = useState<{
    hasUpdate: boolean;
    latestVersion?: string;
    releaseUrl?: string;
  } | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("0.1.0");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check version on mount (with delay to not slow startup)
    const timer = setTimeout(async () => {
      try {
        const [version, update] = await Promise.all([
          getAppVersion(),
          checkForUpdates(githubToken),
        ]);
        setCurrentVersion(version);
        setUpdateInfo(update);
      } catch (error) {
        console.log("Update check failed:", error);
      }
    }, checkDelay);

    return () => clearTimeout(timer);
  }, [githubToken, checkDelay]);

  const handleViewRelease = () => {
    if (updateInfo?.releaseUrl) {
      openReleaseUrl(updateInfo.releaseUrl);
    }
  };

  const showNotification = updateInfo?.hasUpdate && !dismissed;

  return (
    <Collapse in={showNotification}>
      <Alert
        severity="info"
        action={
          <>
            {updateInfo?.releaseUrl && (
              <Button
                color="inherit"
                size="small"
                onClick={handleViewRelease}
                sx={{ mr: 1 }}
              >
                View Release
              </Button>
            )}
            <IconButton
              aria-label="dismiss"
              color="inherit"
              size="small"
              onClick={() => setDismissed(true)}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          </>
        }
        sx={{ mb: 2 }}
      >
        <AlertTitle>Update Available</AlertTitle>
        A new version ({updateInfo?.latestVersion}) is available. You are running {currentVersion}.
        {updateInfo?.releaseUrl && (
          <>
            {" "}
            <Link
              component="button"
              onClick={handleViewRelease}
              sx={{ verticalAlign: "baseline" }}
            >
              Download the latest version
            </Link>
            .
          </>
        )}
      </Alert>
    </Collapse>
  );
}
