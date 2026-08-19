import { ArrowUp, ArrowDown, ArrowUpDown, Edit, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ColumnInfo, R2BackupStatus } from "./types";

interface SchemaPanelProps {
  schema: ColumnInfo[];
  schemaSortField: "name" | "type" | "nullable";
  schemaSortDirection: "asc" | "desc";
  onSchemaSort: (field: "name" | "type" | "nullable") => void;
  r2BackupStatus: R2BackupStatus | null;
  onRenameColumn: (col: ColumnInfo) => void;
  onModifyColumn: (col: ColumnInfo) => void;
  onDeleteColumn: (col: ColumnInfo) => void;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function SchemaPanel({
  schema,
  schemaSortField,
  schemaSortDirection,
  onSchemaSort,
  onRenameColumn,
  onModifyColumn,
  onDeleteColumn,
}: SchemaPanelProps) {
  const sortedSchema = [...schema].sort((a, b) => {
    let comparison = 0;
    switch (schemaSortField) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "type":
        comparison = (a.type ?? "").localeCompare(b.type ?? "");
        break;
      case "nullable":
        comparison = (a.notnull ?? 0) - (b.notnull ?? 0);
        break;
    }
    return schemaSortDirection === "asc" ? comparison : -comparison;
  });

  return (
    <div className="overflow-x-auto border rounded-lg bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            <th scope="col" className="px-4 py-3 text-left">
              <button
                onClick={() => onSchemaSort("name")}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                Column
                {schemaSortField === "name" ? (
                  schemaSortDirection === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-50" />
                )}
              </button>
            </th>
            <th scope="col" className="px-4 py-3 text-left">
              <button
                onClick={() => onSchemaSort("type")}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                Type
                {schemaSortField === "type" ? (
                  schemaSortDirection === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-50" />
                )}
              </button>
            </th>
            <th scope="col" className="px-4 py-3 text-left">
              <button
                onClick={() => onSchemaSort("nullable")}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                Nullable
                {schemaSortField === "nullable" ? (
                  schemaSortDirection === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-50" />
                )}
              </button>
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Default
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sortedSchema.map((col) => {
            const isGenerated = col.hidden === 2 || col.hidden === 3;
            const generatedType =
              col.hidden === 2 ? "VIRTUAL" : col.hidden === 3 ? "STORED" : null;

            return (
              <tr key={col.cid} className="hover:bg-muted/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{col.name}</span>
                    {col.pk > 0 && (
                      <span
                        className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded"
                        title="Primary Key"
                      >
                        PK
                      </span>
                    )}
                    {col.unique && (
                      <span
                        className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 rounded"
                        title="Unique constraint"
                      >
                        UNIQUE
                      </span>
                    )}
                    {isGenerated && (
                      <span
                        className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200 rounded"
                        title={`Generated column (${generatedType})`}
                      >
                        {generatedType}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{col.type || "ANY"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {col.notnull ? "NOT NULL" : "NULL"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {isGenerated && col.generatedExpression ? (
                    <span className="text-xs font-mono">= {col.generatedExpression}</span>
                  ) : col.dflt_value ? (
                    <span>{col.dflt_value}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onRenameColumn(col)}
                      title="Rename column"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onModifyColumn(col)}
                      title="Modify column type/constraints"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onDeleteColumn(col)}
                      disabled={schema.length === 1 || isGenerated}
                      title={
                        schema.length === 1
                          ? "Cannot delete the only column"
                          : isGenerated
                            ? "Cannot delete generated column directly"
                            : "Delete column"
                      }
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
    </div>
  );
}
