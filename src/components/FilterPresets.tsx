import { useState, useEffect } from "react";
import { Filter, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ColumnInfo, FilterCondition } from "@/services/api";

interface FilterPreset {
  id: string;
  name: string;
  description: string;
  filters: Record<string, FilterCondition>;
}

interface FilterPresetsProps {
  columns: ColumnInfo[];
  currentFilters: Record<string, FilterCondition>;
  onApplyPreset: (filters: Record<string, FilterCondition>) => void;
}

// Built-in preset templates
const getBuiltInPresets = (columns: ColumnInfo[]): FilterPreset[] => {
  const presets: FilterPreset[] = [];

  // Find date/time columns
  const dateColumns = columns.filter(
    (col) =>
      col.type.toUpperCase().includes("DATE") ||
      col.type.toUpperCase().includes("TIME"),
  );

  // Find numeric columns
  const numericColumns = columns.filter(
    (col) =>
      col.type.toUpperCase().includes("INT") ||
      col.type.toUpperCase().includes("REAL") ||
      col.type.toUpperCase().includes("NUMERIC"),
  );

  // Empty values preset
  if (columns.length > 0) {
    presets.push({
      id: "empty-values",
      name: "Empty Values",
      description: "Show rows with NULL values in any column",
      filters: Object.fromEntries(
        columns
          .slice(0, 5)
          .map((col) => [
            col.name,
            { type: "isNull" as const, logicOperator: "OR" as const },
          ]),
      ),
    });

    presets.push({
      id: "non-empty-values",
      name: "Non-Empty Values",
      description: "Show rows with all columns filled",
      filters: Object.fromEntries(
        columns
          .slice(0, 5)
          .map((col) => [col.name, { type: "isNotNull" as const }]),
      ),
    });
  }

  // Date-based presets
  const firstDateCol = dateColumns[0];
  if (firstDateCol) {
    const dateCol = firstDateCol.name;
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    presets.push({
      id: "last-7-days",
      name: "Last 7 Days",
      description: `Rows from the last 7 days (${dateCol})`,
      filters: {
        [dateCol]: {
          type: "gte",
          value: sevenDaysAgo.toISOString().split("T")[0] ?? "",
        },
      },
    });

    presets.push({
      id: "last-30-days",
      name: "Last 30 Days",
      description: `Rows from the last 30 days (${dateCol})`,
      filters: {
        [dateCol]: {
          type: "gte",
          value: thirtyDaysAgo.toISOString().split("T")[0] ?? "",
        },
      },
    });

    presets.push({
      id: "this-month",
      name: "This Month",
      description: `Rows from this month (${dateCol})`,
      filters: {
        [dateCol]: {
          type: "gte",
          value: startOfMonth.toISOString().split("T")[0] ?? "",
        },
      },
    });

    presets.push({
      id: "this-year",
      name: "This Year",
      description: `Rows from this year (${dateCol})`,
      filters: {
        [dateCol]: {
          type: "gte",
          value: startOfYear.toISOString().split("T")[0] ?? "",
        },
      },
    });
  }

  // Numeric range presets
  const firstNumCol = numericColumns[0];
  if (firstNumCol) {
    const numCol = firstNumCol.name;

    presets.push({
      id: "range-0-100",
      name: "Range 0-100",
      description: `${numCol} between 0 and 100`,
      filters: {
        [numCol]: {
          type: "between",
          value: 0,
          value2: 100,
        },
      },
    });

    presets.push({
      id: "positive-values",
      name: "Positive Values",
      description: `${numCol} greater than 0`,
      filters: {
        [numCol]: {
          type: "gt",
          value: 0,
        },
      },
    });
  }

  return presets;
};

export function FilterPresets({
  columns,
  currentFilters,
  onApplyPreset,
}: FilterPresetsProps): React.JSX.Element {
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");

  const builtInPresets = getBuiltInPresets(columns);
  const allPresets = [...builtInPresets, ...customPresets];

  // Load custom presets from localStorage on mount
  useEffect(() => {
    const loadPresets = (): void => {
      const stored = localStorage.getItem("d1-filter-presets");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as FilterPreset[];
          setCustomPresets(parsed);
        } catch {
          // Silently ignore parse errors
        }
      }
    };

    loadPresets();
  }, []);

  // Save custom presets to localStorage
  const saveCustomPresets = (presets: FilterPreset[]): void => {
    setCustomPresets(presets);
    localStorage.setItem("d1-filter-presets", JSON.stringify(presets));
  };

  const handleSavePreset = (): void => {
    if (!presetName.trim()) return;

    const newPreset: FilterPreset = {
      id: `custom-${String(Date.now())}`,
      name: presetName.trim(),
      description: presetDescription.trim() || "Custom filter preset",
      filters: currentFilters,
    };

    saveCustomPresets([...customPresets, newPreset]);
    setPresetName("");
    setPresetDescription("");
    setSaveDialogOpen(false);
  };

  const handleDeletePreset = (presetId: string): void => {
    const updated = customPresets.filter((p) => p.id !== presetId);
    saveCustomPresets(updated);
  };

  const handleApplyPreset = (presetId: string): void => {
    const preset = allPresets.find((p) => p.id === presetId);
    if (preset) {
      onApplyPreset(preset.filters);
    }
  };

  const hasActiveFilters = Object.keys(currentFilters).length > 0;

  return (
    <div className="flex items-center gap-2">
      <Select onValueChange={handleApplyPreset}>
        <SelectTrigger className="w-[200px] h-9 text-xs">
          <Filter className="h-3 w-3 mr-2" />
          <SelectValue placeholder="Apply preset..." />
        </SelectTrigger>
        <SelectContent>
          {builtInPresets.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Built-in Presets
              </div>
              {builtInPresets.map((preset) => (
                <SelectItem
                  key={preset.id}
                  value={preset.id}
                  className="text-xs"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {preset.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </>
          )}

          {customPresets.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                Custom Presets
              </div>
              {customPresets.map((preset) => (
                <SelectItem
                  key={preset.id}
                  value={preset.id}
                  className="text-xs"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex flex-col">
                      <span className="font-medium">{preset.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {preset.description}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePreset(preset.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </SelectItem>
              ))}
            </>
          )}

          {allPresets.length === 0 && (
            <div className="px-2 py-4 text-xs text-muted-foreground text-center">
              No presets available
            </div>
          )}
        </SelectContent>
      </Select>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            disabled={!hasActiveFilters}
            title={
              hasActiveFilters
                ? "Save current filters as preset"
                : "No active filters to save"
            }
          >
            <Save className="h-3 w-3 mr-2" />
            Save Preset
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Save Filter Preset</DialogTitle>
            <DialogDescription>
              Save your current filter configuration for quick reuse.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="preset-name">Preset Name</Label>
              <Input
                id="preset-name"
                placeholder="e.g., Active Users"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && presetName.trim()) {
                    handleSavePreset();
                  }
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="preset-description">Description (optional)</Label>
              <Input
                id="preset-description"
                placeholder="e.g., Users registered in the last 30 days"
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Current filters: {Object.keys(currentFilters).length} active
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
              Save Preset
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
