import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, ArrowUpDown, Edit, Trash2, Loader2, Plus } from "lucide-react";
import { ForeignKeyBadge } from "@/components/ForeignKeyBadge";
import type { ColumnInfo } from "./types";

interface DataGridProps {
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
  onNavigateToRelatedTable?: ((refTable: string, refColumn: string, value: unknown) => void) | undefined;
  onEditRow: (row: Record<string, unknown>) => void;
  onDeleteRow: (row: Record<string, unknown>) => void;
  onInsertFirstRow: () => void;
  onClearSearch: () => void;
  formatValue: (value: unknown) => string;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function DataGrid({
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
  onNavigateToRelatedTable,
  onEditRow,
  onDeleteRow,
  onInsertFirstRow,
  onClearSearch,
  formatValue,
}: DataGridProps) {
  return (
    <div className="overflow-x-auto border rounded-lg bg-card relative">
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
            <tr>
              <th scope="col" className="px-3 py-3 w-10">
                <Checkbox
                  checked={selectedRows.length === filteredData.length && filteredData.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      onSelectAllRows();
                    } else {
                      onClearRowSelection();
                    }
                  }}
                  aria-label={
                    selectedRows.length === filteredData.length
                      ? "Deselect all rows"
                      : "Select all rows"
                  }
                />
              </th>
              {schema.map((col) => (
                <th key={col.cid} scope="col" className="px-4 py-3 text-left">
                  <button
                    onClick={() => onDataSort(col.name)}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors whitespace-nowrap"
                  >
                    {col.name}
                    {dataSortColumn === col.name ? (
                      dataSortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    )}
                  </button>
                </th>
              ))}
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredData.map((row, rowIndex) => {
              const isRowSelected = selectedRows.includes(rowIndex);
              return (
                <tr
                  key={rowIndex}
                  className={`hover:bg-muted/50 ${isRowSelected ? "bg-primary/5" : ""}`}
                >
                  <td className="px-3 py-3">
                    <Checkbox
                      checked={isRowSelected}
                      onCheckedChange={() => onToggleRowSelection(rowIndex)}
                      aria-label={`Select row ${String(rowIndex + 1)}`}
                    />
                  </td>
                  {schema.map((col) => {
                    const isFK = foreignKeys[col.name];
                    const cellValue = row[col.name];

                    return (
                      <td
                        key={`${String(rowIndex)}-${String(col.cid)}`}
                        className="px-4 py-3 whitespace-nowrap"
                      >
                        {isFK && onNavigateToRelatedTable ? (
                          <ForeignKeyBadge
                            value={cellValue}
                            refTable={isFK.refTable}
                            refColumn={isFK.refColumn}
                            onClick={() => {
                              if (cellValue !== null && cellValue !== undefined) {
                                onNavigateToRelatedTable(isFK.refTable, isFK.refColumn, cellValue);
                              }
                            }}
                          />
                        ) : (
                          <span
                            className={cellValue === null ? "italic text-muted-foreground" : ""}
                          >
                            {formatValue(cellValue)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onEditRow(row)}
                        title="Edit row"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onDeleteRow(row)}
                        title="Delete row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
