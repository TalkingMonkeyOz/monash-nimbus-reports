/**
 * Cascading Location Filter
 *
 * Two searchable dropdowns:
 * 1. Location Group - select a group (with type-to-search)
 * 2. Location - filtered to locations within selected group (with type-to-search)
 *
 * When a group is selected, the location dropdown only shows
 * locations that belong to that group (including nested child groups).
 */

import { useMemo } from "react";
import { Autocomplete, TextField, Box } from "@mui/material";
import {
  getAllLocationGroups,
  resolveLocationsForGroup,
  LocationGroupInfo,
} from "../../core/locationGroupService";
import { getAllLocations, LocationInfo } from "../../core/lookupService";

// Option types with "All" sentinel
interface GroupOption {
  id: number | null;
  description: string;
  orgCode: string | null;
  isAllOption?: boolean;
}

interface LocationOption {
  id: number | null;
  description: string;
  isAllOption?: boolean;
}

interface CascadingLocationFilterProps {
  selectedGroupId: number | "";
  selectedLocationId: number | "";
  onGroupChange: (groupId: number | "") => void;
  onLocationChange: (locationId: number | "") => void;
  disabled?: boolean;
  /** Pass a changing value (like a counter or timestamp) to trigger re-render when data loads */
  dataVersion?: number;
  size?: "small" | "medium";
  groupMinWidth?: number;
  locationMinWidth?: number;
}

export default function CascadingLocationFilter({
  selectedGroupId,
  selectedLocationId,
  onGroupChange,
  onLocationChange,
  disabled = false,
  dataVersion = 0,
  size = "small",
  groupMinWidth = 220,
  locationMinWidth = 220,
}: CascadingLocationFilterProps) {
  // Get all location groups - re-run when dataVersion changes
  const locationGroups = useMemo<LocationGroupInfo[]>(() => {
    const groups = getAllLocationGroups();
    // Filter out groups with empty/invalid descriptions (including "-")
    return groups.filter((g) => {
      const desc = g.description?.trim();
      return desc && desc !== "" && desc !== "-";
    });
  }, [dataVersion]);

  // Get all locations - re-run when dataVersion changes
  const allLocations = useMemo<LocationInfo[]>(() => {
    const locations = getAllLocations();
    // Filter out locations with empty/invalid descriptions (including "-")
    return locations.filter((l) => {
      const desc = l.description?.trim();
      return desc && desc !== "" && desc !== "-";
    });
  }, [dataVersion]);

  // Filter locations based on selected group
  const filteredLocations = useMemo<LocationInfo[]>(() => {
    if (!selectedGroupId) {
      // No group selected - show all locations
      return allLocations;
    }

    // Get all location IDs that belong to this group (including nested groups)
    const groupLocationIds = resolveLocationsForGroup(selectedGroupId);

    // Filter to only locations in this group
    return allLocations.filter((loc) => groupLocationIds.has(loc.id));
  }, [selectedGroupId, allLocations]);

  // Build group options with "All Groups" at top
  const groupOptions = useMemo<GroupOption[]>(() => {
    const allOption: GroupOption = {
      id: null,
      description: "All Groups",
      orgCode: null,
      isAllOption: true,
    };
    return [
      allOption,
      ...locationGroups.map((g) => ({
        id: g.id,
        description: g.description,
        orgCode: g.orgCode,
      })),
    ];
  }, [locationGroups]);

  // Build location options with "All Locations" at top
  const locationOptions = useMemo<LocationOption[]>(() => {
    const countSuffix = selectedGroupId ? ` (${filteredLocations.length})` : "";
    const allOption: LocationOption = {
      id: null,
      description: `All Locations${countSuffix}`,
      isAllOption: true,
    };
    return [
      allOption,
      ...filteredLocations.map((l) => ({
        id: l.id,
        description: l.description,
      })),
    ];
  }, [filteredLocations, selectedGroupId]);

  // Find currently selected group option
  const selectedGroupOption = useMemo(() => {
    if (selectedGroupId === "") {
      return groupOptions[0]; // "All Groups"
    }
    return groupOptions.find((g) => g.id === selectedGroupId) || groupOptions[0];
  }, [selectedGroupId, groupOptions]);

  // Find currently selected location option
  const selectedLocationOption = useMemo(() => {
    if (selectedLocationId === "") {
      return locationOptions[0]; // "All Locations"
    }
    return locationOptions.find((l) => l.id === selectedLocationId) || locationOptions[0];
  }, [selectedLocationId, locationOptions]);

  // Handle group selection change
  const handleGroupChange = (_event: unknown, newValue: GroupOption | null) => {
    const newGroupId = newValue?.id ?? "";
    onGroupChange(newGroupId === null ? "" : newGroupId);

    // Reset location selection when group changes
    // (the previously selected location might not be in the new group)
    if (selectedLocationId !== "" && newGroupId) {
      const newGroupLocationIds = resolveLocationsForGroup(newGroupId);

      // If the current location is not in the new group, reset it
      if (!newGroupLocationIds.has(selectedLocationId as number)) {
        onLocationChange("");
      }
    }
  };

  // Handle location selection change
  const handleLocationChange = (_event: unknown, newValue: LocationOption | null) => {
    const newLocationId = newValue?.id ?? "";
    onLocationChange(newLocationId === null ? "" : newLocationId);
  };

  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
      {/* Location Group Autocomplete */}
      <Autocomplete
        size={size}
        disabled={disabled}
        options={groupOptions}
        value={selectedGroupOption}
        onChange={handleGroupChange}
        getOptionLabel={(option) => option.description}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        renderOption={(props, option) => {
          const { key, ...rest } = props;
          return (
            <li key={key} {...rest}>
              {option.isAllOption ? (
                <em>{option.description}</em>
              ) : (
                <>
                  {option.description}
                  {option.orgCode && (
                    <span style={{ color: "#666", marginLeft: 8, fontSize: "0.85em" }}>
                      ({option.orgCode})
                    </span>
                  )}
                </>
              )}
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Location Group"
            InputLabelProps={{ shrink: true }}
          />
        )}
        sx={{ minWidth: groupMinWidth }}
        disableClearable
      />

      {/* Location Autocomplete (filtered by group) */}
      <Autocomplete
        size={size}
        disabled={disabled}
        options={locationOptions}
        value={selectedLocationOption}
        onChange={handleLocationChange}
        getOptionLabel={(option) => option.description}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        renderOption={(props, option) => {
          const { key, ...rest } = props;
          return (
            <li key={key} {...rest}>
              {option.isAllOption ? <em>{option.description}</em> : option.description}
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Location"
            InputLabelProps={{ shrink: true }}
          />
        )}
        sx={{ minWidth: locationMinWidth }}
        disableClearable
      />
    </Box>
  );
}
