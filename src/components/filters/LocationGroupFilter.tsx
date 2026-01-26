/**
 * LocationGroupFilter - Hierarchical location group selection
 *
 * Features:
 * - "All Locations" option at top (default)
 * - Location Groups with nested location counts
 * - Individual locations (when searching)
 * - Multi-select: can pick groups AND/OR locations
 */

import { useState, useMemo, useCallback } from "react";
import {
  Autocomplete,
  TextField,
  Chip,
  Box,
  Typography,
  ListSubheader,
} from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import PlaceIcon from "@mui/icons-material/Place";
import PublicIcon from "@mui/icons-material/Public";
import {
  getAllLocationGroups,
  getLocationCountForGroup,
  searchLocationGroups,
  resolveLocationsForGroups,
  LocationGroupInfo,
  isHierarchyLoaded,
} from "../../core/locationGroupService";
import { getAllLocations, LocationInfo } from "../../core/lookupService";

// Special "All Locations" marker
const ALL_LOCATIONS_ID = -999;

type SelectionItem =
  | { type: "all"; data: { id: number; description: string } }
  | { type: "group"; data: LocationGroupInfo }
  | { type: "location"; data: LocationInfo };

export interface LocationGroupFilterProps {
  /** Selected location group IDs */
  selectedGroupIds: number[];
  /** Selected individual location IDs (in addition to groups) */
  selectedLocationIds: number[];
  /** Called when selection changes */
  onSelectionChange: (groupIds: number[], locationIds: number[]) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Whether hierarchy data has been loaded (triggers re-render when true) */
  loaded?: boolean;
  /** Show individual locations in dropdown */
  showLocations?: boolean;
  /** Size variant */
  size?: "small" | "medium";
  /** Min width */
  minWidth?: number;
  /** Label */
  label?: string;
}

