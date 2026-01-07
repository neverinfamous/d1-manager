/**
 * Health Dashboard Routes
 *
 * Provides a system health summary for D1 Manager including:
 * - Database count and replication status
 * - Total storage across all databases
 * - Backup health (scheduled, failed, orphaned)
 * - Recent job activity
 */

import type { Env, CorsHeaders, D1DatabaseInfo, ScheduledBackup } from '../types';
import { CF_API } from '../types';
import { logInfo, logWarning } from '../utils/error-logger';

// ============================================
// Types
// ============================================

/**
 * Database with low backup coverage
 */
interface LowBackupDatabase {
    id: string;
    name: string;
    hasScheduledBackup: boolean;
    lastBackupAt: string | null;
    daysSinceBackup: number | null;
}

/**
 * Failed backup information
 */
interface FailedBackupInfo {
    databaseId: string;
    databaseName: string;
    scheduleId: string;
    failedAt: string;
    jobId: string | null;
}

/**
 * Database replication status
 */
interface ReplicationInfo {
    id: string;
    name: string;
    replicationMode: 'auto' | 'disabled';
}

/**
 * Health summary response
 */
interface HealthSummary {
    databases: {
        total: number;
        withReplication: number;
    };
    storage: {
        totalBytes: number;
        avgPerDatabase: number;
    };
    backups: {
        scheduled: number;
        enabled: number;
        lastFailedCount: number;
        orphanedCount: number;
    };
    recentJobs: {
        last24h: number;
        last7d: number;
        failedLast24h: number;
    };
    lowBackupDatabases: LowBackupDatabase[];
    failedBackups: FailedBackupInfo[];
    replicationDisabled: ReplicationInfo[];
}

// ============================================
// Helpers
// ============================================

function jsonResponse(data: unknown, corsHeaders: CorsHeaders, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
        },
    });
}

function errorResponse(message: string, corsHeaders: CorsHeaders, status = 500): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
        },
    });
}

// ============================================
// Mock Data
// ============================================

const MOCK_HEALTH: HealthSummary = {
    databases: {
        total: 8,
        withReplication: 3,
    },
    storage: {
        totalBytes: 52428800, // 50 MB
        avgPerDatabase: 6553600, // ~6.25 MB
    },
    backups: {
        scheduled: 5,
        enabled: 4,
        lastFailedCount: 1,
        orphanedCount: 2,
    },
    recentJobs: {
        last24h: 18,
        last7d: 95,
        failedLast24h: 1,
    },
    lowBackupDatabases: [
        {
            id: 'mock-db-1',
            name: 'legacy-app',
            hasScheduledBackup: false,
            lastBackupAt: null,
            daysSinceBackup: null,
        },
        {
            id: 'mock-db-2',
            name: 'staging-data',
            hasScheduledBackup: true,
            lastBackupAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
            daysSinceBackup: 14,
        },
    ],
    failedBackups: [
        {
            databaseId: 'mock-db-3',
            databaseName: 'analytics-db',
            scheduleId: 'sched_mock_1',
            failedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            jobId: 'job_mock_1',
        },
    ],
    replicationDisabled: [
        { id: 'mock-db-4', name: 'dev-database', replicationMode: 'disabled' },
        { id: 'mock-db-5', name: 'test-database', replicationMode: 'disabled' },
        { id: 'mock-db-6', name: 'local-cache', replicationMode: 'disabled' },
    ],
};

// ============================================
// Data Fetching
// ============================================

/**
 * Fetch all databases from Cloudflare API with pagination
 */
