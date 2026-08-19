import { useMemo } from "react";
import {
  useTable,
  tableFeatures,
  createColumnHelper,
  rowSelectionFeature,
} from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, ArrowUpDown, Edit, Trash2, Plus, Loader2 } from "lucide-react";
import { ForeignKeyBadge } from "@/components/ForeignKeyBadge";
import { EditableCell } from "./editable-cell";
import type { ColumnInfo } from "./types";

interface DataTableProps {
  schema: ColumnInfo[];
  data: Record<string, unknown>[];
  filteredData: Record<string, unknown>[];
  loadingRows: boolean;
  selectedRows: number[];
  onToggleRowSelection: (index: number) => void;
  onSelectAllRows: () => void;
  onClearRowSelection: () => void;
  dataSortColumn: string | null;
  dataSortDirection: "asc" | "desc";
  onDataSort: (column: string) => void;
  foreignKeys: Record<string, { refTable: string; refColumn: string }>;
  columnFilters: { id: string; value: string }[];
  onColumnFilterChange: (id: string, value: string) => void;
  onNavigateToRelatedTable?: ((refTable: string, refColumn: string, value: unknown) => void) | undefined;
  onEditRow: (row: Record<string, unknown>) => void;
  onDeleteRow: (row: Record<string, unknown>) => void;
  onUpdateCell: (row: Record<string, unknown>, column: string, value: string) => Promise<void>;
  onInsertFirstRow: () => void;
  onClearSearch: () => void;
}

const features = tableFeatures({
  rowSelectionFeature,
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function DataTable({
  schema,
  data,
  filteredData,
  loadingRows,
  selectedRows,
  onToggleRowSelection,
  onSelectAllRows,
  onClearRowSelection,
  dataSortColumn,
  dataSortDirection,
  onDataSort,
  foreignKeys,
  columnFilters,
  onColumnFilterChange,
  onNavigateToRelatedTable,
  onEditRow,
  onDeleteRow,
  onUpdateCell,
  onInsertFirstRow,
  onClearSearch,
}: DataTableProps) {
  const rowSelection = useMemo(() => {
    const selection: Record<string, true> = {};
    selectedRows.forEach((index) => {
      selection[index.toString()] = true;
    });
    return selection;
  }, [selectedRows]);

  const columns = useMemo(() => {
    const helper = createColumnHelper<typeof features, Record<string, unknown>>();
    
    return helper.columns([
      helper.display({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() === true
                ? true
                : table.getIsSomePageRowsSelected() === true
                ? "indeterminate"
                : false
            }
            onCheckedChange={(value) => {
              if (value === true) {
                onSelectAllRows();
              } else {
                onClearRowSelection();
              }
            }}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={() => onToggleRowSelection(row.index)}
            aria-label="Select row"
          />
        ),
      }),
      ...schema.map((col) => {
        const isFK = foreignKeys[col.name];
        return helper.accessor((row) => row[col.name], {
          id: col.name,
          header: () => {
            const filterValue = columnFilters?.find((f) => f.id === col.name)?.value ?? "";
            return (
              <div className="flex flex-col gap-2 p-1 min-w-[120px]">
                <button
                  onClick={() => onDataSort(col.name)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors whitespace-nowrap w-full text-left"
                >
                  <span className="truncate">{col.name}</span>
                  {dataSortColumn === col.name ? (
                    dataSortDirection === "asc" ? (
                      <ArrowUp className="h-3 w-3 shrink-0" />
                    ) : (
                      <ArrowDown className="h-3 w-3 shrink-0" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-50 shrink-0" />
                  )}
                </button>
                <Input
                  placeholder="Filter..."
                  value={filterValue}
                  onChange={(e) => onColumnFilterChange(col.name, e.target.value)}
                  className="h-7 w-full text-xs font-normal"
                />
              </div>
            );
          },
          cell: ({ row, getValue }) => {
            const val = getValue();
            if (isFK && onNavigateToRelatedTable) {
              return (
                <ForeignKeyBadge
                  value={val}
                  refTable={isFK.refTable}
                  refColumn={isFK.refColumn}
                  onClick={() => {
                    if (val !== null && val !== undefined) {
                      onNavigateToRelatedTable(isFK.refTable, isFK.refColumn, val);
                    }
                  }}
                />
              );
            }
            
            return (
              <EditableCell
                initialValue={val}
                columnName={col.name}
                type={col.type}
                onSave={async (newValue) => {
                  await onUpdateCell(row.original, col.name, newValue);
                }}
              />
            );
          },
        });
      }),
      helper.display({
        id: "actions",
        header: () => (
          <div className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Actions
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEditRow(row.original)}
              title="Edit row"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDeleteRow(row.original)}
              title="Delete row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      }),
    ]);
  }, [schema, foreignKeys, dataSortColumn, dataSortDirection, onDataSort, onSelectAllRows, onClearRowSelection, onToggleRowSelection, onNavigateToRelatedTable, onEditRow, onDeleteRow, onUpdateCell]);

  const table = useTable({
    data: filteredData,
    columns,
    features,
    state: {
      rowSelection,
    },
  });

  return (
    <div className="overflow-x-auto border rounded-lg bg-card relative min-h-[200px]">
      {loadingRows && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-sm text-muted-foreground mb-4">No rows in this table</p>
          <Button onClick={onInsertFirstRow}>
            <Plus className="h-4 w-4 mr-2" />
            Insert First Row
          </Button>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-sm text-muted-foreground mb-4">No rows match your search</p>
          <Button variant="outline" onClick={onClearSearch}>
            Clear Search
          </Button>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className="px-4 py-3 text-left font-medium"
                  >
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={`hover:bg-muted/50 transition-colors ${
                  row.getIsSelected() ? "bg-primary/5" : ""
                }`}
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-1.5 whitespace-nowrap align-middle">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
