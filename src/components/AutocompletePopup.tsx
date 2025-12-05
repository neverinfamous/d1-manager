import { useEffect, useRef } from 'react';
import { Table2, Columns, Code } from 'lucide-react';
import type { SuggestionType } from '@/lib/sqlContextParser';

/** A single suggestion item */
export interface Suggestion {
  /** The text to insert */
  text: string;
  /** Type of suggestion for icon/styling */
  type: SuggestionType;
  /** Optional description */
  description?: string;
}

interface AutocompletePopupProps {
  /** List of suggestions to display */
  suggestions: Suggestion[];
  /** Index of the currently selected suggestion */
  selectedIndex: number;
  /** Position relative to the container */
  position: { top: number; left: number };
  /** Whether the popup is visible */
  visible: boolean;
  /** Callback when a suggestion is selected */
  onSelect: (suggestion: Suggestion) => void;
  /** Callback when selection changes via click */
  onSelectionChange?: (index: number) => void;
}

/**
 * Autocomplete popup component for SQL suggestions
 * Displays keywords, table names, or column names with icons
 */
export function AutocompletePopup({
  suggestions,
  selectedIndex,
  position,
  visible,
  onSelect,
  onSelectionChange,
}: AutocompletePopupProps): React.JSX.Element | null {
  const listRef = useRef<HTMLUListElement>(null);
  const selectedRef = useRef<HTMLLIElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      const list = listRef.current;
      const item = selectedRef.current;
      
      const listRect = list.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      
      // Check if item is above visible area
      if (itemRect.top < listRect.top) {
        item.scrollIntoView({ block: 'nearest' });
      }
      // Check if item is below visible area
      else if (itemRect.bottom > listRect.bottom) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!visible || suggestions.length === 0) {
    return null;
  }

  // Get icon for suggestion type
  const getIcon = (type: SuggestionType): React.JSX.Element => {
    switch (type) {
      case 'table':
        return <Table2 className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" />;
      case 'column':
        return <Columns className="h-3.5 w-3.5 text-green-500 dark:text-green-400 flex-shrink-0" />;
      case 'keyword':
      default:
        return <Code className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400 flex-shrink-0" />;
    }
  };

  // Get type label for accessibility
  const getTypeLabel = (type: SuggestionType): string => {
    switch (type) {
      case 'table':
        return 'Table';
      case 'column':
        return 'Column';
      case 'keyword':
      default:
        return 'Keyword';
    }
  };

  return (
    <div
      className="absolute z-50 bg-popover border border-border rounded-md shadow-lg overflow-hidden"
      style={{
        top: `${String(position.top)}px`,
        left: `${String(position.left)}px`,
        minWidth: '180px',
        maxWidth: '320px',
      }}
      role="listbox"
      aria-label="SQL suggestions"
    >
      <ul
        ref={listRef}
        className="max-h-[240px] overflow-y-auto py-1"
      >
        {suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.type}-${suggestion.text}`}
            ref={index === selectedIndex ? selectedRef : null}
            role="option"
            aria-selected={index === selectedIndex}
            aria-label={`${suggestion.text}, ${getTypeLabel(suggestion.type)}`}
            className={`
              flex items-center gap-2 px-3 py-1.5 cursor-pointer
              text-sm font-mono
              ${index === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground hover:bg-muted'
              }
            `}
            onClick={() => onSelect(suggestion)}
            onMouseEnter={() => onSelectionChange?.(index)}
          >
            {getIcon(suggestion.type)}
            <span className="truncate">{suggestion.text}</span>
            <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">
              {getTypeLabel(suggestion.type)}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground bg-muted/50">
        <kbd className="px-1 py-0.5 bg-background border border-border rounded text-[10px]">↑↓</kbd>
        {' '}navigate{' '}
        <kbd className="px-1 py-0.5 bg-background border border-border rounded text-[10px]">Tab</kbd>
        {' '}accept{' '}
        <kbd className="px-1 py-0.5 bg-background border border-border rounded text-[10px]">Esc</kbd>
        {' '}close
      </div>
    </div>
  );
}