async function fetchAllDatabases(
    env: Env
): Promise<D1DatabaseInfo[]> {
    const cfHeaders = {
        Authorization: `Bearer ${env.API_KEY}`,
        'Content-Type': 'application/json',
    };

    const databases: D1DatabaseInfo[] = [];
    let cursor: string | undefined;
    const perPage = 50;

    try {
        do {
            const url = new URL(`${CF_API}/accounts/${env.ACCOUNT_ID}/d1/database`);
            url.searchParams.set('per_page', String(perPage));
            if (cursor) {
                url.searchParams.set('cursor', cursor);
            }

            const response = await fetch(url.toString(), { headers: cfHeaders });

            if (!response.ok) {
                const errorText = await response.text();
                logWarning(`Failed to fetch databases: ${errorText}`, {
                    module: 'health',
                    operation: 'fetch_databases',
                    metadata: { status: response.status },
                });
                break;
            }

            const data: {
                result?: D1DatabaseInfo[];
                result_info?: { cursor?: string };
            } = await response.json();

            if (data.result) {
                databases.push(...data.result);
            }

            cursor = data.result_info?.cursor;
        } while (cursor);

        return databases;
    } catch (err) {
        logWarning(`Error fetching databases: ${err instanceof Error ? err.message : String(err)}`, {
            module: 'health',
            operation: 'fetch_databases',
            metadata: { error: err instanceof Error ? err.message : String(err) },
        });
        return [];
    }
}

/**
 * Get health summary from production data sources
 */
