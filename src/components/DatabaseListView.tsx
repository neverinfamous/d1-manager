import { useState, useCallback } from 'react';
import { Globe, Sparkles, Copy, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DatabaseColorPicker } from './DatabaseColorPicker';
import { DatabaseActionButtons, type DatabaseActionHandlers } from './DatabaseActionButtons';
import type { D1Database, DatabaseColor } from '../services/api';

type SortField = 'name' | 'created_at' | 'file_size' | 'num_tables';
type SortDirection = 'asc' | 'desc';

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
  return sortDirection === 'asc' ? (
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
  className = '',
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
      aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="flex items-center">
        {children}
        <SortIcon field={field} sortField={sortField} sortDirection={sortDirection} />
      </span>
    </th>
  );
}

interface DatabaseListViewProps {
  databases: D1Database[];
  selectedDatabases: string[];
  databaseColors: Record<string, DatabaseColor>;
  onToggleSelection: (uuid: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onColorChange: (databaseId: string, color: DatabaseColor) => void;
  actionHandlers: DatabaseActionHandlers;
  copiedDbId: string | null;
  onCopyId: (dbId: string, e: React.MouseEvent) => void;
}

export function DatabaseListView({
  databases,
  selectedDatabases,
  databaseColors,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onColorChange,
  actionHandlers,
  copiedDbId,
  onCopyId,
}: DatabaseListViewProps): React.JSX.Element {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatSize = (bytes?: number): string => {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
  };

  const handleSort = useCallback((field: SortField): void => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const sortedDatabases = [...databases].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'created_at':
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'file_size':
        comparison = (a.file_size ?? 0) - (b.file_size ?? 0);
        break;
      case 'num_tables':
        comparison = (a.num_tables ?? 0) - (b.num_tables ?? 0);
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const allSelected = databases.length > 0 && selectedDatabases.length === databases.length;

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
                aria-label={allSelected ? 'Deselect all databases' : 'Select all databases'}
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
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              ID
            </th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Status
            </th>
            <SortableHeader
              field="file_size"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Size
            </SortableHeader>
            <SortableHeader
              field="num_tables"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Tables
            </SortableHeader>
            <SortableHeader
              field="created_at"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Created
            </SortableHeader>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sortedDatabases.map((db) => {
            const isSelected = selectedDatabases.includes(db.uuid);

            return (
              <tr
                key={db.uuid}
                className={`hover:bg-muted/50 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
              >
                {/* Checkbox */}
                <td className="px-3 py-2">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelection(db.uuid)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select database ${db.name}`}
                  />
                </td>

                {/* Color indicator */}
                <td className="px-1 py-2">
                  <DatabaseColorPicker
                    value={databaseColors[db.uuid] ?? null}
                    onChange={(color) => onColorChange(db.uuid, color)}
                  />
                </td>

                {/* Name */}
                <td className="px-3 py-2">
                  <button
                    onClick={() => actionHandlers.onBrowse(db)}
                    className="font-medium text-foreground hover:text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                  >
                    {db.name}
                  </button>
                </td>

                {/* ID */}
                <td className="px-3 py-2">
                  <button
                    onClick={(e) => onCopyId(db.uuid, e)}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group text-left font-mono text-xs"
                    title="Click to copy database ID"
                  >
                    <span className="max-w-[120px] truncate">{db.uuid}</span>
                    {copiedDbId === db.uuid ? (
                      <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                    ) : (
                      <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    )}
                  </button>
                </td>

                {/* Status badges */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {db.fts5_count !== undefined && db.fts5_count > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 flex items-center gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" />
                        FTS5
                      </span>
                    )}
                    {db.read_replication?.mode === 'auto' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-0.5">
                        <Globe className="h-2.5 w-2.5" />
                        Replicated
                      </span>
                    )}
                    {/* Production badge removed - D1 always returns "production" so it provides no useful information */}
                  </div>
                </td>

                {/* Size */}
                <td className="px-3 py-2 text-muted-foreground">
                  {formatSize(db.file_size)}
                </td>

                {/* Tables */}
                <td className="px-3 py-2 text-muted-foreground">
                  {db.num_tables ?? '—'}
                </td>

                {/* Created */}
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {formatDate(db.created_at)}
                </td>

                {/* Actions */}
                <td className="px-3 py-2">
                  <DatabaseActionButtons
                    database={db}
                    handlers={actionHandlers}
                    compact
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {databases.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          No databases to display
        </div>
      )}
    </div>
  );
}
