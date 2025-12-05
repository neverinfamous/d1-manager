import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingDown } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { FTS5SearchResult } from '@/services/fts5-types';

// Configure DOMPurify to only allow <mark> tags (used for search highlighting)
const ALLOWED_TAGS = ['mark'];
const sanitizeSnippet = (html: string): string => {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS });
};

interface FTS5SearchResultsProps {
  results: FTS5SearchResult[];
  viewMode?: 'card' | 'table';
}

export function FTS5SearchResults({ results, viewMode = 'card' }: FTS5SearchResultsProps): React.JSX.Element {
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());

  const toggleExpand = (index: number): void => {
    setExpandedResults(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">No results found</p>
        <p className="text-sm mt-2">Try different search terms or operators</p>
      </div>
    );
  }

  if (viewMode === 'table') {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium">Rank</th>
                {results[0] && Object.keys(results[0].row).map(key => (
                  key !== 'rank' && key !== 'snippet' && (
                    <th key={key} className="px-4 py-2 text-left text-sm font-medium">{key}</th>
                  )
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={index} className="border-t hover:bg-muted/50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-mono">{result.rank.toFixed(3)}</span>
                    </div>
                  </td>
                  {Object.entries(result.row).map(([key, value]) => (
                    key !== 'rank' && key !== 'snippet' && (
                      <td key={key} className="px-4 py-2 text-sm">
                        {value !== null && value !== undefined 
                          ? (typeof value === 'object' ? JSON.stringify(value) : String(value as string | number | boolean))
                          : '-'}
                      </td>
                    )
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Card view
  return (
    <div className="space-y-3">
      {results.map((result, index) => {
        const isExpanded = expandedResults.has(index);
        
        return (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {result.snippet ? (
                    <div 
                      className="text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: sanitizeSnippet(result.snippet) }}
                    />
                  ) : (
                    <CardTitle className="text-base">
                      {Object.values(result.row)[1] !== undefined 
                        ? String(Object.values(result.row)[1])
                        : 'Result'}
                    </CardTitle>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-xs font-mono">
                    <TrendingDown className="h-3 w-3" />
                    {result.rank.toFixed(3)}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpand(index)}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            {isExpanded && (
              <CardContent className="pt-0">
                <div className="border-t pt-3 space-y-2">
                  {Object.entries(result.row).map(([key, value]) => (
                    key !== 'snippet' && key !== 'rank' && (
                      <div key={key} className="flex gap-2 text-sm">
                        <span className="font-medium text-muted-foreground min-w-32">{key}:</span>
                        <span className="flex-1 break-words">
                          {value !== null && value !== undefined 
                            ? (typeof value === 'object' ? JSON.stringify(value) : String(value as string | number | boolean))
                            : '-'}
                        </span>
                      </div>
                    )
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

