import { ChevronRight, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BreadcrumbNavigationProps {
  databaseName: string;
  navigationHistory: { tableName: string; displayName?: string }[];
  onNavigateToDatabase: () => void;
  onNavigateToTable: (index: number) => void;
  onGoBack?: () => void;
}

export function BreadcrumbNavigation({
  databaseName,
  navigationHistory,
  onNavigateToDatabase,
  onNavigateToTable,
  onGoBack,
}: BreadcrumbNavigationProps): React.JSX.Element {
  // Limit to last 5 tables to prevent overflow
  const displayHistory = navigationHistory.slice(-5);
  const hasMore = navigationHistory.length > 5;

  return (
    <div className="flex items-center gap-2 mb-4 px-4 py-2 bg-muted/30 rounded-lg border">
      {/* Back Button */}
      {onGoBack && navigationHistory.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onGoBack}
          className="mr-2"
          title="Go back (Alt+Left)"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Database Home */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onNavigateToDatabase}
        className="flex items-center gap-1 hover:bg-muted"
      >
        <Home className="h-4 w-4" />
        <span className="font-medium">{databaseName}</span>
      </Button>

      {/* Navigation Path */}
      {displayHistory.length > 0 && (
        <>
          {hasMore && (
            <>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">...</span>
            </>
          )}
          {displayHistory.map((item, index) => {
            const actualIndex = hasMore
              ? navigationHistory.length - displayHistory.length + index
              : index;
            const isLast = index === displayHistory.length - 1;

            return (
              <div key={actualIndex} className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <Button
                  variant={isLast ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => onNavigateToTable(actualIndex)}
                  disabled={isLast}
                  className={isLast ? "font-semibold" : "hover:bg-muted"}
                >
                  {item.displayName || item.tableName}
                </Button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
