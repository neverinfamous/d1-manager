import { useState, useCallback } from "react";
import {
  Table,
  Pencil,
  Copy,
  Upload,
  Download,
  Sparkles,
  Shield,
  Trash2,
  ChevronUp,
  ChevronDown,
  Cloud,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatabaseColorPicker } from "./DatabaseColorPicker";
import type { TableInfo, DatabaseColor } from "../services/api";

type SortField = "name" | "type" | "ncol" | "row_count";
type SortDirection = "asc" | "desc";

// Sort icon component - defined outside to avoid recreation during render
function SortIcon({
  field,
  sortField,
  sortDirection,
}: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}): React.JSX.Element | null {
  if (sortField !== field) return null;
  return sortDirection === "asc" ? (
    <ChevronUp className="h-4 w-4 inline-block ml-1" />
  ) : (
    <ChevronDown className="h-4 w-4 inline-block ml-1" />
  );
}

// Sortable header component - defined outside to avoid recreation during render
function SortableHeader({
  field,
  sortField,
  sortDirection,
  onSort,
  children,
  className = "",
}: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <th
      scope="col"
      className={`px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/50 select-none ${className}`}
      onClick={() => onSort(field)}
      aria-sort={
        sortField === field
          ? sortDirection === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <span className="flex items-center">
        {children}
        <SortIcon
          field={field}
          sortField={sortField}
          sortDirection={sortDirection}
        />
      </span>
    </th>
  );
}

export interface TableActionHandlers {
  onBrowse: (tableName: string) => void;
  onRename: (tableName: string) => void;
  onClone: (tableName: string) => void;
  onImport: (tableName: string) => void;
  onExport: (tableName: string) => void;
  onFts5: (tableName: string, isFts5: boolean) => void;
  onStrict: (tableName: string, isStrict: boolean) => void;
  onR2Backup: (tableName: string) => void;
  onR2Restore: (tableName: string) => void;
  onDelete: (tableName: string) => void;
}

interface TableListViewProps {
  tables: TableInfo[];
  selectedTables: string[];
  tableColors: Record<string, DatabaseColor>;
  fts5TableNames: Set<string>;
  r2BackupConfigured: boolean;
  onToggleSelection: (tableName: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onColorChange: (tableName: string, color: DatabaseColor) => void;
  actionHandlers: TableActionHandlers;
}

export function TableListView({
  tables,
  selectedTables,
  tableColors,
  fts5TableNames,
  r2BackupConfigured,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onColorChange,
  actionHandlers,
}: TableListViewProps): React.JSX.Element {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = useCallback(
    (field: SortField): void => {
      if (sortField === field) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("asc");
      }
    },
    [sortField],
  );

  const sortedTables = [...tables].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case "name":
        comparison = (a.name ?? "").localeCompare(b.name ?? "");
        break;
      case "type":
        comparison = (a.type ?? "").localeCompare(b.type ?? "");
        break;
      case "ncol":
        comparison = (a.ncol ?? 0) - (b.ncol ?? 0);
        break;
      case "row_count":
        comparison = (a.row_count ?? 0) - (b.row_count ?? 0);
        break;
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const allSelected =
    tables.length > 0 && selectedTables.length === tables.length;

