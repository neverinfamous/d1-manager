import { useState, useEffect } from 'react';
import { Search, Loader2, Download, FileText, LayoutGrid, LayoutList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FTS5SearchResults } from './FTS5SearchResults';
import { FTS5PerformanceMetrics } from './FTS5PerformanceMetrics';
import { searchFTS5 } from '@/services/api';
import type { FTS5SearchResponse, FTS5SearchParams } from '@/services/fts5-types';
import { SEARCH_OPERATORS as OPERATORS } from '@/services/fts5-types';

interface FTS5SearchDialogProps {
  open: boolean;
  onClose: () => void;
  databaseId: string;
  tableName: string;
  columns: string[];
}

export function FTS5SearchDialog({
  open,
  onClose,
  databaseId,
  tableName,
  columns,
}: FTS5SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [limit, setLimit] = useState(50);
  const [rankingFunction, setRankingFunction] = useState<'bm25' | 'bm25custom'>('bm25');
  const [bm25K1, setBm25K1] = useState(1.2);
  const [bm25B, setBm25B] = useState(0.75);
  const [includeSnippet, setIncludeSnippet] = useState(true);
  const [snippetTokenCount, setSnippetTokenCount] = useState(32);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searching, setSearching] = useState(false);
  const [searchResponse, setSearchResponse] = useState<FTS5SearchResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      // Reset form when dialog opens
      setQuery('');
      setSearchResponse(null);
      setError('');
    }
  }, [open]);

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    try {
      setSearching(true);
      setError('');

      const params: FTS5SearchParams = {
        query: query.trim(),
        limit,
        rankingFunction,
        includeSnippet,
      };

      if (selectedColumns.length > 0) {
        params.columns = selectedColumns;
      }

      if (rankingFunction === 'bm25custom') {
        params.bm25_k1 = bm25K1;
        params.bm25_b = bm25B;
      }

      if (includeSnippet) {
        params.snippetOptions = {
          tokenCount: snippetTokenCount,
          startMark: '<mark>',
          endMark: '</mark>',
          ellipsis: '...',
        };
      }

      const response = await searchFTS5(databaseId, tableName, params);
      setSearchResponse(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const insertOperator = (operator: string) => {
    setQuery(prev => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + operator + ' ');
  };

  const toggleColumn = (column: string) => {
    setSelectedColumns(prev =>
      prev.includes(column)
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  const exportResults = () => {
    if (!searchResponse || searchResponse.results.length === 0) return;

    const headers = Object.keys(searchResponse.results[0].row);
    const csv = [
      headers.join(','),
      ...searchResponse.results.map(result => 
        headers.map(h => {
          const val = result.row[h];
          const str = val !== null && val !== undefined ? String(val) : '';
          return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableName}_search_results.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const copySQLQuery = () => {
    const columnsFilter = selectedColumns.length > 0
      ? `{${selectedColumns.join(' ')}} : `
      : '';
    
    const rankFunc = rankingFunction === 'bm25custom'
      ? `bm25("${tableName}", ${bm25K1}, ${bm25B})`
      : `bm25("${tableName}")`;

    const sql = `SELECT *, ${rankFunc} AS rank FROM "${tableName}" WHERE "${tableName}" MATCH '${columnsFilter}${query}' ORDER BY rank LIMIT ${limit};`;
    
    navigator.clipboard.writeText(sql);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Search "{tableName}"</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-6 flex-1 overflow-hidden">
          {/* Left Sidebar - Filters */}
          <div className="col-span-1 space-y-4 overflow-y-auto pr-2">
            {/* Column Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Search In Columns</Label>
              <p className="text-xs text-muted-foreground">All columns if none selected</p>
              <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2">
                {columns.map(col => (
                  <div key={col} className="flex items-center space-x-2">
                    <Checkbox
                      id={`col-filter-${col}`}
                      checked={selectedColumns.includes(col)}
                      onCheckedChange={() => toggleColumn(col)}
                      disabled={searching}
                    />
                    <Label htmlFor={`col-filter-${col}`} className="text-sm font-normal cursor-pointer">
                      {col}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Ranking Options */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Ranking Function</Label>
              <RadioGroup value={rankingFunction} onValueChange={(v) => setRankingFunction(v as 'bm25' | 'bm25custom')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="bm25" id="bm25" />
                  <Label htmlFor="bm25" className="text-sm font-normal">BM25 (default)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="bm25custom" id="bm25custom" />
                  <Label htmlFor="bm25custom" className="text-sm font-normal">BM25 Custom</Label>
                </div>
              </RadioGroup>

              {rankingFunction === 'bm25custom' && (
                <div className="ml-6 space-y-2">
                  <div>
                    <Label htmlFor="bm25-k1" className="text-xs">k1 (term frequency)</Label>
                    <Input
                      id="bm25-k1"
                      type="number"
                      step="0.1"
                      value={bm25K1}
                      onChange={(e) => setBm25K1(parseFloat(e.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bm25-b" className="text-xs">b (length normalization)</Label>
                    <Input
                      id="bm25-b"
                      type="number"
                      step="0.05"
                      value={bm25B}
                      onChange={(e) => setBm25B(parseFloat(e.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Result Options */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Results</Label>
              <div>
                <Label htmlFor="result-limit" className="text-xs">Limit</Label>
                <Input
                  id="result-limit"
                  type="number"
                  min="1"
                  max="1000"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Snippet Options */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-snippet"
                  checked={includeSnippet}
                  onCheckedChange={(checked) => setIncludeSnippet(checked === true)}
                />
                <Label htmlFor="include-snippet" className="text-sm font-semibold">Show Snippets</Label>
              </div>
              {includeSnippet && (
                <div className="ml-6">
                  <Label htmlFor="snippet-tokens" className="text-xs">Token Count</Label>
                  <Input
                    id="snippet-tokens"
                    type="number"
                    min="8"
                    max="128"
                    value={snippetTokenCount}
                    onChange={(e) => setSnippetTokenCount(parseInt(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="col-span-3 flex flex-col space-y-4 overflow-hidden">
            {/* Search Input */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter search query (e.g., apple AND orange, &quot;exact phrase&quot;, prefix*)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={searching}
                  className="flex-1"
                />
                <Button onClick={handleSearch} disabled={searching || !query.trim()}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {/* Quick Operators */}
              <div className="flex flex-wrap gap-2">
                {OPERATORS.slice(0, 6).map(op => (
                  <Button
                    key={op.value}
                    variant="outline"
                    size="sm"
                    onClick={() => insertOperator(op.value)}
                    disabled={searching}
                    title={op.description}
                  >
                    {op.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Performance Metrics */}
            {searchResponse && (
              <FTS5PerformanceMetrics searchResponse={searchResponse} />
            )}

            {/* Results */}
            {searchResponse && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">
                    {searchResponse.total} result{searchResponse.total !== 1 ? 's' : ''} found
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewMode(viewMode === 'card' ? 'table' : 'card')}
                    >
                      {viewMode === 'card' ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="sm" onClick={copySQLQuery}>
                      <FileText className="h-4 w-4 mr-1" />
                      Copy SQL
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportResults}>
                      <Download className="h-4 w-4 mr-1" />
                      Export CSV
                    </Button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <FTS5SearchResults results={searchResponse.results} viewMode={viewMode} />
                </div>
              </div>
            )}

            {!searchResponse && !error && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Enter a search query to get started</p>
                  <p className="text-xs mt-2">Supports AND, OR, NOT, phrases, and prefix matching</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

