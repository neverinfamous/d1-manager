import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SortOption {
  value: string;
  label: string;
}

interface GridSortSelectProps {
  options: SortOption[];
  value: string;
  direction: "asc" | "desc";
  onValueChange: (value: string) => void;
  onDirectionToggle: () => void;
}

/**
 * Sort control for Grid views - combines a dropdown for sort field
 * and a button to toggle sort direction
 */
export function GridSortSelect({
  options,
  value,
  direction,
  onValueChange,
  onDirectionToggle,
}: GridSortSelectProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 w-[130px]">
          <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={onDirectionToggle}
        className="h-9 w-9 p-0"
        aria-label={direction === "asc" ? "Sort ascending" : "Sort descending"}
        title={
          direction === "asc"
            ? "Sort ascending (click to reverse)"
            : "Sort descending (click to reverse)"
        }
      >
        {direction === "asc" ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
