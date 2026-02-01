import { useState, useCallback } from "react";
import { Box, Button, Stack } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import { Dayjs } from "dayjs";

interface ReportFiltersProps {
  fromDate?: Dayjs | null;
  toDate?: Dayjs | null;
  onFromDateChange?: (date: Dayjs | null) => void;
  onToDateChange?: (date: Dayjs | null) => void;
  onSearch: () => void;
  onExport: () => void;
  loading?: boolean;
  children?: React.ReactNode;
  hideDateFilters?: boolean;
}

export default function ReportFilters({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onSearch,
  onExport,
  loading = false,
  children,
  hideDateFilters = false,
}: ReportFiltersProps) {
  const [dateError, setDateError] = useState<string | null>(null);

  // Validate dates and call onSearch if valid
  const handleSearch = useCallback(() => {
    // Check if To date is before From date
    if (fromDate && toDate && toDate.isBefore(fromDate, "day")) {
      setDateError("To date cannot be before From date");
      return;
    }
    setDateError(null);
    onSearch();
  }, [fromDate, toDate, onSearch]);

  // Clear error when dates change
  const handleFromDateChange = useCallback((date: Dayjs | null) => {
    setDateError(null);
    onFromDateChange?.(date);
  }, [onFromDateChange]);

  const handleToDateChange = useCallback((date: Dayjs | null) => {
    setDateError(null);
    onToDateChange?.(date);
  }, [onToDateChange]);

  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        {!hideDateFilters && onFromDateChange && (
          <DatePicker
            label="From Date"
            value={fromDate}
            onChange={handleFromDateChange}
            format="DD/MM/YYYY"
            slotProps={{ textField: { size: "small" } }}
          />
        )}
        {!hideDateFilters && onToDateChange && (
          <DatePicker
            label="To Date"
            value={toDate}
            onChange={handleToDateChange}
            format="DD/MM/YYYY"
            slotProps={{
              textField: {
                size: "small",
                error: !!dateError,
                helperText: dateError,
              },
            }}
          />
        )}

        {children}

        <Button
          variant="contained"
          startIcon={<SearchIcon />}
          onClick={handleSearch}
          disabled={loading}
        >
          Search
        </Button>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={onExport}
          disabled={loading}
        >
          Export
        </Button>
      </Stack>
    </Box>
  );
}
