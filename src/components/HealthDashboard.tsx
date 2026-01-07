import { useState, useEffect, useCallback } from 'react'
import {
    RefreshCw,
    Loader2,
    Database,
    HardDrive,
    Cloud,
    Clock,
    AlertTriangle,
    CheckCircle,
    Activity,
    XCircle,
    CloudOff,
    Globe,
} from 'lucide-react'
import { Button } from './ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from './ui/card'
import {
    getHealthSummary,
    type HealthSummary,
    type LowBackupDatabase,
    type FailedBackupInfo,
    type ReplicationInfo,
} from '../services/healthApi'

export function HealthDashboard(): React.ReactElement {
    const [health, setHealth] = useState<HealthSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string>('')

    const loadHealth = useCallback(async (skipCache = false): Promise<void> => {
        try {
            setLoading(true)
            setError('')
            const data = await getHealthSummary(skipCache)
            setHealth(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load health data')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadHealth()
    }, [loadHealth])

    const formatBytes = (bytes: number): string => {
        if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`
        if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`
        if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
        return `${String(bytes)} B`
    }

    const formatDate = (dateString: string | null): string => {
        if (!dateString) return 'Never'
        return new Date(dateString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const getHealthScore = (): { score: number; label: string; color: string } => {
        if (!health) return { score: 0, label: 'Unknown', color: 'text-muted-foreground' }

        let issues = 0

        // Count issues
        if (health.lowBackupDatabases.length > 0) issues++
        if (health.failedBackups.length > 0) issues++
        if (health.recentJobs.failedLast24h > 0) issues++
        if (health.backups.orphanedCount > 0) issues++
        // More than half of databases without replication is concerning
        if (health.databases.total > 0 && health.databases.withReplication < health.databases.total / 2) issues++

        if (issues === 0) return { score: 100, label: 'Healthy', color: 'text-green-500' }
        if (issues === 1) return { score: 75, label: 'Good', color: 'text-yellow-500' }
        if (issues === 2) return { score: 50, label: 'Fair', color: 'text-orange-500' }
        return { score: 25, label: 'Needs Attention', color: 'text-red-500' }
    }

    const healthScore = getHealthScore()

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold">Health Dashboard</h2>
                    <p className="text-muted-foreground mt-1">
                        Overview of your D1 databases
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => void loadHealth(true)}
                    disabled={loading}
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
                    {error}
                </div>
            )}

            {/* Loading State */}
            {loading && !health && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* Health Content */}
            {health && (
                <>
                    {/* Health Score Banner */}
                    <Card className="bg-gradient-to-r from-muted/50 to-muted">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`text-5xl font-bold ${healthScore.color}`}>
                                        {healthScore.score}
                                    </div>
                                    <div>
                                        <div className={`text-xl font-semibold ${healthScore.color}`}>
                                            {healthScore.label}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            System Health Score
                                        </div>
                                    </div>
                                </div>
                                <Activity className={`h-12 w-12 ${healthScore.color}`} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Databases */}
                        <Card>
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2">
                                    <Database className="h-4 w-4 text-primary" />
                                    <CardTitle className="text-sm">Databases</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{health.databases.total}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {health.databases.withReplication} with replication enabled
                                </p>
                            </CardContent>
                        </Card>

                        {/* Storage */}
                        <Card>
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2">
                                    <HardDrive className="h-4 w-4 text-primary" />
                                    <CardTitle className="text-sm">Total Storage</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{formatBytes(health.storage.totalBytes)}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    ~{formatBytes(health.storage.avgPerDatabase)} avg per database
                                </p>
                            </CardContent>
                        </Card>

                        {/* Backups */}
                        <Card>
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2">
                                    <Cloud className="h-4 w-4 text-primary" />
                                    <CardTitle className="text-sm">Scheduled Backups</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{health.backups.enabled}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {health.backups.scheduled} configured, {health.backups.enabled} enabled
                                </p>
                                {health.backups.lastFailedCount > 0 && (
                                    <p className="text-xs text-destructive mt-1">
                                        {health.backups.lastFailedCount} failed
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Recent Jobs */}
                        <Card>
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-primary" />
                                    <CardTitle className="text-sm">Recent Jobs</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{health.recentJobs.last24h}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Last 24h ({health.recentJobs.last7d} last 7d)
                                </p>
                                {health.recentJobs.failedLast24h > 0 && (
                                    <p className="text-xs text-destructive mt-1">
                                        {health.recentJobs.failedLast24h} failed
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Detail Sections */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Low Backup Coverage */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <CloudOff className="h-5 w-5 text-orange-500" />
                                    <CardTitle>Low Backup Coverage</CardTitle>
                                </div>
                                <CardDescription>
                                    Databases without scheduled backups
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {health.lowBackupDatabases.length === 0 ? (
                                    <div className="flex items-center gap-2 text-muted-foreground py-4">
                                        <CheckCircle className="h-5 w-5 text-green-500" />
                                        <span>All databases have backup coverage</span>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {health.lowBackupDatabases.map((db: LowBackupDatabase) => (
                                            <div
                                                key={db.id}
                                                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium truncate">{db.name}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {db.hasScheduledBackup ? 'Backup scheduled' : 'No scheduled backup'}
                                                    </div>
                                                </div>
                                                <div className="text-right ml-4">
                                                    <div className="text-sm text-orange-500 font-medium">
                                                        {db.daysSinceBackup !== null ? `${String(db.daysSinceBackup)}d ago` : 'Never'}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        last backup
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Failed Backups */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <XCircle className="h-5 w-5 text-red-500" />
                                    <CardTitle>Failed Backups</CardTitle>
                                </div>
                                <CardDescription>
                                    Recent backup failures requiring attention
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {health.failedBackups.length === 0 ? (
                                    <div className="flex items-center gap-2 text-muted-foreground py-4">
                                        <CheckCircle className="h-5 w-5 text-green-500" />
                                        <span>No failed backups</span>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {health.failedBackups.map((backup: FailedBackupInfo) => (
                                            <div
                                                key={backup.scheduleId}
                                                className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium truncate flex items-center gap-2">
                                                        <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                                                        {backup.databaseName}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        Schedule: {backup.scheduleId}
                                                    </div>
                                                </div>
                                                <div className="text-right ml-4">
                                                    <div className="text-sm text-red-500 font-medium">
                                                        Failed
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {formatDate(backup.failedAt)}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Replication Status */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Globe className="h-5 w-5 text-blue-500" />
                                <CardTitle>Replication Status</CardTitle>
                            </div>
                            <CardDescription>
                                Databases without read replication enabled
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {health.replicationDisabled.length === 0 ? (
                                <div className="flex items-center gap-2 text-muted-foreground py-4">
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                    <span>All databases have replication enabled</span>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {health.replicationDisabled.map((db: ReplicationInfo) => (
                                        <div
                                            key={db.id}
                                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate">{db.name}</div>
                                            </div>
                                            <div className="text-sm text-muted-foreground ml-2">
                                                {db.replicationMode}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-3">
                                {health.databases.withReplication}/{health.databases.total} databases have read replication enabled
                            </p>
                        </CardContent>
                    </Card>

                    {/* System Status */}
                    <Card>
                        <CardHeader>
                            <CardTitle>System Status</CardTitle>
                            <CardDescription>Quick overview of system configuration</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="flex items-center gap-2">
                                    {health.backups.enabled > 0 ? (
                                        <CheckCircle className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <XCircle className="h-5 w-5 text-red-500" />
                                    )}
                                    <span className="text-sm">
                                        {health.backups.enabled}/{health.backups.scheduled} backups
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {health.lowBackupDatabases.length === 0 ? (
                                        <CheckCircle className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                                    )}
                                    <span className="text-sm">
                                        {health.lowBackupDatabases.length} without backup
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {health.backups.orphanedCount === 0 ? (
                                        <CheckCircle className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                                    )}
                                    <span className="text-sm">
                                        {health.backups.orphanedCount} orphaned backups
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {health.recentJobs.failedLast24h === 0 ? (
                                        <CheckCircle className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <XCircle className="h-5 w-5 text-red-500" />
                                    )}
                                    <span className="text-sm">
                                        {health.recentJobs.failedLast24h} failed jobs (24h)
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Globe className={`h-5 w-5 ${health.databases.withReplication > 0 ? 'text-blue-500' : 'text-muted-foreground'}`} />
                                    <span className="text-sm">
                                        {health.databases.withReplication} replicated
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}
