import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { getJobList, type JobListItem, type D1Database } from '../services/api';
import { Loader2, CheckCircle2, XCircle, AlertCircle, FileText, Download, Upload, Trash2, Search, ArrowUp, ArrowDown, X, Database, RefreshCw, Pencil, Copy, Zap, Plus, Columns, Link2, Type, ListOrdered, Undo2, Wrench, Shield, ChevronUp } from 'lucide-react';
import { JobHistoryDialog } from './JobHistoryDialog';

interface JobHistoryProps {
  databases: D1Database[];
}

export function JobHistory({ databases }: JobHistoryProps): React.JSX.Element {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operationFilter, setOperationFilter] = useState<string>('all');
  const [databaseFilter, setDatabaseFilter] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<string>('all');
  const [jobIdSearch, setJobIdSearch] = useState<string>('');
  const [jobIdInput, setJobIdInput] = useState<string>('');
  const [minErrors, setMinErrors] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('started_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const limit = 20;

  // Scroll-to-top button visibility
  useEffect(() => {
    const handleScroll = (): void => {
      setShowScrollTop(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = useCallback((): void => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Debounce job ID search
  useEffect(() => {
    const timer = setTimeout(() => {
      setJobIdSearch(jobIdInput);
    }, 500);
    return () => clearTimeout(timer);
  }, [jobIdInput]);

  const loadJobs = async (reset = false): Promise<void> => {
    try {
      setLoading(true);
      setError('');

      const currentOffset = reset ? 0 : offset;
      const options: {
        limit: number;
        offset: number;
        status?: string;
        operation_type?: string;
        database_id?: string;
        start_date?: string;
        end_date?: string;
        job_id?: string;
        min_errors?: number;
        sort_by?: string;
        sort_order?: 'asc' | 'desc';
      } = {
        limit,
        offset: currentOffset,
      };

      if (statusFilter !== 'all') {
        options.status = statusFilter;
      }

      if (operationFilter !== 'all') {
        options.operation_type = operationFilter;
      }

      if (databaseFilter !== 'all') {
        options.database_id = databaseFilter;
      }

      // Handle date range based on preset
      if (datePreset !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        switch (datePreset) {
          case '24h':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = now;
        }
        
        options.start_date = startDate.toISOString();
      }

      if (jobIdSearch.trim()) {
        options.job_id = jobIdSearch.trim();
      }

      if (minErrors.trim() && !isNaN(parseInt(minErrors))) {
        options.min_errors = parseInt(minErrors);
      }

      options.sort_by = sortBy;
      options.sort_order = sortOrder;

      const data = await getJobList(options);

      if (reset) {
        setJobs(data.jobs);
        setOffset(limit);
      } else {
        setJobs([...jobs, ...data.jobs]);
        setOffset(currentOffset + limit);
      }

      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, operationFilter, databaseFilter, datePreset, jobIdSearch, minErrors, sortBy, sortOrder]);

  const handleLoadMore = (): void => {
    void loadJobs(false);
  };

  const handleResetFilters = (): void => {
    setStatusFilter('all');
    setOperationFilter('all');
    setDatabaseFilter('all');
    setDatePreset('all');
    setJobIdInput('');
    setJobIdSearch('');
    setMinErrors('');
    setSortBy('started_at');
    setSortOrder('desc');
  };

  const toggleSortOrder = (): void => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDuration = (startedAt: string, completedAt: string | null): string | null => {
    if (!completedAt) return null;
    
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const durationMs = end - start;
    
    if (durationMs < 0) return null;
    
    if (durationMs < 1000) {
      return `${String(durationMs)}ms`;
    } else if (durationMs < 60000) {
      const seconds = Math.floor(durationMs / 1000);
      const ms = durationMs % 1000;
      return ms > 0 ? `${String(seconds)}.${String(Math.floor(ms / 100))}s` : `${String(seconds)}s`;
    } else if (durationMs < 3600000) {
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      return seconds > 0 ? `${String(minutes)}m ${String(seconds)}s` : `${String(minutes)}m`;
    } else {
      const hours = Math.floor(durationMs / 3600000);
      const minutes = Math.floor((durationMs % 3600000) / 60000);
      return minutes > 0 ? `${String(hours)}h ${String(minutes)}m` : `${String(hours)}h`;
    }
  };

  const getStatusBadge = (status: string): React.JSX.Element => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Running
          </span>
        );
      case 'queued':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <AlertCircle className="h-3 w-3 mr-1" />
            Queued
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
            <X className="h-3 w-3 mr-1" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  const getOperationIcon = (operationType: string): React.JSX.Element => {
    switch (operationType) {
      // Database operations
      case 'database_create':
        return <Plus className="h-4 w-4" />;
      case 'database_export':
        return <Download className="h-4 w-4" />;
      case 'database_import':
        return <Upload className="h-4 w-4" />;
      case 'database_delete':
        return <Trash2 className="h-4 w-4" />;
      case 'database_rename':
        return <Pencil className="h-4 w-4" />;
      case 'database_optimize':
        return <Zap className="h-4 w-4" />;
      // Table operations
      case 'table_create':
        return <Plus className="h-4 w-4" />;
      case 'table_export':
        return <Download className="h-4 w-4" />;
      case 'table_delete':
        return <Trash2 className="h-4 w-4" />;
      case 'table_rename':
        return <Pencil className="h-4 w-4" />;
      case 'table_clone':
        return <Copy className="h-4 w-4" />;
      case 'table_strict':
        return <Shield className="h-4 w-4" />;
      case 'row_delete':
        return <Trash2 className="h-4 w-4" />;
      // Column operations
      case 'column_add':
        return <Plus className="h-4 w-4" />;
      case 'column_rename':
        return <Pencil className="h-4 w-4" />;
      case 'column_modify':
        return <Columns className="h-4 w-4" />;
      case 'column_delete':
        return <Trash2 className="h-4 w-4" />;
      // Foreign key operations
      case 'foreign_key_add':
        return <Link2 className="h-4 w-4" />;
      case 'foreign_key_modify':
        return <Link2 className="h-4 w-4" />;
      case 'foreign_key_delete':
        return <Trash2 className="h-4 w-4" />;
      // FTS5 operations
      case 'fts5_create':
      case 'fts5_create_from_table':
        return <Type className="h-4 w-4" />;
      case 'fts5_delete':
        return <Trash2 className="h-4 w-4" />;
      case 'fts5_rebuild':
        return <RefreshCw className="h-4 w-4" />;
      case 'fts5_optimize':
        return <Zap className="h-4 w-4" />;
      // Index operations
      case 'index_create':
        return <ListOrdered className="h-4 w-4" />;
      // Constraint operations
      case 'constraint_fix':
        return <Wrench className="h-4 w-4" />;
      // Undo operations
      case 'undo_restore':
        return <Undo2 className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getOperationLabel = (operationType: string): string => {
    switch (operationType) {
      // Database operations
      case 'database_create':
        return 'Database Create';
      case 'database_export':
        return 'Database Export';
      case 'database_import':
        return 'Database Import';
      case 'database_delete':
        return 'Database Delete';
      case 'database_rename':
        return 'Database Rename';
      case 'database_optimize':
        return 'Database Optimize';
      // Table operations
      case 'table_create':
        return 'Table Create';
      case 'table_export':
        return 'Table Export';
      case 'table_delete':
        return 'Table Delete';
      case 'table_rename':
        return 'Table Rename';
      case 'table_clone':
        return 'Table Clone';
      case 'table_strict':
        return 'Enable STRICT Mode';
      case 'row_delete':
        return 'Row Delete';
      // Column operations
      case 'column_add':
        return 'Column Add';
      case 'column_rename':
        return 'Column Rename';
      case 'column_modify':
        return 'Column Modify';
      case 'column_delete':
        return 'Column Delete';
      // Foreign key operations
      case 'foreign_key_add':
        return 'Foreign Key Add';
      case 'foreign_key_modify':
        return 'Foreign Key Modify';
      case 'foreign_key_delete':
        return 'Foreign Key Delete';
      // FTS5 operations
      case 'fts5_create':
        return 'FTS5 Create';
      case 'fts5_create_from_table':
        return 'FTS5 Create from Table';
      case 'fts5_delete':
        return 'FTS5 Delete';
      case 'fts5_rebuild':
        return 'FTS5 Rebuild';
      case 'fts5_optimize':
        return 'FTS5 Optimize';
      // Index operations
      case 'index_create':
        return 'Index Create';
      // Constraint operations
      case 'constraint_fix':
        return 'Constraint Fix';
      // Undo operations
      case 'undo_restore':
        return 'Undo Restore';
      default:
        return operationType;
    }
  };

  const getDatabaseName = (databaseId: string): string => {
    const database = databases.find((db) => db.uuid === databaseId);
    return database?.name || databaseId;
  };

  const hasMore = offset < total;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Job History</h2>
            <p className="text-sm text-muted-foreground mt-1">
              View history and event timeline for all bulk operations
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadJobs(true)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          {/* Row 1: Status, Operation Type, Database */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status Filter */}
            <div className="space-y-2">
              <Label htmlFor="status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="status-filter" aria-label="Status filter">
                  <SelectValue placeholder="Status: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Operation Type Filter */}
            <div className="space-y-2">
              <Label htmlFor="operation-filter">Operation Type</Label>
              <Select value={operationFilter} onValueChange={setOperationFilter}>
                <SelectTrigger id="operation-filter" aria-label="Operation type filter">
                  <SelectValue placeholder="Operation: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Operations</SelectItem>
                  {/* Database Operations */}
                  <SelectItem value="database_create">Database Create</SelectItem>
                  <SelectItem value="database_export">Database Export</SelectItem>
                  <SelectItem value="database_import">Database Import</SelectItem>
                  <SelectItem value="database_delete">Database Delete</SelectItem>
                  <SelectItem value="database_rename">Database Rename</SelectItem>
                  <SelectItem value="database_optimize">Database Optimize</SelectItem>
                  {/* Table Operations */}
                  <SelectItem value="table_create">Table Create</SelectItem>
                  <SelectItem value="table_export">Table Export</SelectItem>
                  <SelectItem value="table_delete">Table Delete</SelectItem>
                  <SelectItem value="table_rename">Table Rename</SelectItem>
                  <SelectItem value="table_clone">Table Clone</SelectItem>
                  <SelectItem value="table_strict">Enable STRICT Mode</SelectItem>
                  <SelectItem value="row_delete">Row Delete</SelectItem>
                  {/* Column Operations */}
                  <SelectItem value="column_add">Column Add</SelectItem>
                  <SelectItem value="column_rename">Column Rename</SelectItem>
                  <SelectItem value="column_modify">Column Modify</SelectItem>
                  <SelectItem value="column_delete">Column Delete</SelectItem>
                  {/* Foreign Key Operations */}
                  <SelectItem value="foreign_key_add">Foreign Key Add</SelectItem>
                  <SelectItem value="foreign_key_modify">Foreign Key Modify</SelectItem>
                  <SelectItem value="foreign_key_delete">Foreign Key Delete</SelectItem>
                  {/* FTS5 Operations */}
                  <SelectItem value="fts5_create">FTS5 Create</SelectItem>
                  <SelectItem value="fts5_create_from_table">FTS5 Create from Table</SelectItem>
                  <SelectItem value="fts5_delete">FTS5 Delete</SelectItem>
                  <SelectItem value="fts5_rebuild">FTS5 Rebuild</SelectItem>
                  <SelectItem value="fts5_optimize">FTS5 Optimize</SelectItem>
                  {/* Other Operations */}
                  <SelectItem value="index_create">Index Create</SelectItem>
                  <SelectItem value="constraint_fix">Constraint Fix</SelectItem>
                  <SelectItem value="undo_restore">Undo Restore</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Database Filter */}
            <div className="space-y-2">
              <Label htmlFor="database-filter">Database</Label>
              <Select value={databaseFilter} onValueChange={setDatabaseFilter}>
                <SelectTrigger id="database-filter" aria-label="Database filter">
                  <SelectValue placeholder="Database: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Databases</SelectItem>
                  {databases.map((db) => (
                    <SelectItem key={db.uuid} value={db.uuid}>
                      {db.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Date Range, Job ID Search, Min Errors */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Date Range Filter */}
            <div className="space-y-2">
              <Label htmlFor="date-range-filter">Date Range</Label>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger id="date-range-filter" aria-label="Date range filter">
                  <SelectValue placeholder="Date: All Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Job ID Search */}
            <div className="space-y-2">
              <Label htmlFor="job-id-search">Job ID</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="job-id-search"
                  name="job-id-search"
                  placeholder="Search by Job ID..."
                  value={jobIdInput}
                  onChange={(e) => setJobIdInput(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Min Errors Filter */}
            <div className="space-y-2">
              <Label htmlFor="min-errors">Min Errors</Label>
              <Input
                id="min-errors"
                name="min-errors"
                type="number"
                min="0"
                placeholder="Min errors..."
                value={minErrors}
                onChange={(e) => setMinErrors(e.target.value)}
              />
            </div>
          </div>

          {/* Row 3: Sort Controls and Reset */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sort By */}
            <div className="space-y-2">
              <Label htmlFor="sort-by-filter">Sort By</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger id="sort-by-filter" aria-label="Sort by">
                  <SelectValue placeholder="Sort: Started At" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="started_at">Started At</SelectItem>
                  <SelectItem value="completed_at">Completed At</SelectItem>
                  <SelectItem value="total_items">Total Items</SelectItem>
                  <SelectItem value="error_count">Error Count</SelectItem>
                  <SelectItem value="percentage">Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort Order */}
            <div className="space-y-2">
              <Label htmlFor="sort-order-button">Sort Order</Label>
              <Button
                id="sort-order-button"
                variant="outline"
                onClick={toggleSortOrder}
                className="w-full justify-start"
                aria-label="Toggle sort order"
              >
                {sortOrder === 'desc' ? (
                  <>
                    <ArrowDown className="mr-2 h-4 w-4" />
                    Descending
                  </>
                ) : (
                  <>
                    <ArrowUp className="mr-2 h-4 w-4" />
                    Ascending
                  </>
                )}
              </Button>
            </div>

            {/* Reset Filters */}
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={handleResetFilters}
                className="w-full"
              >
                <X className="mr-2 h-4 w-4" />
                Clear All Filters
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && jobs.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          Loading job history...
        </div>
      )}

      {/* Empty State */}
      {!loading && jobs.length === 0 && (
        <div className="bg-card rounded-lg border p-12 text-center text-muted-foreground">
          <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No jobs found</h3>
          <p>No bulk operations match the selected filters</p>
        </div>
      )}

      {/* Job List */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card
              key={job.job_id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedJobId(job.job_id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      {getOperationIcon(job.operation_type)}
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {getOperationLabel(job.operation_type)}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1 flex items-center gap-1">
                        <Database className="h-3 w-3" />
                        {getDatabaseName(job.database_id)}
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(job.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Started</div>
                    <div className="font-medium">
                      {formatTimestamp(job.started_at)}
                    </div>
                  </div>
                  {formatDuration(job.started_at, job.completed_at) && (
                    <div>
                      <div className="text-muted-foreground text-xs">Duration</div>
                      <div className="font-medium">{formatDuration(job.started_at, job.completed_at)}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-muted-foreground text-xs">Progress</div>
                    <div className={`font-medium ${job.percentage === 100 ? 'text-green-600 dark:text-green-400' : ''}`}>
                      {String(Math.round(job.percentage))}%
                    </div>
                  </div>
                  {job.total_items !== null && job.total_items > 1 && (
                    <div>
                      <div className="text-muted-foreground text-xs">Items</div>
                      <div className="font-medium">
                        {job.processed_items !== null ? `${job.processed_items.toLocaleString()} / ` : ''}{job.total_items.toLocaleString()}
                      </div>
                    </div>
                  )}
                  {job.error_count !== null && job.error_count > 0 && (
                    <div>
                      <div className="text-muted-foreground text-xs">Errors</div>
                      <div className="font-medium text-red-600 dark:text-red-400">
                        {job.error_count.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
                {/* Error message for failed jobs */}
                {job.status === 'failed' && job.error_message && (
                  <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
                    <div className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-red-700 dark:text-red-300 break-words">
                        {job.error_message}
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-3 text-xs text-muted-foreground font-mono">
                  Job ID: {job.job_id}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Load More Button */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button onClick={handleLoadMore} variant="outline" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Load More (${String(jobs.length)} of ${String(total)})`
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Job History Dialog */}
      {selectedJobId && (
        <JobHistoryDialog
          open={!!selectedJobId}
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <Button
          variant="default"
          size="sm"
          onClick={scrollToTop}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 h-10 px-4 rounded-full shadow-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <ChevronUp className="h-5 w-5" />
          <span className="text-sm font-medium">Back to Top</span>
        </Button>
      )}
    </div>
  );
}

