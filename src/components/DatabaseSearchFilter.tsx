import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface DatabaseSearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filteredCount: number;
  totalCount: number;
}

export function DatabaseSearchFilter({
  searchQuery,
  onSearchChange,
  filteredCount,
  totalCount,
}: DatabaseSearchFilterProps) {
  const isFiltering = searchQuery.trim().length > 0;
  
  return (
    <div className="flex items-center gap-4 my-6">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id="database-search"
          name="database-search"
          autoComplete="off"
          placeholder="Search databases..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
          aria-label="Search databases"
        />
      </div>
      <div className="text-sm text-muted-foreground">
        {isFiltering ? (
          <>
            {filteredCount} of {totalCount} {totalCount === 1 ? 'database' : 'databases'}
          </>
        ) : (
          <>
            {totalCount} {totalCount === 1 ? 'database' : 'databases'}
          </>
        )}
      </div>
    </div>
  );
}

