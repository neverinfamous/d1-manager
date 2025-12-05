import { useState, useMemo, useCallback, useEffect } from 'react';
import * as Diff from 'diff';
import { ArrowLeftRight, Copy, Check, FileCode, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type SavedQuery } from '@/services/api';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';

interface DiffEditorProps {
  /** Current query from the SQL Editor */
  currentQuery: string;
  /** List of saved queries for comparison */
  savedQueries: SavedQuery[];
  /** Database name for display */
  databaseName: string;
  /** Callback when user wants to load a diff result into the editor */
  onLoadToEditor?: (sql: string) => void;
}

type SourceType = 'current' | 'saved' | 'custom';

interface DiffSource {
  type: SourceType;
  savedQueryId?: number;
  customText?: string;
}

/**
 * SQL Diff Editor component for comparing two SQL queries side-by-side
 */
export function DiffEditor({ 
  currentQuery, 
  savedQueries, 
  databaseName: _databaseName,
  onLoadToEditor 
}: DiffEditorProps): React.JSX.Element {
  // databaseName is available for future use (e.g., display)
  void _databaseName;
  // Left and right source selection
  const [leftSource, setLeftSource] = useState<DiffSource>({ type: 'current' });
  const [rightSource, setRightSource] = useState<DiffSource>({ type: 'saved' });
  
  // Custom text inputs
  const [leftCustom, setLeftCustom] = useState('');
  const [rightCustom, setRightCustom] = useState('');
  
  // Copy feedback
  const [copiedLeft, setCopiedLeft] = useState(false);
  const [copiedRight, setCopiedRight] = useState(false);

  // Get the text for a source
  const getSourceText = useCallback((source: DiffSource, customText: string): string => {
    if (source.type === 'current') {
      return currentQuery;
    }
    if (source.type === 'saved' && source.savedQueryId) {
      const query = savedQueries.find(q => q.id === source.savedQueryId);
      return query?.query || '';
    }
    if (source.type === 'custom') {
      return customText;
    }
    return '';
  }, [currentQuery, savedQueries]);

  const leftText = useMemo(() => getSourceText(leftSource, leftCustom), [getSourceText, leftSource, leftCustom]);
  const rightText = useMemo(() => getSourceText(rightSource, rightCustom), [getSourceText, rightSource, rightCustom]);

  // Compute diff
  const diffResult = useMemo(() => {
    return Diff.diffLines(leftText, rightText);
  }, [leftText, rightText]);

  // Calculate stats
  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    let unchanged = 0;
    
    diffResult.forEach(part => {
      const lines = part.value.split('\n').filter(l => l.length > 0 || part.value.endsWith('\n')).length;
      if (part.added) additions += lines;
      else if (part.removed) deletions += lines;
      else unchanged += lines;
    });
    
    return { additions, deletions, unchanged };
  }, [diffResult]);

  // Swap sources
  const handleSwap = (): void => {
    const tempSource = leftSource;
    const tempCustom = leftCustom;
    setLeftSource(rightSource);
    setLeftCustom(rightCustom);
    setRightSource(tempSource);
    setRightCustom(tempCustom);
  };

  // Copy to clipboard
  const handleCopy = async (text: string, side: 'left' | 'right'): Promise<void> => {
    await navigator.clipboard.writeText(text);
    if (side === 'left') {
      setCopiedLeft(true);
      setTimeout(() => setCopiedLeft(false), 2000);
    } else {
      setCopiedRight(true);
      setTimeout(() => setCopiedRight(false), 2000);
    }
  };

  // Set first saved query as default right source when queries load
  useEffect(() => {
    const firstQuery = savedQueries[0];
    if (firstQuery && rightSource.type === 'saved' && !rightSource.savedQueryId) {
      setRightSource({ type: 'saved', savedQueryId: firstQuery.id });
    }
  }, [savedQueries, rightSource]);

  // Get source label for display
  const getSourceLabel = (source: DiffSource): string => {
    if (source.type === 'current') return 'Current Query';
    if (source.type === 'saved' && source.savedQueryId) {
      const query = savedQueries.find(q => q.id === source.savedQueryId);
      return query?.name || 'Saved Query';
    }
    if (source.type === 'custom') return 'Custom';
    return 'Select source';
  };

  // Highlight SQL with Prism
  const highlightSql = useCallback((code: string): string => {
    const grammar = Prism.languages['sql'];
    if (!grammar) return code;
    return Prism.highlight(code, grammar, 'sql');
  }, []);

  // Render diff with line numbers and highlighting
  const renderDiff = useMemo(() => {
    const leftLines: { content: string; type: 'unchanged' | 'removed' | 'spacer'; lineNum: number | null }[] = [];
    const rightLines: { content: string; type: 'unchanged' | 'added' | 'spacer'; lineNum: number | null }[] = [];
    
    let leftLineNum = 1;
    let rightLineNum = 1;
    
    diffResult.forEach(part => {
      const lines = part.value.split('\n');
      // Remove trailing empty string from split if the value ends with newline
      if (lines[lines.length - 1] === '') {
        lines.pop();
      }
      
      if (part.added) {
        // Added lines only appear on right
        lines.forEach(line => {
          leftLines.push({ content: '', type: 'spacer', lineNum: null });
          rightLines.push({ content: line, type: 'added', lineNum: rightLineNum++ });
        });
      } else if (part.removed) {
        // Removed lines only appear on left
        lines.forEach(line => {
          leftLines.push({ content: line, type: 'removed', lineNum: leftLineNum++ });
          rightLines.push({ content: '', type: 'spacer', lineNum: null });
        });
      } else {
        // Unchanged lines appear on both sides
        lines.forEach(line => {
          leftLines.push({ content: line, type: 'unchanged', lineNum: leftLineNum++ });
          rightLines.push({ content: line, type: 'unchanged', lineNum: rightLineNum++ });
        });
      }
    });
    
    return { leftLines, rightLines };
  }, [diffResult]);

  const renderSide = (
    lines: { content: string; type: string; lineNum: number | null }[],
    side: 'left' | 'right'
  ): React.JSX.Element => {
    return (
      <div className="font-mono text-sm overflow-auto max-h-[400px] bg-muted/30 rounded-md">
        {lines.length === 0 ? (
          <div className="p-4 text-muted-foreground text-center">
            No content to display
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, idx) => {
                let bgClass = '';
                let textClass = '';
                
                if (line.type === 'added') {
                  bgClass = 'bg-green-100 dark:bg-green-950/50';
                  textClass = 'text-green-800 dark:text-green-300';
                } else if (line.type === 'removed') {
                  bgClass = 'bg-red-100 dark:bg-red-950/50';
                  textClass = 'text-red-800 dark:text-red-300';
                } else if (line.type === 'spacer') {
                  bgClass = 'bg-muted/50';
                }
                
                return (
                  <tr key={`${side}-${String(idx)}`} className={bgClass}>
                    <td className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border/50 text-xs">
                      {line.lineNum ?? ''}
                    </td>
                    <td className={`px-3 py-0.5 whitespace-pre ${textClass}`}>
                      {line.type === 'spacer' ? (
                        <span className="text-muted-foreground/30">⋯</span>
                      ) : (
                        <span 
                          dangerouslySetInnerHTML={{ 
                            __html: highlightSql(line.content) || '&nbsp;' 
                          }} 
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Source Selection */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              Compare SQL Queries
            </CardTitle>
            <div className="flex items-center gap-2">
              {stats.additions > 0 || stats.deletions > 0 ? (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-green-600 dark:text-green-400">+{stats.additions}</span>
                  <span className="text-red-600 dark:text-red-400">-{stats.deletions}</span>
                  <span className="text-muted-foreground">{stats.unchanged} unchanged</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No differences</span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Source Selectors */}
          <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-end">
            {/* Left Source */}
            <div className="space-y-2">
              <Label htmlFor="left-source">Original</Label>
              <Select
                value={leftSource.type === 'saved' ? `saved:${String(leftSource.savedQueryId ?? '')}` : leftSource.type}
                onValueChange={(value) => {
                  if (value === 'current') {
                    setLeftSource({ type: 'current' });
                  } else if (value === 'custom') {
                    setLeftSource({ type: 'custom' });
                  } else if (value.startsWith('saved:')) {
                    setLeftSource({ type: 'saved', savedQueryId: parseInt(value.replace('saved:', ''), 10) });
                  }
                }}
              >
                <SelectTrigger id="left-source">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4" />
                      Current Query
                    </div>
                  </SelectItem>
                  <SelectItem value="custom">Custom Query</SelectItem>
                  {savedQueries.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">
                        Saved Queries
                      </div>
                      {savedQueries.map(q => (
                        <SelectItem key={q.id} value={`saved:${String(q.id)}`}>
                          {q.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Swap Button */}
            <Button variant="outline" size="icon" onClick={handleSwap} title="Swap sides">
              <RefreshCw className="h-4 w-4" />
            </Button>

            {/* Right Source */}
            <div className="space-y-2">
              <Label htmlFor="right-source">Modified</Label>
              <Select
                value={rightSource.type === 'saved' ? `saved:${String(rightSource.savedQueryId ?? '')}` : rightSource.type}
                onValueChange={(value) => {
                  if (value === 'current') {
                    setRightSource({ type: 'current' });
                  } else if (value === 'custom') {
                    setRightSource({ type: 'custom' });
                  } else if (value.startsWith('saved:')) {
                    setRightSource({ type: 'saved', savedQueryId: parseInt(value.replace('saved:', ''), 10) });
                  }
                }}
              >
                <SelectTrigger id="right-source">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4" />
                      Current Query
                    </div>
                  </SelectItem>
                  <SelectItem value="custom">Custom Query</SelectItem>
                  {savedQueries.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">
                        Saved Queries
                      </div>
                      {savedQueries.map(q => (
                        <SelectItem key={q.id} value={`saved:${String(q.id)}`}>
                          {q.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Custom Text Inputs (if needed) */}
          {(leftSource.type === 'custom' || rightSource.type === 'custom') && (
            <div className="grid grid-cols-2 gap-4">
              {leftSource.type === 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="left-custom">Original Custom SQL</Label>
                  <textarea
                    id="left-custom"
                    name="left-custom"
                    className="w-full h-24 p-3 bg-muted rounded-md text-sm font-mono resize-y border-0 focus:ring-2 focus:ring-primary focus:outline-none"
                    value={leftCustom}
                    onChange={(e) => setLeftCustom(e.target.value)}
                    placeholder="Paste SQL here..."
                    spellCheck={false}
                  />
                </div>
              )}
              {rightSource.type === 'custom' && (
                <div className={`space-y-2 ${leftSource.type !== 'custom' ? 'col-start-2' : ''}`}>
                  <Label htmlFor="right-custom">Modified Custom SQL</Label>
                  <textarea
                    id="right-custom"
                    name="right-custom"
                    className="w-full h-24 p-3 bg-muted rounded-md text-sm font-mono resize-y border-0 focus:ring-2 focus:ring-primary focus:outline-none"
                    value={rightCustom}
                    onChange={(e) => setRightCustom(e.target.value)}
                    placeholder="Paste SQL here..."
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diff View */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Left Panel */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  {getSourceLabel(leftSource)}
                </span>
                <div className="flex gap-1">
                  {/* Only show Load to Editor for non-current sources */}
                  {onLoadToEditor && leftText && leftSource.type !== 'current' && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => onLoadToEditor(leftText)}
                      title="Load to SQL Editor"
                    >
                      <FileCode className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => void handleCopy(leftText, 'left')}
                    disabled={!leftText}
                    title="Copy to clipboard"
                  >
                    {copiedLeft ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              {renderSide(renderDiff.leftLines, 'left')}
            </div>

            {/* Right Panel */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  {getSourceLabel(rightSource)}
                </span>
                <div className="flex gap-1">
                  {/* Only show Load to Editor for non-current sources */}
                  {onLoadToEditor && rightText && rightSource.type !== 'current' && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => onLoadToEditor(rightText)}
                      title="Load to SQL Editor"
                    >
                      <FileCode className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => void handleCopy(rightText, 'right')}
                    disabled={!rightText}
                    title="Copy to clipboard"
                  >
                    {copiedRight ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              {renderSide(renderDiff.rightLines, 'right')}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Help Text */}
      <p className="text-xs text-muted-foreground text-center">
        Compare your current query with saved queries or paste custom SQL to see differences.
        <span className="mx-2">•</span>
        <span className="text-green-600 dark:text-green-400">Green</span> = additions,{' '}
        <span className="text-red-600 dark:text-red-400">Red</span> = deletions
      </p>
    </div>
  );
}

