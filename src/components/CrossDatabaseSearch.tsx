import { useState } from 'react';
import { Search, X, Database, Table, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';

interface SearchResult {
  databaseId: string;
  databaseName: string;
  tableName: string;
  columnName: string;
  value: any;
  rowData: Record<string, any>;
}

interface CrossDatabaseSearchProps {
  databases: Array<{ uuid: string; name: string }>;
}

export function CrossDatabaseSearch({ databases }: CrossDatabaseSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Please enter a search query');
      return;
    }

    try {
      setSearching(true);
      setError(null);
      const searchResults: SearchResult[] = [];

      // Search across all databases in parallel
      const searchPromises = databases.map(async (db) => {
        try {
          // Get all tables in the database
          const tables = await api.listTables(db.uuid);

          // Search each table
          for (const table of tables) {
            try {
              // Get table schema to know which columns to search
              const schema = await api.getTableSchema(db.uuid, table.name);
              
              // Build WHERE clause for text columns
              const textColumns = schema.filter(col => 
                col.type.toUpperCase().includes('TEXT') || 
                col.type.toUpperCase().includes('VARCHAR') ||
                col.type === ''
              );

              if (textColumns.length === 0) continue;

              // Create search query
              const whereConditions = textColumns.map(col => 
                `${col.name} LIKE '%${searchQuery.replace(/'/g, "''")}%'`
              ).join(' OR ');

              const sql = `SELECT * FROM ${table.name} WHERE ${whereConditions} LIMIT 100`;
              
              // Execute search
              const response = await api.executeQuery(db.uuid, sql);
              
              if (response.results && response.results[0]?.results) {
                const rows = response.results[0].results;
                
                // Process results
                rows.forEach((row: any) => {
                  textColumns.forEach(col => {
                    const value = row[col.name];
                    if (value && String(value).toLowerCase().includes(searchQuery.toLowerCase())) {
                      searchResults.push({
                        databaseId: db.uuid,
                        databaseName: db.name,
                        tableName: table.name,
                        columnName: col.name,
                        value,
                        rowData: row
                      });
                    }
                  });
                });
              }
            } catch (tableError) {
              console.error(`Error searching table ${table.name}:`, tableError);
            }
          }
        } catch (dbError) {
          console.error(`Error searching database ${db.name}:`, dbError);
        }
      });

      await Promise.all(searchPromises);
      setResults(searchResults);
      
      if (searchResults.length === 0) {
        setError('No results found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    setSearchQuery('');
    setResults([]);
    setError(null);
    setIsExpanded(false);
  };

  const formatValue = (value: any): string => {
    if (value === null) return 'NULL';
    if (value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            <CardTitle>Search Across All Databases</CardTitle>
            {results.length > 0 && !isExpanded && (
              <span className="text-sm text-muted-foreground">
                ({results.length} {results.length === 1 ? 'result' : 'results'})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {results.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
              >
                Clear All
              </Button>
            )}
            {isExpanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent>
          {/* Search Input */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search for text across all databases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !searching) {
                    handleSearch();
                  }
                }}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={searching}>
              {searching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </Button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive text-destructive rounded-md text-sm mb-4">
              {error}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">
                  Found {results.length} {results.length === 1 ? 'result' : 'results'}
                </h4>
              </div>

              <div className="space-y-2">
                {results.map((result, index) => (
                  <Card key={index} className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        {/* Database and Table Info */}
                        <div className="flex items-center gap-2 text-sm">
                          <Database className="h-4 w-4 text-primary" />
                          <span className="font-medium">{result.databaseName}</span>
                          <span className="text-muted-foreground">/</span>
                          <Table className="h-4 w-4 text-primary" />
                          <span className="font-medium">{result.tableName}</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-muted-foreground">{result.columnName}</span>
                        </div>

                        {/* Matched Value */}
                        <div className="p-2 bg-background rounded border">
                          <p className="text-sm font-mono break-all">{formatValue(result.value)}</p>
                        </div>

                        {/* Full Row Data */}
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            View full row
                          </summary>
                          <div className="mt-2 p-2 bg-background rounded border">
                            <pre className="text-xs overflow-x-auto">
                              {JSON.stringify(result.rowData, null, 2)}
                            </pre>
                          </div>
                        </details>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty State when collapsed */}
          {results.length === 0 && !error && !searching && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Enter a search query to find data across all databases
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

