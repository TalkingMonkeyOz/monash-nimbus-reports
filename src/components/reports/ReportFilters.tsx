import { Box, Button, Stack } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import { Dayjs } from "dayjs";

interface ReportFiltersProps {
  fromDate: Dayjs | null;
  toDate: Dayjs | null;
  onFromDateChange: (date: Dayjs | null) => void;
  onToDateChange: (date: Dayjs | null) => void;
  onSearch: () => void;
  onExport: () => void;
  loading?: boolean;
  children?: React.ReactNode;
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
}: ReportFiltersProps) {
  // Use dates directly - parent must provide valid Dayjs objects
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <DatePicker
          label="From Date"
          value={fromDate}
          onChange={onFromDateChange}
          format="DD/MM/YYYY"
          slotProps={{ textField: { size: "small" } }}
        />
        <DatePicker
          label="To Date"
          value={toDate}
          onChange={onToDateChange}
          format="DD/MM/YYYY"
          slotProps={{ textField: { size: "small" } }}
        />

        {children}

        <Button
          variant="contained"
          startIcon={<SearchIcon />}
          onClick={onSearch}
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
