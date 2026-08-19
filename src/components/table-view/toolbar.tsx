import { ArrowLeft, RefreshCw, Download, Columns, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TableHeaderToolbarProps {
  tableName: string;
  databaseName: string;
  rowCount: number;
  fkFilter?: string | undefined;
  loadingRows: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onExportCSV: () => void;
  onAddColumn: () => void;
  onInsertRow: () => void;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function TableHeaderToolbar({
  tableName,
  databaseName,
  rowCount,
  fkFilter,
  loadingRows,
  onBack,
  onRefresh,
  onExportCSV,
  onAddColumn,
  onInsertRow,
}: TableHeaderToolbarProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-3xl font-semibold">{tableName}</h2>
          <p className="text-sm text-muted-foreground">
            {databaseName} • {rowCount} {rowCount === 1 ? "row" : "rows"}
            {fkFilter && ` • Filtered: ${fkFilter.replace(":", " = ")}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={loadingRows}
        >
          <RefreshCw className={`h-4 w-4 ${loadingRows ? "animate-spin" : ""}`} />
        </Button>
        <Button
          variant="outline"
          onClick={onExportCSV}
          disabled={rowCount === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
        <Button variant="outline" onClick={onAddColumn}>
          <Columns className="h-4 w-4 mr-2" />
          Add Column
        </Button>
        <Button onClick={onInsertRow}>
          <Plus className="h-4 w-4 mr-2" />
          Insert Row
        </Button>
      </div>
    </div>
  );
}

interface RowSearchToolbarProps {
  rowSearchQuery: string;
  onSearchChange: (query: string) => void;
  filteredCount: number;
  totalCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  bulkDeleting: boolean;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function RowSearchToolbar({
  rowSearchQuery,
  onSearchChange,
  filteredCount,
  totalCount,
  selectedCount,
  onSelectAll,
  onClearSelection,
  onBulkDelete,
  bulkDeleting,
}: RowSearchToolbarProps) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="row-search"
            name="row-search"
            autoComplete="off"
            placeholder="Filter rows..."
            value={rowSearchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 w-64"
            aria-label="Search rows"
          />
        </div>
        <Button variant="outline" onClick={onSelectAll}>
          Select All
        </Button>
        {selectedCount > 0 && (
          <>
            <Button variant="outline" onClick={onClearSelection}>
              Clear Selection
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedCount} row{selectedCount !== 1 ? "s" : ""} selected
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-sm text-muted-foreground mr-2">
          {rowSearchQuery.trim() ? (
            <>
              {filteredCount} of {totalCount} {totalCount === 1 ? "row" : "rows"}
            </>
          ) : (
            <>
              {totalCount} {totalCount === 1 ? "row" : "rows"}
            </>
          )}
        </div>
        {selectedCount > 0 && (
          <Button
            variant="destructive"
            onClick={onBulkDelete}
            disabled={bulkDeleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Selected
          </Button>
        )}
      </div>
    </div>
  );
}
