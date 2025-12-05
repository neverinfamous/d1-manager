import { Database, Code, Pencil, Copy, Upload, Download, Zap, Sparkles, Cloud, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { D1Database } from '../services/api';

export interface DatabaseActionHandlers {
  onBrowse: (db: D1Database) => void;
  onQuery: (db: D1Database) => void;
  onRename: (db: D1Database) => void;
  onClone: (db: D1Database) => void;
  onImport: (db: D1Database) => void;
  onDownload: (db: D1Database) => Promise<void>;
  onOptimize: (db: D1Database) => void;
  onFts5: (db: D1Database) => void;
  onBackup: (db: D1Database) => void;
  onRestore: (db: D1Database) => void;
  onDelete: (db: D1Database) => void;
}

interface DatabaseActionButtonsProps {
  database: D1Database;
  handlers: DatabaseActionHandlers;
  /** Compact mode for list view - displays buttons in a single row with smaller sizing */
  compact?: boolean;
}

export function DatabaseActionButtons({
  database,
  handlers,
  compact = false,
}: DatabaseActionButtonsProps): React.JSX.Element {
  const buttonSize = compact ? 'sm' : 'sm';
  const iconSize = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';

  // In compact mode, all buttons are in a single row
  // In grid mode, buttons are arranged in a 4-column grid
  const containerClass = compact
    ? 'flex items-center gap-1 flex-wrap'
    : 'grid grid-cols-4 gap-1.5';

  return (
    <div className={containerClass}>
      {/* Browse */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={(e) => {
          e.stopPropagation();
          handlers.onBrowse(database);
        }}
        aria-label="Browse database"
        title="Browse"
        className={compact ? 'h-7 w-7 p-0' : undefined}
      >
        <Database className={iconSize} />
      </Button>

      {/* Query */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={(e) => {
          e.stopPropagation();
          handlers.onQuery(database);
        }}
        aria-label="Open query console"
        title="Query"
        className={compact ? 'h-7 w-7 p-0' : undefined}
      >
        <Code className={iconSize} />
      </Button>

      {/* Rename */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={(e) => {
          e.stopPropagation();
          handlers.onRename(database);
        }}
        aria-label="Rename database"
        title="Rename"
        className={compact ? 'h-7 w-7 p-0' : undefined}
      >
        <Pencil className={iconSize} />
      </Button>

      {/* Clone */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={(e) => {
          e.stopPropagation();
          handlers.onClone(database);
        }}
        aria-label="Clone database"
        title="Clone"
        className={compact ? 'h-7 w-7 p-0' : undefined}
      >
        <Copy className={iconSize} />
      </Button>

      {/* Import */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={(e) => {
          e.stopPropagation();
          handlers.onImport(database);
        }}
        aria-label="Import into database"
        title="Import"
        className={compact ? 'h-7 w-7 p-0' : undefined}
      >
        <Upload className={iconSize} />
      </Button>

      {/* Download */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={(e) => {
          e.stopPropagation();
          void handlers.onDownload(database);
        }}
        aria-label="Download database"
        title="Download"
        className={compact ? 'h-7 w-7 p-0' : undefined}
      >
        <Download className={iconSize} />
      </Button>

      {/* Optimize */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={(e) => {
          e.stopPropagation();
          handlers.onOptimize(database);
        }}
        aria-label="Optimize database"
        title="Optimize"
        className={compact ? 'h-7 w-7 p-0' : undefined}
      >
        <Zap className={iconSize} />
      </Button>

      {/* FTS5 Search */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={(e) => {
          e.stopPropagation();
          handlers.onFts5(database);
        }}
        aria-label="Full-text search (FTS5)"
        title="FTS5 Search"
        className={`hover:bg-purple-100 hover:text-purple-700 hover:border-purple-300 dark:hover:bg-purple-900/30 dark:hover:text-purple-300 dark:hover:border-purple-700 ${compact ? 'h-7 w-7 p-0' : ''}`}
      >
        <Sparkles className={iconSize} />
      </Button>

      {/* R2 Backup */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={(e) => {
          e.stopPropagation();
          handlers.onBackup(database);
        }}
        aria-label="Backup to R2"
        title="Backup to R2"
        className={`hover:bg-blue-100 hover:text-blue-700 hover:border-blue-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 dark:hover:border-blue-700 ${compact ? 'h-7 w-7 p-0' : ''}`}
      >
        <Cloud className={iconSize} />
      </Button>

      {/* R2 Restore */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={(e) => {
          e.stopPropagation();
          handlers.onRestore(database);
        }}
        aria-label="Restore from R2"
        title="Restore from R2"
        className={`hover:bg-green-100 hover:text-green-700 hover:border-green-300 dark:hover:bg-green-900/30 dark:hover:text-green-300 dark:hover:border-green-700 ${compact ? 'h-7 w-7 p-0' : ''}`}
      >
        <RefreshCw className={iconSize} />
      </Button>

      {/* Delete */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={(e) => {
          e.stopPropagation();
          handlers.onDelete(database);
        }}
        aria-label="Delete database"
        title="Delete"
        className={`hover:bg-destructive/10 hover:text-destructive hover:border-destructive ${compact ? 'h-7 w-7 p-0' : 'col-span-2'}`}
      >
        <Trash2 className={iconSize} />
        {!compact && <span className="ml-1">Delete</span>}
      </Button>
    </div>
  );
}

