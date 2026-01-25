/**
 * AI Search Panel Component
 *
 * Provides semantic search over D1 database schemas and data.
 * Features:
 * - Compatibility analysis (table count, data size)
 * - Export to R2 for indexing
 * - Dual search modes (semantic + AI-powered)
 * - Instance management (list, sync)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Upload,
  RefreshCw,
  Loader2,
  Database,
  Table2,
  ExternalLink,
  Sparkles,
  FileText,
  CheckCircle,
  AlertTriangle,
  BrainCircuit,
  Clock,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  getCompatibility,
  exportDatabase,
  listInstances,
  syncInstance,
  semanticSearch,
  aiSearch,
  getDashboardUrl,
  type AISearchCompatibility,
  type AISearchInstance,
  type AISearchResponse,
  type AISearchResult,
} from "../services/aiSearchApi";

interface AISearchPanelProps {
  databaseId: string;
  databaseName: string;
}

export function AISearchPanel({
  databaseId,
  databaseName,
}: AISearchPanelProps): React.ReactElement {
  // State
  const [compatibility, setCompatibility] =
    useState<AISearchCompatibility | null>(null);
  const [instances, setInstances] = useState<AISearchInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dashboardUrl, setDashboardUrl] = useState("");

  // Search state
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"semantic" | "ai">("ai");
  const [searchResults, setSearchResults] = useState<AISearchResponse | null>(
    null,
  );

  // Load initial data
  const loadData = useCallback(
    async (skipCache = false): Promise<void> => {
      try {
        setLoading(true);
        setError("");

        const [compatData, instancesData, dashData] = await Promise.all([
          getCompatibility(databaseId, skipCache),
          listInstances(),
          getDashboardUrl(),
        ]);

        setCompatibility(compatData);
        setInstances(instancesData.instances);
        setDashboardUrl(dashData.url);

        // Auto-select first instance if available
        if (instancesData.instances.length > 0 && !selectedInstance) {
          setSelectedInstance(instancesData.instances[0]?.id ?? "");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load AI Search data",
        );
      } finally {
        setLoading(false);
      }
    },
    [databaseId, selectedInstance],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle export
  const handleExport = async (): Promise<void> => {
    try {
      setExporting(true);
      setError("");
      setSuccess("");

      const result = await exportDatabase(databaseId, databaseName);

      setSuccess(
        `Exported ${String(result.filesExported.length)} files to ${result.exportPath}. Create an AI Search instance to enable semantic queries.`,
      );

      // Reload compatibility to show updated lastExport
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Handle sync
  const handleSync = async (): Promise<void> => {
    if (!selectedInstance) return;

    try {
      setSyncing(true);
      setError("");
      setSuccess("");

      const result = await syncInstance(selectedInstance);

      if (result.success) {
        setSuccess(
          "Sync triggered successfully. Indexing will complete shortly.",
        );
      } else {
        setError(result.error ?? "Sync failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  // Handle search
  const handleSearch = async (): Promise<void> => {
    if (!query.trim() || !selectedInstance) {
      setError("Enter a query and select an AI Search instance");
      return;
    }

    try {
      setSearching(true);
      setError("");
      setSearchResults(null);

      const results =
        searchMode === "ai"
          ? await aiSearch(selectedInstance, query)
          : await semanticSearch(selectedInstance, query);

      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  // Format bytes helper
  const formatBytes = (bytes: number): string => {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${String(bytes)} B`;
  };

  // Format date helper
  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <BrainCircuit className="h-8 w-8 text-primary" />
            AI Search
          </h2>
          <p className="text-muted-foreground mt-1">
            Semantic search over database schemas and data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void loadData(true)}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          {dashboardUrl && (
            <Button variant="outline" asChild>
              <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Dashboard
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Loading */}
      {loading && !compatibility && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Content */}
      {compatibility && (
        <>
          {/* Compatibility Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    Database: {databaseName}
                  </CardTitle>
                  <CardDescription>
                    Export database schema and data for AI Search indexing
                  </CardDescription>
                </div>
                <Button
                  onClick={() => void handleExport()}
                  disabled={exporting}
                  className="min-w-32"
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {exporting ? "Exporting..." : "Export to R2"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Table2 className="h-4 w-4" />
                    Tables
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {compatibility.totalTables}
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    Total Rows
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {compatibility.totalRows.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Database className="h-4 w-4" />
                    Est. Export Size
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {formatBytes(
                      compatibility.exportableContent.schemaSize +
                        compatibility.exportableContent.dataSize,
                    )}
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Last Export
                  </div>
                  <div className="text-lg font-medium mt-1">
                    {formatDate(compatibility.lastExport)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Search Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                Search Database
              </CardTitle>
              <CardDescription>
                Ask questions about your database schema and data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Instance Selector */}
              {instances.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="instance-select"
                    className="text-sm font-medium"
                  >
                    AI Search Instance
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="instance-select"
                      value={selectedInstance}
                      onChange={(e) => setSelectedInstance(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {instances.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.id} {inst.status && `(${inst.status})`}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      onClick={() => void handleSync()}
                      disabled={syncing || !selectedInstance}
                      title="Trigger re-indexing"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-muted/50 p-4 rounded-lg text-sm">
                  <p className="font-medium">No AI Search instances found</p>
                  <p className="text-muted-foreground mt-1">
                    Export your database to R2, then create an AI Search
                    instance in the{" "}
                    <a
                      href={dashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Cloudflare Dashboard
                    </a>{" "}
                    pointing to your backup bucket.
                  </p>
                </div>
              )}

              {/* Search Mode Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={searchMode === "ai" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSearchMode("ai")}
                  className="flex-1"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Search
                </Button>
                <Button
                  variant={searchMode === "semantic" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSearchMode("semantic")}
                  className="flex-1"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Semantic Search
                </Button>
              </div>

              {/* Search Input */}
              <div className="flex gap-2">
                <Input
                  id="search-query"
                  placeholder={
                    searchMode === "ai"
                      ? 'Ask about your database, e.g., "How do I query users by email?"'
                      : "Search for tables, columns, or concepts..."
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSearch();
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={() => void handleSearch()}
                  disabled={searching || !selectedInstance}
                >
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Search Results */}
              {searchResults && (
                <div className="space-y-4 mt-4">
                  {/* AI Response */}
                  {searchResults.response && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-primary mb-2">
                        <Sparkles className="h-4 w-4" />
                        AI Response
                      </div>
                      <div className="text-sm whitespace-pre-wrap">
                        {searchResults.response}
                      </div>
                    </div>
                  )}

                  {/* Source Documents */}
                  {searchResults.data.length > 0 && (
                    <div>
                      <div className="text-sm font-medium mb-2">
                        Sources ({searchResults.data.length} results)
                      </div>
                      <div className="space-y-2">
                        {searchResults.data.map((result: AISearchResult) => (
                          <div
                            key={result.file_id}
                            className="p-3 bg-muted/50 rounded-lg"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm">
                                {result.filename}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Score: {(result.score * 100).toFixed(0)}%
                              </span>
                            </div>
                            {result.content.length > 0 && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {result.content[0]?.text}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.data.length === 0 &&
                    !searchResults.response && (
                      <div className="text-center text-muted-foreground py-4">
                        No results found. Try a different query or export your
                        database first.
                      </div>
                    )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Setup Instructions */}
          {!compatibility.lastExport && instances.length === 0 && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
                <CardDescription>
                  Set up AI Search for your database in 3 steps
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-3 text-sm">
                  <li>
                    <strong>Export database</strong> - Click &quot;Export to
                    R2&quot; to create searchable documents from your schema and
                    data
                  </li>
                  <li>
                    <strong>Create AI Search instance</strong> - In the{" "}
                    <a
                      href={dashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Cloudflare Dashboard
                    </a>
                    , create an AI Search pointing to your backup bucket
                  </li>
                  <li>
                    <strong>Search</strong> - Return here and start asking
                    questions about your database
                  </li>
                </ol>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
