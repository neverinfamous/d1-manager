import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, type D1Database, type ReadReplicationMode } from '../services/api';
import {
  Globe,
  RefreshCw,
  Loader2,
  AlertCircle,
  Info,
  Check,
  X,
  MapPin,
  Zap,
  BookOpen
} from 'lucide-react';

interface ReadReplicationInfoProps {
  databaseId: string;
  databaseName: string;
  initialReplicationMode?: ReadReplicationMode;
  onReplicationChange?: (mode: ReadReplicationMode) => void;
}

// D1 Read Replica Locations
const REPLICA_LOCATIONS = [
  { code: 'ENAM', name: 'Eastern North America' },
  { code: 'WNAM', name: 'Western North America' },
  { code: 'WEUR', name: 'Western Europe' },
  { code: 'EEUR', name: 'Eastern Europe' },
  { code: 'APAC', name: 'Asia Pacific' },
  { code: 'OC', name: 'Oceania' }
];

export function ReadReplicationInfo({ 
  databaseId, 
  initialReplicationMode,
  onReplicationChange 
}: ReadReplicationInfoProps) {
  const [replicationMode, setReplicationMode] = useState<ReadReplicationMode | undefined>(initialReplicationMode);
  const [loading, setLoading] = useState(!initialReplicationMode);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const dbInfo: D1Database = await api.getDatabaseInfo(databaseId);
      setReplicationMode(dbInfo.read_replication?.mode || 'disabled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load replication info');
    } finally {
      setLoading(false);
    }
  }, [databaseId]);

  useEffect(() => {
    if (!initialReplicationMode) {
      loadData();
    }
  }, [loadData, initialReplicationMode]);

  useEffect(() => {
    if (initialReplicationMode) {
      setReplicationMode(initialReplicationMode);
    }
  }, [initialReplicationMode]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleReplication = async () => {
    if (!replicationMode) return;
    
    const newMode: ReadReplicationMode = replicationMode === 'auto' ? 'disabled' : 'auto';
    
    try {
      setUpdating(true);
      setError(null);
      
      await api.setReadReplication(databaseId, newMode);
      setReplicationMode(newMode);
      onReplicationChange?.(newMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update replication');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading replication info...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-destructive mb-4">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isEnabled = replicationMode === 'auto';

  return (
    <div className="space-y-4">
      {/* Replication Status Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Read Replication</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
          <CardDescription>
            Global read replicas for improved read performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Status */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              {isEnabled ? (
                <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="h-5 w-5 text-green-500" />
                </div>
              ) : (
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <X className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-medium">
                  {isEnabled ? 'Enabled' : 'Disabled'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isEnabled 
                    ? 'Reads may be served by global replicas'
                    : 'All queries go to the primary database'}
                </p>
              </div>
            </div>
            <Button
              variant={isEnabled ? 'outline' : 'default'}
              size="sm"
              onClick={handleToggleReplication}
              disabled={updating}
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {isEnabled ? 'Disable' : 'Enable'}
            </Button>
          </div>

          {/* Benefits */}
          {isEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-md">
                <Zap className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Lower Latency</p>
                  <p className="text-xs text-muted-foreground">
                    Reads served from nearest replica
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-md">
                <Globe className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Higher Throughput</p>
                  <p className="text-xs text-muted-foreground">
                    Distributed load across replicas
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Replica Locations Card */}
      {isEnabled && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Replica Locations</CardTitle>
            </div>
            <CardDescription>
              D1 automatically replicates to these regions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {REPLICA_LOCATIONS.map((location) => (
                <div
                  key={location.code}
                  className="flex items-center gap-2 p-2 bg-muted/30 rounded-md text-sm"
                >
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="font-medium">{location.code}</span>
                  <span className="text-muted-foreground text-xs hidden sm:inline">
                    {location.name}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sessions API Info Card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Sessions API</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-md">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>For your own applications:</strong> Use the Sessions API 
                with D1 bindings to ensure sequential consistency when read 
                replication is enabled.
              </p>
              <p>
                The Sessions API uses bookmarks to track database state, 
                ensuring reads see at least the data from your previous writes.
              </p>
            </div>
          </div>
          
          <div className="bg-zinc-900 dark:bg-zinc-950 rounded-md p-3">
            <p className="text-xs text-muted-foreground mb-2">Example usage:</p>
            <code className="text-xs text-green-400 font-mono block whitespace-pre">{`const session = env.DB.withSession('first-primary');
const result = await session
  .prepare('SELECT * FROM users')
  .run();
const bookmark = session.getBookmark();`}</code>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <a
              href="https://developers.cloudflare.com/d1/best-practices/read-replication/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Read Replication Documentation →
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Limitations Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>Note:</strong> D1 Manager accesses databases via REST API, 
                which does not support the Sessions API. Query results shown here 
                may not reflect the full benefits of read replication.
              </p>
              <p>
                Sessions API is only available via D1 Worker bindings in your 
                own Cloudflare Workers applications.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

