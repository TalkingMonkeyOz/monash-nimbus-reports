/**
 * AgreementTypeFilter - Multi-select dropdown for agreement types
 *
 * Features:
 * - Dynamically loaded from OData (never hardcoded!)
 * - Multi-select with search
 * - Option to exclude specific types (e.g., Vacant Shift)
 * - Shows selected count
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Autocomplete,
  TextField,
  Chip,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import {
  getAllAgreementTypes,
  loadAgreementTypes,
  AgreementTypeInfo,
} from "../../core/lookupService";

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

export interface AgreementTypeFilterProps {
  /** Selected agreement type IDs */
  selectedIds: number[];
  /** Called when selection changes */
  onChange: (ids: number[]) => void;
  /** Excluded agreement type IDs (filters out from data, not from dropdown) */
  excludedIds?: number[];
  /** Called when excluded IDs change */
  onExcludedChange?: (ids: number[]) => void;
  /** Show "Exclude Vacant Shifts" checkbox - pass the Vacant Shift ID */
  vacantShiftId?: number;
  /** Disabled state */
  disabled?: boolean;
  /** Whether agreement types have been loaded (triggers re-render when true) */
  loaded?: boolean;
  /** Size variant */
  size?: "small" | "medium";
  /** Min width */
  minWidth?: number;
  /** Label */
  label?: string;
  /** Mode: include or exclude selected types */
  mode?: "include" | "exclude";
  /** Only show these agreement type IDs in dropdown (empty = show all) */
  visibleIds?: number[];
}

export default function AgreementTypeFilter({
  selectedIds,
  onChange,
  excludedIds = [],
  onExcludedChange,
  vacantShiftId,
  disabled = false,
  loaded = false,
  size = "small",
  minWidth = 280,
  label = "Agreement Types",
  mode = "include",
  visibleIds = [],
}: AgreementTypeFilterProps) {
  // Get all agreement types from cache - re-runs when `loaded` changes
  // Filter by visibleIds if provided (from global preferences)
  const options = useMemo(() => {
    const all = getAllAgreementTypes();
    if (visibleIds.length === 0) return all;
    return all.filter((a) => visibleIds.includes(a.id));
  }, [loaded, visibleIds]);

  // Build selected items from IDs
  const selectedItems = useMemo(() => {
    return options.filter((opt) => selectedIds.includes(opt.id));
  }, [options, selectedIds]);

  // Handle selection change
  const handleChange = useCallback(
    (_event: React.SyntheticEvent, newValue: AgreementTypeInfo[]) => {
      onChange(newValue.map((item) => item.id));
    },
    [onChange]
  );

  // Handle vacant shift exclusion toggle
  const handleVacantShiftToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!vacantShiftId || !onExcludedChange) return;

      if (event.target.checked) {
        // Add to excluded
        if (!excludedIds.includes(vacantShiftId)) {
          onExcludedChange([...excludedIds, vacantShiftId]);
        }
      } else {
        // Remove from excluded
        onExcludedChange(excludedIds.filter((id) => id !== vacantShiftId));
      }
    },
    [vacantShiftId, excludedIds, onExcludedChange]
  );

  // Render option with checkbox
  const renderOption = useCallback(
    (
      props: React.HTMLAttributes<HTMLLIElement> & { key: string },
      option: AgreementTypeInfo,
      { selected }: { selected: boolean }
    ) => {
      const { key, ...otherProps } = props;
      return (
        <li key={key} {...otherProps}>
          <Checkbox
            icon={icon}
            checkedIcon={checkedIcon}
            style={{ marginRight: 8 }}
            checked={selected}
          />
          {option.description}
        </li>
      );
    },
    []
  );

  // Render tags (selected chips)
  const renderTags = useCallback(
    (
      tagValue: AgreementTypeInfo[],
      getTagProps: (params: { index: number }) => object
    ) => {
      // Show first 2 chips, then "+N more"
      const visible = tagValue.slice(0, 2);
      const hiddenCount = tagValue.length - 2;

      return (
        <>
          {visible.map((option, index) => (
            <Chip
              {...getTagProps({ index })}
              key={option.id}
              label={option.description}
              size="small"
              variant="outlined"
            />
          ))}
          {hiddenCount > 0 && (
            <Typography variant="caption" sx={{ ml: 0.5 }}>
              +{hiddenCount} more
            </Typography>
          )}
        </>
      );
    },
    []
  );

  const isVacantExcluded = vacantShiftId
    ? excludedIds.includes(vacantShiftId)
    : false;

  return (
    <Box sx={{ minWidth }}>
      <Autocomplete<AgreementTypeInfo, true, false, false>
        multiple
        value={selectedItems}
        onChange={handleChange}
        options={options}
        getOptionLabel={(option) => option.description}
        renderOption={renderOption}
        renderTags={renderTags}
        isOptionEqualToValue={(option, val) => option.id === val.id}
        disabled={disabled}
        size={size}
        limitTags={2}
        disableCloseOnSelect
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={
              selectedItems.length === 0
                ? "Select agreement types..."
                : undefined
            }
            helperText={
              selectedItems.length > 0
                ? `${selectedItems.length} ${mode === "include" ? "included" : "excluded"}`
                : mode === "include"
                  ? "All types included"
                  : "None excluded"
            }
          />
        )}
        noOptionsText="No agreement types available"
      />
      {vacantShiftId !== undefined && onExcludedChange && (
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={isVacantExcluded}
              onChange={handleVacantShiftToggle}
              disabled={disabled}
            />
          }
          label={
            <Typography variant="caption">Exclude Vacant Shifts</Typography>
          }
          sx={{ mt: 0.5 }}
        />
      )}
    </Box>
  );
}

/**
 * Helper hook to use agreement type filter with automatic loading
 */
export function useAgreementTypeFilter(
  session: {
    base_url: string;
    auth_mode: "credential" | "apptoken";
    user_id?: number;
    auth_token?: string;
    app_token?: string;
    username?: string;
  } | null,
  onProgress?: (msg: string) => void
) {
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [excludedIds, setExcludedIds] = useState<number[]>([]);

  useEffect(() => {
    if (session && !loaded) {
      loadAgreementTypes(session).then(() => {
        setLoaded(true);
        onProgress?.("Agreement types loaded");
      });
    }
  }, [session, loaded, onProgress]);

  const handleSelectionChange = useCallback((ids: number[]) => {
    setSelectedIds(ids);
  }, []);

  const handleExcludedChange = useCallback((ids: number[]) => {
    setExcludedIds(ids);
  }, []);

  return {
    loaded,
    selectedIds,
    excludedIds,
    handleSelectionChange,
    handleExcludedChange,
  };
}
