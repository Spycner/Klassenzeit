import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface Column<T> {
  /** Unique key for the column (can be a property of T or a custom string) */
  key: keyof T | string;
  /** Header label */
  header: string;
  /** Custom cell renderer */
  cell?: (row: T) => ReactNode;
  /** Additional CSS classes for the cell */
  className?: string;
  /** Whether this column is sortable */
  sortable?: boolean;
}

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface DataTableProps<T> {
  /** Data to display */
  data: T[];
  /** Column definitions */
  columns: Column<T>[];
  /** Callback when a row is clicked */
  onRowClick?: (row: T) => void;
  /** Field to use as the unique key for rows */
  keyField?: keyof T;
  /** Default sort configuration */
  defaultSort?: SortState;
  /** Additional CSS classes for the table container */
  className?: string;
}

function getNestedValue<T>(obj: T, key: string): unknown {
  return key.split(".").reduce((acc: unknown, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

function compareValues(
  a: unknown,
  b: unknown,
  direction: SortDirection,
): number {
  // Handle null/undefined
  if (a == null && b == null) return 0;
  if (a == null) return direction === "asc" ? 1 : -1;
  if (b == null) return direction === "asc" ? -1 : 1;

  // Handle strings
  if (typeof a === "string" && typeof b === "string") {
    const result = a.localeCompare(b, undefined, { sensitivity: "base" });
    return direction === "asc" ? result : -result;
  }

  // Handle numbers
  if (typeof a === "number" && typeof b === "number") {
    const result = a - b;
    return direction === "asc" ? result : -result;
  }

  // Handle booleans
  if (typeof a === "boolean" && typeof b === "boolean") {
    const result = Number(a) - Number(b);
    return direction === "asc" ? result : -result;
  }

  // Fallback: convert to string
  const strA = String(a);
  const strB = String(b);
  const result = strA.localeCompare(strB, undefined, { sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  keyField,
  defaultSort,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | undefined>(defaultSort);

  const handleSort = useCallback((column: Column<T>) => {
    if (!column.sortable) return;

    const key = String(column.key);
    setSort((prev) => {
      if (!prev || prev.key !== key) {
        return { key, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { key, direction: "desc" };
      }
      return { key, direction: "asc" };
    });
  }, []);

  const sortedData = useMemo(() => {
    if (!sort) return data;

    return [...data].sort((a, b) => {
      const aValue = getNestedValue(a, sort.key);
      const bValue = getNestedValue(b, sort.key);
      return compareValues(aValue, bValue, sort.direction);
    });
  }, [data, sort]);

  const getRowKey = (row: T, index: number): string => {
    if (keyField && row[keyField] != null) {
      return String(row[keyField]);
    }
    return String(index);
  };

  const getCellValue = (row: T, column: Column<T>): ReactNode => {
    if (column.cell) {
      return column.cell(row);
    }
    const value = getNestedValue(row, String(column.key));
    if (value == null) return null;
    return String(value);
  };

  const getSortIcon = (column: Column<T>) => {
    if (!column.sortable) return null;

    const key = String(column.key);
    if (!sort || sort.key !== key) {
      return (
        <ChevronsUpDown
          className="ml-1 h-4 w-4 opacity-50"
          aria-hidden="true"
        />
      );
    }
    if (sort.direction === "asc") {
      return <ChevronUp className="ml-1 h-4 w-4" aria-hidden="true" />;
    }
    return <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />;
  };

  return (
    <div className={cn("rounded-md border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={String(column.key)}
                className={cn(
                  column.sortable && "cursor-pointer select-none",
                  column.className,
                )}
                onClick={() => handleSort(column)}
                aria-sort={
                  sort?.key === String(column.key)
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                <div className="flex items-center">
                  {column.header}
                  {getSortIcon(column)}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((row, index) => (
            <TableRow
              key={getRowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && "cursor-pointer")}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
            >
              {columns.map((column) => (
                <TableCell
                  key={String(column.key)}
                  className={column.className}
                >
                  {getCellValue(row, column)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
