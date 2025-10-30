import { useState, useEffect } from 'react';
import { ArrowLeft, Table, RefreshCw, Plus, Search, Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { listTables, executeQuery, type TableInfo } from '@/services/api';
import { SchemaDesigner } from './SchemaDesigner';
import { QueryBuilder } from './QueryBuilder';

interface DatabaseViewProps {
  databaseId: string;
  databaseName: string;
  onBack: () => void;
  onSelectTable: (tableName: string) => void;
}

export function DatabaseView({ databaseId, databaseName, onBack, onSelectTable }: DatabaseViewProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSchemaDesigner, setShowSchemaDesigner] = useState(false);
  const [activeTab, setActiveTab] = useState<'tables' | 'builder'>('tables');

  useEffect(() => {
    loadTables();
  }, [databaseId]);

  const loadTables = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listTables(databaseId);
      setTables(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  const filteredTables = tables.filter(table =>
    table.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateTable = async (tableName: string, columns: any[]) => {
    // Generate CREATE TABLE SQL
    const columnDefs = columns.map(col => {
      let def = `${col.name} ${col.type}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.notNull && !col.primaryKey) def += ' NOT NULL';
      if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
      return def;
    }).join(', ');

    const sql = `CREATE TABLE ${tableName} (${columnDefs});`;

    // Execute the query
    await executeQuery(databaseId, sql);

    // Reload tables
    await loadTables();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-3xl font-semibold">{databaseName}</h2>
            <p className="text-sm text-muted-foreground">{databaseId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 mr-4">
            <Button
              variant={activeTab === 'tables' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('tables')}
            >
              <Table className="h-4 w-4 mr-2" />
              Tables
            </Button>
            <Button
              variant={activeTab === 'builder' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('builder')}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Query Builder
            </Button>
          </div>
          {activeTab === 'tables' && (
            <>
              <Button variant="outline" size="icon" onClick={loadTables}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={() => setShowSchemaDesigner(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Table
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'builder' ? (
        <QueryBuilder databaseId={databaseId} databaseName={databaseName} />
      ) : (
        <>
          {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredTables.length} {filteredTables.length === 1 ? 'table' : 'tables'}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Tables Grid */}
      {!loading && !error && (
        <>
          {filteredTables.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Table className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchQuery ? 'No tables found' : 'No tables yet'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery
                    ? 'Try adjusting your search query'
                    : 'Create your first table to get started'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setShowSchemaDesigner(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Table
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTables.map((table) => (
                <Card
                  key={table.name}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => onSelectTable(table.name)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Table className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{table.name}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type:</span>
                        <span className="font-medium capitalize">{table.type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Columns:</span>
                        <span className="font-medium">{table.ncol}</span>
                      </div>
                      {table.type === 'table' && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Without rowid:</span>
                            <span className="font-medium">{table.wr ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Strict:</span>
                            <span className="font-medium">{table.strict ? 'Yes' : 'No'}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
        </>
      )}

      {/* Schema Designer Dialog */}
      <SchemaDesigner
        open={showSchemaDesigner}
        onOpenChange={setShowSchemaDesigner}
        onCreateTable={handleCreateTable}
      />
    </div>
  );
}

