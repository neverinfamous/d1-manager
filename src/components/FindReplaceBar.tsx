import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, Replace, ChevronUp, ChevronDown, X, CaseSensitive } from 'lucide-react';

interface FindReplaceBarProps {
  /** Current value of the editor */
  value: string;
  /** Callback to update the editor value */
  onChange: (value: string) => void;
  /** Callback when the bar is closed */
  onClose: () => void;
  /** Callback to select text in the editor */
  onSelectMatch: (start: number, end: number) => void;
  /** Whether to show replace functionality */
  showReplace?: boolean;
}

interface Match {
  start: number;
  end: number;
}

/**
 * Find and Replace bar for the SQL Editor
 */
export function FindReplaceBar({
  value,
  onChange,
  onClose,
  onSelectMatch,
  showReplace: initialShowReplace = false,
}: FindReplaceBarProps): React.JSX.Element {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(initialShowReplace);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  // Calculate matches using useMemo instead of useState + useEffect
  const matches = useMemo((): Match[] => {
    if (!searchTerm) return [];
    
    const searchText = caseSensitive ? value : value.toLowerCase();
    const searchFor = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    const results: Match[] = [];
    
    let index = 0;
    while ((index = searchText.indexOf(searchFor, index)) !== -1) {
      results.push({ start: index, end: index + searchTerm.length });
      index += 1; // Move forward to find overlapping matches
    }
    
    return results;
  }, [searchTerm, value, caseSensitive]);

  // Clamp current match index when matches change
  const validMatchIndex = useMemo(() => {
    if (matches.length === 0) return 0;
    return Math.min(currentMatchIndex, matches.length - 1);
  }, [matches.length, currentMatchIndex]);

  // Navigate to next match and select it
  const goToNextMatch = useCallback(() => {
    if (matches.length === 0) return;
    
    const nextIndex = (validMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIndex);
    
    // Select the match in the editor
    const match = matches[nextIndex];
    if (match) {
      onSelectMatch(match.start, match.end);
    }
  }, [matches, validMatchIndex, onSelectMatch]);

  // Navigate to previous match and select it
  const goToPrevMatch = useCallback(() => {
    if (matches.length === 0) return;
    
    const prevIndex = (validMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIndex);
    
    // Select the match in the editor
    const match = matches[prevIndex];
    if (match) {
      onSelectMatch(match.start, match.end);
    }
  }, [matches, validMatchIndex, onSelectMatch]);

  // Replace current match
  const replaceCurrent = useCallback(() => {
    if (matches.length === 0) return;
    
    const match = matches[validMatchIndex];
    if (!match) return;
    
    const newValue = value.slice(0, match.start) + replaceTerm + value.slice(match.end);
    onChange(newValue);
  }, [matches, validMatchIndex, value, replaceTerm, onChange]);

  // Replace all matches
  const replaceAll = useCallback(() => {
    if (matches.length === 0 || !searchTerm) return;
    
    // Replace from end to start to preserve indices
    let newValue = value;
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      if (match) {
        newValue = newValue.slice(0, match.start) + replaceTerm + newValue.slice(match.end);
      }
    }
    
    onChange(newValue);
    setCurrentMatchIndex(0);
  }, [matches, searchTerm, value, replaceTerm, onChange]);

  // Handle keyboard shortcuts for input fields - stop propagation to prevent parent handlers
  const handleInputKeyDown = (e: React.KeyboardEvent): void => {
    // Stop all keyboard events from bubbling to prevent parent autocomplete from triggering
    e.stopPropagation();
    
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        goToPrevMatch();
      } else {
        goToNextMatch();
      }
    } else if (e.key === 'F3') {
      e.preventDefault();
      if (e.shiftKey) {
        goToPrevMatch();
      } else {
        goToNextMatch();
      }
    }
  };

  // Handle keyboard shortcuts for the bar container
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    e.stopPropagation();
  };

  return (
    <div className="sql-find-replace-bar" onKeyDown={handleKeyDown}>
      {/* Find row */}
      <div className="sql-find-row">
        <div className="sql-find-input-wrapper">
          <Search className="sql-find-icon" />
          <input
            ref={searchInputRef}
            type="text"
            id="sql-find-input"
            name="sql-find"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentMatchIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Find"
            className="sql-find-input"
            aria-label="Find in editor"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-form-type="other"
          />
          <span className="sql-find-count">
            {matches.length > 0 
              ? `${String(validMatchIndex + 1)} of ${String(matches.length)}`
              : searchTerm ? 'No results' : ''
            }
          </span>
        </div>
        
        <div className="sql-find-buttons">
          <button
            type="button"
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={`sql-find-btn sql-find-btn-toggle ${caseSensitive ? 'active' : ''}`}
            title="Match Case (Alt+C)"
            aria-pressed={caseSensitive}
          >
            <CaseSensitive className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToPrevMatch}
            disabled={matches.length === 0}
            className="sql-find-btn"
            title="Previous Match (Shift+Enter)"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToNextMatch}
            disabled={matches.length === 0}
            className="sql-find-btn"
            title="Next Match (Enter)"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowReplace(!showReplace)}
            className={`sql-find-btn sql-find-btn-toggle ${showReplace ? 'active' : ''}`}
            title="Toggle Replace"
          >
            <Replace className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="sql-find-btn"
            title="Close (Escape)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div className="sql-find-row">
          <div className="sql-find-input-wrapper">
            <Replace className="sql-find-icon" />
            <input
              type="text"
              id="sql-replace-input"
              name="sql-replace"
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Replace"
              className="sql-find-input"
              aria-label="Replace text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-form-type="other"
            />
          </div>
          
          <div className="sql-find-buttons">
            <button
              type="button"
              onClick={replaceCurrent}
              disabled={matches.length === 0}
              className="sql-find-btn sql-find-btn-text"
              title="Replace current match"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={replaceAll}
              disabled={matches.length === 0}
              className="sql-find-btn sql-find-btn-text"
              title="Replace all matches"
            >
              All
            </button>
          </div>
        </div>
      )}

      <style>{`
        .sql-find-replace-bar {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.5rem;
          background: hsl(var(--background));
          border-bottom: 1px solid hsl(var(--border));
          font-size: 0.875rem;
        }

        .sql-find-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .sql-find-input-wrapper {
          display: flex;
          align-items: center;
          flex: 1;
          background: hsl(var(--muted));
          border: 1px solid hsl(var(--border));
          border-radius: 0.375rem;
          padding: 0 0.5rem;
          gap: 0.5rem;
        }

        .sql-find-input-wrapper:focus-within {
          border-color: hsl(var(--ring));
          box-shadow: 0 0 0 1px hsl(var(--ring));
        }

        .sql-find-icon {
          width: 1rem;
          height: 1rem;
          color: hsl(var(--muted-foreground));
          flex-shrink: 0;
        }

        .sql-find-input {
          flex: 1;
          border: none;
          background: transparent;
          padding: 0.375rem 0;
          font-size: inherit;
          color: hsl(var(--foreground));
          outline: none;
          min-width: 0;
        }

        .sql-find-input::placeholder {
          color: hsl(var(--muted-foreground));
        }

        .sql-find-count {
          font-size: 0.75rem;
          color: hsl(var(--muted-foreground));
          white-space: nowrap;
          flex-shrink: 0;
        }

        .sql-find-buttons {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .sql-find-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.375rem;
          border: none;
          background: transparent;
          color: hsl(var(--muted-foreground));
          border-radius: 0.25rem;
          cursor: pointer;
          transition: background-color 0.15s, color 0.15s;
        }

        .sql-find-btn:hover:not(:disabled) {
          background: hsl(var(--muted));
          color: hsl(var(--foreground));
        }

        .sql-find-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .sql-find-btn-toggle.active {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
        }

        .sql-find-btn-toggle.active:hover {
          background: hsl(var(--primary) / 0.9);
          color: hsl(var(--primary-foreground));
        }

        .sql-find-btn-text {
          padding: 0.375rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}

export type { Match };