export default function LocationGroupFilter({
  selectedGroupIds,
  selectedLocationIds,
  onSelectionChange,
  disabled = false,
  loaded = false,
  showLocations = true,
  size = "small",
  minWidth = 300,
  label = "Location Filter",
}: LocationGroupFilterProps) {
  const [inputValue, setInputValue] = useState("");

  // Check if "All Locations" is effectively selected (nothing specific selected)
  const isAllSelected = selectedGroupIds.length === 0 && selectedLocationIds.length === 0;

  // Build options list - re-runs when `loaded` changes to show groups after hierarchy loads
  const options = useMemo((): SelectionItem[] => {
    const items: SelectionItem[] = [];

    // Always show "All Locations" at top when not searching
    if (inputValue.length < 2) {
      items.push({
        type: "all",
        data: { id: ALL_LOCATIONS_ID, description: "All Locations" },
      });
    }

    if (!isHierarchyLoaded()) {
      return items;
    }

    // Add groups
    const groups = inputValue.length >= 2
      ? searchLocationGroups(inputValue, 50)
      : getAllLocationGroups();

    for (const group of groups) {
      items.push({ type: "group", data: group });
    }

    // Add individual locations when searching
    if (showLocations && inputValue.length >= 2) {
      const locations = getAllLocations()
        .filter((loc) =>
          loc.description.toLowerCase().includes(inputValue.toLowerCase())
        )
        .slice(0, 30);

      for (const loc of locations) {
        items.push({ type: "location", data: loc });
      }
    }

    return items;
  }, [inputValue, showLocations, loaded]);

  // Build selected items for display
  const selectedItems = useMemo((): SelectionItem[] => {
    // If nothing selected, show "All Locations" as selected
    if (isAllSelected) {
      return [{
        type: "all",
        data: { id: ALL_LOCATIONS_ID, description: "All Locations" },
      }];
    }

    const items: SelectionItem[] = [];

    // Add selected groups
    const allGroups = getAllLocationGroups();
    for (const gid of selectedGroupIds) {
      const group = allGroups.find((g) => g.id === gid);
      if (group) {
        items.push({ type: "group", data: group });
      }
    }

    // Add selected locations
    if (showLocations) {
      const allLocations = getAllLocations();
      for (const lid of selectedLocationIds) {
        const loc = allLocations.find((l) => l.id === lid);
        if (loc) {
          items.push({ type: "location", data: loc });
        }
      }
    }

    return items;
  }, [selectedGroupIds, selectedLocationIds, showLocations, isAllSelected]);

  // Handle selection change
  const handleChange = useCallback(
    (_event: React.SyntheticEvent, newValue: SelectionItem[]) => {
      // Check if "All Locations" was just selected
      const hasAll = newValue.some((item) => item.type === "all");
      const hadAll = isAllSelected;

      if (hasAll && !hadAll) {
        // User selected "All Locations" - clear everything
        onSelectionChange([], []);
        return;
      }

      // Filter out "All Locations" if user selected something else
      const filtered = newValue.filter((item) => item.type !== "all");

      const newGroupIds: number[] = [];
      const newLocationIds: number[] = [];

      for (const item of filtered) {
        if (item.type === "group") {
          newGroupIds.push(item.data.id);
        } else if (item.type === "location") {
          newLocationIds.push(item.data.id);
        }
      }

      onSelectionChange(newGroupIds, newLocationIds);
    },
    [onSelectionChange, isAllSelected]
  );

  // Get option label
  const getOptionLabel = useCallback((item: SelectionItem) => {
    if (item.type === "all") {
      return "All Locations";
    }
    if (item.type === "group") {
      const count = getLocationCountForGroup(item.data.id);
      return `${item.data.description} (${count} locations)`;
    }
    return item.data.description;
  }, []);

  // Render option
  const renderOption = useCallback(
    (
      props: React.HTMLAttributes<HTMLLIElement> & { key: string },
      item: SelectionItem
    ) => {
      const { key, ...otherProps } = props;

      if (item.type === "all") {
        return (
          <li key={key} {...otherProps}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <PublicIcon fontSize="small" color="success" />
              <Typography variant="body2" fontWeight="bold">
                All Locations
              </Typography>
            </Box>
          </li>
        );
      }

      if (item.type === "group") {
        const count = getLocationCountForGroup(item.data.id);
        return (
          <li key={key} {...otherProps}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FolderIcon fontSize="small" color="primary" />
              <Box>
                <Typography variant="body2">{item.data.description}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {count} locations
                  {item.data.orgCode && ` | Org: ${item.data.orgCode}`}
                </Typography>
              </Box>
            </Box>
          </li>
        );
      } else {
        return (
          <li key={key} {...otherProps}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, pl: 1 }}>
              <PlaceIcon fontSize="small" color="secondary" />
              <Typography variant="body2">{item.data.description}</Typography>
            </Box>
          </li>
        );
      }
    },
    []
  );

  // Render tags (selected chips)
  const renderTags = useCallback(
    (tagValue: SelectionItem[], getTagProps: (params: { index: number }) => object) =>
      tagValue.map((item, index) => {
        const tagProps = getTagProps({ index });
        if (item.type === "all") {
          // "All Locations" chip is not deletable - select something else to clear it
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { onDelete, ...restProps } = tagProps as { onDelete?: () => void };
          return (
            <Chip
              {...restProps}
              key="all-locations"
              label="All Locations"
              size="small"
              icon={<PublicIcon fontSize="small" />}
              color="success"
              variant="outlined"
            />
          );
        }
        return (
          <Chip
            {...tagProps}
            key={item.type === "group" ? `g-${item.data.id}` : `l-${item.data.id}`}
            label={item.data.description}
            size="small"
            icon={
              item.type === "group" ? (
                <FolderIcon fontSize="small" />
              ) : (
                <PlaceIcon fontSize="small" />
              )
            }
            color={item.type === "group" ? "primary" : "secondary"}
            variant="outlined"
          />
        );
      }),
    []
  );

  // Calculate resolved location count for display
  const resolvedLocationCount = useMemo(() => {
    if (isAllSelected) {
      return getAllLocations().length;
    }
    const resolved = resolveLocationsForGroups(selectedGroupIds);
    selectedLocationIds.forEach((lid) => resolved.add(lid));
    return resolved.size;
  }, [selectedGroupIds, selectedLocationIds, isAllSelected]);

  // Group options by type
  const groupBy = useCallback((item: SelectionItem) => {
    if (item.type === "all") return " "; // Space to sort first
    if (item.type === "group") return "Location Groups";
    return "Individual Locations";
  }, []);

  return (
    <Box sx={{ minWidth }}>
      <Autocomplete<SelectionItem, true, false, false>
        multiple
        value={selectedItems}
        onChange={handleChange}
        inputValue={inputValue}
        onInputChange={(_, newValue) => setInputValue(newValue)}
        options={options}
        getOptionLabel={getOptionLabel}
        renderOption={renderOption}
        renderTags={renderTags}
        isOptionEqualToValue={(option, val) =>
          option.type === val.type && option.data.id === val.data.id
        }
        groupBy={groupBy}
        disabled={disabled}
        size={size}
        limitTags={2}
        renderGroup={(params) => (
          <li key={params.key}>
            {params.group !== " " && (
              <ListSubheader component="div" sx={{ bgcolor: "background.paper" }}>
                {params.group}
              </ListSubheader>
            )}
            <ul style={{ padding: 0 }}>{params.children}</ul>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder="Type to search..."
            helperText={`${resolvedLocationCount} locations`}
          />
        )}
        noOptionsText={
          inputValue.length < 2
            ? "Type to search locations"
            : "No matching results"
        }
      />
    </Box>
  );
}
