/**
 * PersonLookupFilter - Type-ahead search for 21k+ users
 *
 * Features:
 * - Debounced input (300ms) to avoid excessive searching
 * - Searches by: name, payroll number, username/email
 * - Uses pre-built search index for fast client-side search
 * - Shows results with payroll number for identification
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Autocomplete,
  TextField,
  Typography,
  Box,
  CircularProgress,
} from "@mui/material";
import {
  searchUsers,
  getUser,
  isUserSearchIndexReady,
  UserInfo,
} from "../../core/lookupService";

export interface PersonLookupFilterProps {
  /** Currently selected user ID */
  value: number | null;
  /** Called when selection changes */
  onChange: (userId: number | null) => void;
  /** Label for the input */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Size variant */
  size?: "small" | "medium";
  /** Min width */
  minWidth?: number;
}

export default function PersonLookupFilter({
  value,
  onChange,
  label = "Person",
  placeholder = "Search by name, payroll, or email...",
  disabled = false,
  size = "small",
  minWidth = 280,
}: PersonLookupFilterProps) {
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get the currently selected user (if any)
  const selectedUser = value ? getUser(value) : null;

  // Debounced search function
  const debouncedSearch = useCallback((query: string) => {
    // Clear any pending timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query || query.length < 2) {
      setOptions([]);
      setLoading(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      if (!isUserSearchIndexReady()) {
        console.warn("User search index not ready yet");
        setLoading(false);
        return;
      }

      // Search is fast (client-side), but still show loading briefly for UX
      const results = searchUsers(query, 25);
      setOptions(results);
      setLoading(false);
    }, 300);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Handle input change
  const handleInputChange = useCallback(
    (_event: React.SyntheticEvent, newInputValue: string) => {
      setInputValue(newInputValue);
      if (newInputValue.length >= 2) {
        setLoading(true);
        debouncedSearch(newInputValue);
      } else {
        setOptions([]);
      }
    },
    [debouncedSearch]
  );

  // Handle selection change
  const handleChange = useCallback(
    (_event: React.SyntheticEvent, newValue: UserInfo | null) => {
      onChange(newValue?.id ?? null);
    },
    [onChange]
  );

  // Format option label
  const getOptionLabel = useCallback((user: UserInfo) => {
    const parts = [user.fullName];
    if (user.payroll) {
      parts.push(`(${user.payroll})`);
    } else if (user.username) {
      parts.push(`(${user.username})`);
    }
    return parts.join(" ");
  }, []);

  // Render option with more detail
  const renderOption = useCallback(
    (
      props: React.HTMLAttributes<HTMLLIElement> & { key: string },
      user: UserInfo
    ) => {
      const { key, ...otherProps } = props;
      return (
        <li key={key} {...otherProps}>
          <Box>
            <Typography variant="body2">{user.fullName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {user.payroll && `Payroll: ${user.payroll}`}
              {user.payroll && user.username && " | "}
              {user.username && `Email: ${user.username}`}
            </Typography>
          </Box>
        </li>
      );
    },
    []
  );

  return (
    <Autocomplete<UserInfo, false, false, false>
      value={selectedUser}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      options={options}
      getOptionLabel={getOptionLabel}
      renderOption={renderOption}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      filterOptions={(x) => x} // Disable built-in filter - we handle it
      loading={loading}
      disabled={disabled}
      size={size}
      sx={{ minWidth }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? (
                  <CircularProgress color="inherit" size={16} />
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      noOptionsText={
        inputValue.length < 2
          ? "Type at least 2 characters to search"
          : "No users found"
      }
    />
  );
}
