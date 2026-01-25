import { Clock, Database, Zap, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { FTS5SearchResponse } from "@/services/fts5-types";

interface FTS5PerformanceMetricsProps {
  searchResponse: FTS5SearchResponse;
}

export function FTS5PerformanceMetrics({
  searchResponse,
}: FTS5PerformanceMetricsProps): React.JSX.Element {
  const { executionTime, total, results, meta } = searchResponse;

  const getPerformanceColor = (time: number): string => {
    if (time < 100) return "text-green-600 dark:text-green-400";
    if (time < 500) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getEfficiency = (): number => {
    if (!meta?.rowsScanned || meta.rowsScanned === 0) return 100;
    return Math.round((results.length / meta.rowsScanned) * 100);
  };

  const getEfficiencyColor = (efficiency: number): string => {
    if (efficiency > 10) return "text-green-600 dark:text-green-400";
    if (efficiency > 1) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getRecommendations = (): string[] => {
    const recommendations: string[] = [];

    if (executionTime > 500) {
      recommendations.push(
        "Query is slow. Consider adding a prefix index or using more specific terms.",
      );
    }

    if (getEfficiency() < 1) {
      recommendations.push(
        "Low efficiency. Try narrowing your search with additional terms or column filters.",
      );
    }

    if (total > 1000 && results.length === total) {
      recommendations.push(
        "Large result set. Consider using pagination or more specific search terms.",
      );
    }

    return recommendations;
  };

  const efficiency = getEfficiency();
  const recommendations = getRecommendations();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Execution Time
                </p>
                <p
                  className={`text-2xl font-bold ${getPerformanceColor(executionTime)}`}
                >
                  {executionTime.toFixed(1)}ms
                </p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Results Found
                </p>
                <p className="text-2xl font-bold">{total.toLocaleString()}</p>
              </div>
              <Database className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Rows Scanned
                </p>
                <p className="text-2xl font-bold">
                  {meta?.rowsScanned
                    ? meta.rowsScanned.toLocaleString()
                    : "N/A"}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Efficiency
                </p>
                <p
                  className={`text-2xl font-bold ${getEfficiencyColor(efficiency)}`}
                >
                  {efficiency}%
                </p>
              </div>
              <Zap className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {recommendations.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30">
          <CardContent className="pt-6">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Performance Recommendations
            </h4>
            <ul className="space-y-1">
              {recommendations.map((rec, index) => (
                <li
                  key={index}
                  className="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <span className="text-yellow-600 dark:text-yellow-400 mt-0.5">
                    •
                  </span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {meta?.tokenizerUsed && (
        <div className="text-xs text-muted-foreground">
          Tokenizer: {meta.tokenizerUsed}
        </div>
      )}
    </div>
  );
}