  return (
    <div className="overflow-x-auto border rounded-lg bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            <th scope="col" className="px-3 py-3 w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    onSelectAll();
                  } else {
                    onClearSelection();
                  }
                }}
                aria-label={
                  allSelected ? "Deselect all tables" : "Select all tables"
                }
              />
            </th>
            <th scope="col" className="px-3 py-3 w-3">
              {/* Color indicator column */}
            </th>
            <SortableHeader
              field="name"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Name
            </SortableHeader>
            <SortableHeader
              field="type"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Type
            </SortableHeader>
            <SortableHeader
              field="ncol"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Columns
            </SortableHeader>
            <SortableHeader
              field="row_count"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Rows
            </SortableHeader>
            <th
              scope="col"
              className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Without rowid
            </th>
            <th
              scope="col"
              className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Strict
            </th>
            <th
              scope="col"
              className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sortedTables.map((table) => {
            const isSelected = selectedTables.includes(table.name);
            const isFts5 = fts5TableNames.has(table.name);
            const isStrict = table.strict === 1;

            return (
              <tr
                key={table.name}
                className={`hover:bg-muted/50 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
              >
                {/* Checkbox */}
                <td className="px-3 py-2">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelection(table.name)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select table ${table.name}`}
                  />
                </td>

                {/* Color indicator */}
                <td className="px-1 py-2">
                  <DatabaseColorPicker
                    value={tableColors[table.name] ?? null}
                    onChange={(color) => onColorChange(table.name, color)}
                  />
                </td>

                {/* Name with status badges */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => actionHandlers.onBrowse(table.name)}
                      className="font-medium text-foreground hover:text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                    >
                      {table.name}
                    </button>
                    {isStrict && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-0.5"
                        title="STRICT mode enabled"
                      >
                        <Shield className="h-2.5 w-2.5" />
                        STRICT
                      </span>
                    )}
                    {isFts5 && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 flex items-center gap-0.5"
                        title="FTS5 virtual table"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        FTS5
                      </span>
                    )}
                  </div>
                </td>

                {/* Type */}
                <td className="px-3 py-2 text-muted-foreground capitalize">
                  {table.type}
                </td>

                {/* Columns */}
                <td className="px-3 py-2 text-muted-foreground">
                  {table.ncol}
                </td>

                {/* Rows */}
                <td className="px-3 py-2 text-muted-foreground">
                  {typeof table.row_count === "number"
                    ? table.row_count.toLocaleString()
                    : "—"}
                </td>

                {/* Without rowid */}
                <td className="px-3 py-2 text-muted-foreground">
                  {table.wr ? "Yes" : "No"}
                </td>

                {/* Strict */}
                <td className="px-3 py-2 text-muted-foreground">
                  {table.strict ? "Yes" : "No"}
                </td>

                {/* Actions */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => actionHandlers.onBrowse(table.name)}
                      aria-label="Browse table"
                      title="Browse"
                    >
                      <Table className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        actionHandlers.onRename(table.name);
                      }}
                      aria-label="Rename table"
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        actionHandlers.onClone(table.name);
                      }}
                      aria-label="Clone table"
                      title="Clone"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        actionHandlers.onImport(table.name);
                      }}
                      aria-label="Import data into table"
                      title="Import"
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        actionHandlers.onExport(table.name);
                      }}
                      aria-label="Export table"
                      title="Export"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {/* R2 Backup button */}
                    {r2BackupConfigured && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-blue-500/10 hover:text-blue-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          actionHandlers.onR2Backup(table.name);
                        }}
                        aria-label="Backup table to R2"
                        title="Backup to R2"
                      >
                        <Cloud className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* R2 Restore button */}
                    {r2BackupConfigured && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-green-500/10 hover:text-green-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          actionHandlers.onR2Restore(table.name);
                        }}
                        aria-label="Restore table from R2"
                        title="Restore from R2"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* FTS5/Convert button - show for tables and virtual tables */}
                    {(table.type === "table" || table.type === "virtual") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-purple-100 hover:text-purple-700 dark:hover:bg-purple-900/30 dark:hover:text-purple-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          actionHandlers.onFts5(table.name, isFts5);
                        }}
                        aria-label={
                          isFts5
                            ? "Convert FTS5 to regular table"
                            : "FTS5 Search"
                        }
                        title={
                          isFts5
                            ? "Convert to Regular Table"
                            : "Convert to FTS5"
                        }
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* STRICT mode button - only show for non-strict regular tables */}
                    {!isStrict && table.type === "table" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-blue-500/10 hover:text-blue-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          actionHandlers.onStrict(table.name, isStrict);
                        }}
                        aria-label="Convert to STRICT mode"
                        title="Enable STRICT mode"
                      >
                        <Shield className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        actionHandlers.onDelete(table.name);
                      }}
                      aria-label="Delete table"
                      title="Delete"
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

      {tables.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          No tables to display
        </div>
      )}
    </div>
  );
}
