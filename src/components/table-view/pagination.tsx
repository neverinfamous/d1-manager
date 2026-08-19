import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  onPageChange: (page: number) => void;
  start: number;
  end: number;
  totalCount: number | null;
  totalPages: number | null;
  hasMore: boolean;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function Pagination({
  page,
  onPageChange,
  start,
  end,
  totalCount,
  totalPages,
  hasMore,
}: PaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        Showing {start} to {end}
        {totalCount !== null && ` of ${totalCount.toLocaleString()}`} rows
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          Previous
        </Button>
        <div className="text-sm">
          Page {page}
          {totalPages && ` of ${String(totalPages)}`}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasMore}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
