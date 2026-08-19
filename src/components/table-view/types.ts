import { type ColumnInfo, type R2BackupStatus } from "@/services/api";

export interface TableViewProps {
  databaseId: string;
  databaseName: string;
  tableName: string;
  navigationHistory?: { tableName: string; fkFilter?: string }[];
  fkFilter?: string;
  onBack: () => void;
  onNavigateToRelatedTable?: (
    refTable: string,
    refColumn: string,
    value: unknown,
  ) => void;
  onNavigateToHistoryTable?: (index: number) => void;
  onUndoableOperation?: () => void;
}

export type { ColumnInfo, R2BackupStatus };
