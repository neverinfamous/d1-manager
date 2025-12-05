import { ArrowRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import type { TableDependencies } from '@/services/api';

interface TableDependenciesViewProps {
  tableName: string;
  dependencies: TableDependencies;
}

export function TableDependenciesView({ tableName, dependencies }: TableDependenciesViewProps): React.JSX.Element | null {
  const hasOutbound = dependencies.outbound.length > 0;
  const hasInbound = dependencies.inbound.length > 0;
  const hasDependencies = hasOutbound || hasInbound;

  if (!hasDependencies) {
    return null;
  }

  // Helper to determine color based on cascade action
  const getCascadeColor = (action: string | null): string => {
    if (!action) return 'text-muted-foreground';
    const upper = action.toUpperCase();
    if (upper === 'CASCADE') return 'text-yellow-600 dark:text-yellow-500';
    if (upper === 'RESTRICT' || upper === 'NO ACTION') return 'text-red-600 dark:text-red-500';
    if (upper === 'SET NULL' || upper === 'SET DEFAULT') return 'text-blue-600 dark:text-blue-500';
    return 'text-muted-foreground';
  };

  // Helper to format cascade action text
  const formatCascadeAction = (action: string | null): string => {
    return action ? action.toUpperCase() : 'NO ACTION';
  };

  return (
    <div className="space-y-4">
      {/* Outbound dependencies (this table references others) */}
      {hasOutbound && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span>This table references:</span>
          </div>
          <div className="space-y-2 ml-6">
            {dependencies.outbound.map((dep, idx) => (
              <div
                key={`outbound-${String(idx)}`}
                className="flex items-start gap-2 text-sm p-2 rounded-md bg-muted/50"
              >
                <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${getCascadeColor(dep.onDelete)}`} />
                <div className="flex-1">
                  <span className="font-medium">{dep.table}</span>
                  <span className="text-muted-foreground"> via column </span>
                  <span className="font-mono text-xs bg-background px-1 py-0.5 rounded">{dep.column}</span>
                  <div className="text-xs text-muted-foreground mt-1">
                    On delete: <span className={getCascadeColor(dep.onDelete)}>{formatCascadeAction(dep.onDelete)}</span>
                    {dep.rowCount > 0 && (
                      <span> • {dep.rowCount.toLocaleString()} row{dep.rowCount !== 1 ? 's' : ''} in this table</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inbound dependencies (other tables reference this table) */}
      {hasInbound && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            <span>Tables that reference this table:</span>
          </div>
          <div className="space-y-2 ml-6">
            {dependencies.inbound.map((dep, idx) => (
              <div
                key={`inbound-${String(idx)}`}
                className="flex items-start gap-2 text-sm p-2 rounded-md bg-muted/50"
              >
                <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${getCascadeColor(dep.onDelete)}`} />
                <div className="flex-1">
                  <span className="font-medium">{dep.table}</span>
                  <span className="text-muted-foreground"> references via column </span>
                  <span className="font-mono text-xs bg-background px-1 py-0.5 rounded">{dep.column}</span>
                  <div className="text-xs text-muted-foreground mt-1">
                    On delete: <span className={getCascadeColor(dep.onDelete)}>{formatCascadeAction(dep.onDelete)}</span>
                    {dep.rowCount > 0 && dep.onDelete?.toUpperCase() === 'CASCADE' && (
                      <span className={getCascadeColor(dep.onDelete)}>
                        {' '}• Deleting will cascade to {dep.rowCount.toLocaleString()} row{dep.rowCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {dep.rowCount > 0 && dep.onDelete?.toUpperCase() !== 'CASCADE' && (
                      <span> • {dep.rowCount.toLocaleString()} dependent row{dep.rowCount !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warning summary */}
      {hasInbound && (
        <div className="rounded-md border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Deleting <span className="font-mono">{tableName}</span> will affect {dependencies.inbound.length} dependent table{dependencies.inbound.length !== 1 ? 's' : ''}
              </p>
              <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                {dependencies.inbound.some(d => d.onDelete?.toUpperCase() === 'CASCADE') && (
                  <span>Some rows will be automatically deleted due to CASCADE constraints.</span>
                )}
                {dependencies.inbound.some(d => d.onDelete?.toUpperCase() === 'RESTRICT' || d.onDelete?.toUpperCase() === 'NO ACTION') && (
                  <span>Some foreign key constraints may prevent deletion (RESTRICT/NO ACTION).</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

