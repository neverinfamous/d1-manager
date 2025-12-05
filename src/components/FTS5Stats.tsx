import { BarChart3, HardDrive, FileText, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { FTS5Stats } from '@/services/fts5-types';

interface FTS5StatsProps {
  stats: FTS5Stats;
}

export function FTS5Stats({ stats }: FTS5StatsProps): React.JSX.Element {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i] ?? ''}`;
  };

  const getFragmentationColor = (fragmentation?: number): string => {
    if (!fragmentation) return 'bg-green-500';
    if (fragmentation < 20) return 'bg-green-500';
    if (fragmentation < 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getFragmentationLabel = (fragmentation?: number): string => {
    if (!fragmentation) return 'Excellent';
    if (fragmentation < 20) return 'Good';
    if (fragmentation < 50) return 'Fair';
    return 'Poor - Consider optimizing';
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Indexed Rows</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.rowCount.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Total searchable documents
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Index Size</CardTitle>
          <HardDrive className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatBytes(stats.indexSize)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Disk space used by index
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Row Size</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatBytes(stats.averageRowSize)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Average size per document
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Index Health</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{getFragmentationLabel(stats.fragmentation)}</span>
              {stats.fragmentation !== undefined && (
                <span className="text-xs text-muted-foreground">{stats.fragmentation}%</span>
              )}
            </div>
            {stats.fragmentation !== undefined ? (
              <Progress 
                value={100 - stats.fragmentation} 
                className={`h-2 ${getFragmentationColor(stats.fragmentation)}`}
              />
            ) : (
              <div className="h-2 w-full bg-green-500 rounded-full" />
            )}
          </div>
          {stats.lastOptimize && (
            <p className="text-xs text-muted-foreground mt-2">
              Last optimized: {new Date(stats.lastOptimize).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

