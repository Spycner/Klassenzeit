import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type EntityColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Applied to both the <TableHead> and every <TableCell> in this column.
   *  Use for shared alignment/width like "text-right" or "w-40 text-right". */
  className?: string;
  /** Override applied to the <TableHead> only. Rare; alignment usually
   *  belongs on `className` so head and cell line up. */
  headerClassName?: string;
  /** Additional classes applied to <TableCell> only.
   *  Use for cell-only content styling like "font-medium" or "font-mono text-[12.5px]". */
  cellClassName?: string;
};

export type EntityListTableProps<T> = {
  rows: readonly T[];
  rowKey: (row: T) => string;
  columns: readonly EntityColumn<T>[];
  /** When provided, mounts a final right-aligned actions column after the data
   *  columns. Caller returns the buttons; the primitive owns spacing. */
  actions?: (row: T) => ReactNode;
  /** Header label for the actions column. Optional; when omitted while `actions`
   *  is provided, the actions <TableHead> renders empty so column counts align. */
  actionsHeader?: ReactNode;
  /** Width / alignment classes for the actions <TableHead> + <TableCell>.
   *  Defaults to "w-40 text-right". */
  actionsClassName?: string;
};

const DEFAULT_ACTIONS_CLASS = "w-40 text-right";

export function EntityListTable<T>({
  rows,
  rowKey,
  columns,
  actions,
  actionsHeader,
  actionsClassName,
}: EntityListTableProps<T>) {
  const actionsClass = actionsClassName ?? DEFAULT_ACTIONS_CLASS;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={cn("py-2", col.className, col.headerClassName)}>
                {col.header}
              </TableHead>
            ))}
            {actions ? (
              <TableHead className={cn("py-2", actionsClass)}>{actionsHeader}</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((col) => (
                <TableCell key={col.key} className={cn("py-1.5", col.className, col.cellClassName)}>
                  {col.cell(row)}
                </TableCell>
              ))}
              {actions ? (
                <TableCell className={cn("space-x-2 whitespace-nowrap py-1.5", actionsClass)}>
                  {actions(row)}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