async function getHealthSummary(
    env: Env,
    corsHeaders: CorsHeaders,
    isLocalDev: boolean
): Promise<Response> {
    if (isLocalDev) {
        logInfo('Returning mock health data for local development', {
            module: 'health',
            operation: 'get_summary',
        });
        return jsonResponse(MOCK_HEALTH, corsHeaders);
    }

    try {
        // Batch parallel queries for performance (max 5-10 concurrent)
        // Each D1 query is wrapped to handle missing tables gracefully
        const [
            databases,
            scheduledBackupsResult,
            jobsResult,
            orphanedCountResult,
        ] = await Promise.all([
            // Query 1: Fetch all databases from Cloudflare API
            fetchAllDatabases(env),

            // Query 2: Scheduled backups (may not exist if feature not used)
            (async () => {
                try {
                    return await env.METADATA.prepare(`
                        SELECT 
                          id,
                          database_id,
                          database_name,
                          schedule,
                          enabled,
                          last_run_at,
                          last_status,
                          last_job_id
                        FROM scheduled_backups
                    `).all<ScheduledBackup>();
                } catch {
                    // Table doesn't exist yet - return empty results
                    return { results: [] as ScheduledBackup[] };
                }
            })(),

            // Query 3: Recent jobs count (may not exist if jobs table not created)
            (async () => {
                try {
                    return await env.METADATA.prepare(`
                        SELECT 
                          SUM(CASE WHEN datetime(created_at) > datetime('now', '-1 day') THEN 1 ELSE 0 END) as last24h,
                          SUM(CASE WHEN datetime(created_at) > datetime('now', '-7 days') THEN 1 ELSE 0 END) as last7d,
                          SUM(CASE WHEN datetime(created_at) > datetime('now', '-1 day') AND status = 'failed' THEN 1 ELSE 0 END) as failedLast24h
                        FROM jobs
                    `).first<{ last24h: number; last7d: number; failedLast24h: number }>();
                } catch {
                    // Table doesn't exist yet - return zeros
                    return { last24h: 0, last7d: 0, failedLast24h: 0 };
                }
            })(),

            // Query 4: Orphaned backup count (R2 backups for deleted databases)
            // Only query if R2 is configured - otherwise return 0
            (async () => {
                if (!env.BACKUP_BUCKET) return { count: 0 };
                try {
                    // List R2 objects and count unique database IDs that don't exist
                    const listed = await env.BACKUP_BUCKET.list({ limit: 1000 });
                    const dbIdsInR2 = new Set<string>();
                    for (const obj of listed.objects) {
                        // Path format: backups/{databaseId}/{timestamp}.sql
                        const parts = obj.key.split('/');
                        if (parts.length >= 2 && parts[1]) {
                            dbIdsInR2.add(parts[1]);
                        }
                    }
                    // Will be compared against current databases after the Promise.all
                    return { dbIds: dbIdsInR2 };
                } catch {
                    return { count: 0 };
                }
            })(),
        ]);

        // Process database data
        const dbCount = databases.length;
        const withReplication = databases.filter(
            (db) => db.read_replication?.mode === 'auto'
        ).length;

        // Calculate total storage from database file sizes
        const totalStorageBytes = databases.reduce(
            (sum, db) => sum + (db.file_size ?? 0),
            0
        );
        const avgPerDatabase = dbCount > 0 ? Math.round(totalStorageBytes / dbCount) : 0;

        // Process scheduled backups
        const scheduledBackups = scheduledBackupsResult.results;
        const enabledBackups = scheduledBackups.filter((b) => b.enabled === 1);
        const failedBackups = scheduledBackups.filter(
            (b) => b.last_status === 'failed'
        );

        // Build sets for lookups
        const currentDbIds = new Set(databases.map((db) => db.uuid));
        const dbsWithScheduledBackup = new Set(scheduledBackups.map((b) => b.database_id));

        // Calculate orphaned backups count
        let orphanedCount = 0;
        if ('dbIds' in orphanedCountResult && orphanedCountResult.dbIds instanceof Set) {
            for (const dbId of orphanedCountResult.dbIds) {
                if (!currentDbIds.has(dbId)) {
                    orphanedCount++;
                }
            }
        }

        // Find databases without backup coverage
        const lowBackupDatabases: LowBackupDatabase[] = databases
            .filter((db) => !dbsWithScheduledBackup.has(db.uuid))
            .slice(0, 10) // Limit to 10 for UI
            .map((db) => ({
                id: db.uuid,
                name: db.name,
                hasScheduledBackup: false,
                lastBackupAt: null,
                daysSinceBackup: null,
            }));

        // Map failed backups with details
        const failedBackupInfos: FailedBackupInfo[] = failedBackups.map((b) => ({
            databaseId: b.database_id,
            databaseName: b.database_name,
            scheduleId: b.id,
            failedAt: b.last_run_at ?? '',
            jobId: b.last_job_id,
        }));

        // Find databases without replication
        const replicationDisabled: ReplicationInfo[] = databases
            .filter((db) => db.read_replication?.mode !== 'auto')
            .slice(0, 10) // Limit to 10 for UI
            .map((db) => ({
                id: db.uuid,
                name: db.name,
                replicationMode: db.read_replication?.mode ?? 'disabled',
            }));

        const health: HealthSummary = {
            databases: {
                total: dbCount,
                withReplication,
            },
            storage: {
                totalBytes: totalStorageBytes,
                avgPerDatabase,
            },
            backups: {
                scheduled: scheduledBackups.length,
                enabled: enabledBackups.length,
                lastFailedCount: failedBackups.length,
                orphanedCount,
            },
            recentJobs: {
                last24h: jobsResult?.last24h ?? 0,
                last7d: jobsResult?.last7d ?? 0,
                failedLast24h: jobsResult?.failedLast24h ?? 0,
            },
            lowBackupDatabases,
            failedBackups: failedBackupInfos,
            replicationDisabled,
        };

        logInfo('Successfully retrieved health summary', {
            module: 'health',
            operation: 'get_summary',
            metadata: {
                databaseCount: dbCount,
                scheduledBackups: scheduledBackups.length,
                failedBackups: failedBackups.length,
            },
        });

        return jsonResponse(health, corsHeaders);
    } catch (err) {
        logWarning(`Failed to get health summary: ${err instanceof Error ? err.message : String(err)}`, {
            module: 'health',
            operation: 'get_summary',
            metadata: { error: err instanceof Error ? err.message : String(err) },
        });
        return errorResponse('Failed to get health summary', corsHeaders, 500);
    }
}

// ============================================
// Route Handler
// ============================================

/**
 * Handle health routes
 */
export async function handleHealthRoutes(
    request: Request,
    env: Env,
    url: URL,
    corsHeaders: CorsHeaders,
    isLocalDev: boolean,
    _userEmail: string
): Promise<Response | null> {
    const method = request.method;
    const path = url.pathname;

    // GET /api/health - Get health summary
    if (method === 'GET' && path === '/api/health') {
        return getHealthSummary(env, corsHeaders, isLocalDev);
    }

    // Route not handled
    return null;
}
