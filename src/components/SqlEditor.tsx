import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import { WrapText } from 'lucide-react';
import { FindReplaceBar } from './FindReplaceBar';
import { getSqlDoc, type SqlDoc } from '@/lib/sqlDocs';

interface SqlEditorProps {
  /** Current SQL value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback for keydown events */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Callback for select events */
  onSelect?: () => void;
  /** Callback for click events (to close autocomplete) */
  onClick?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Additional class names for the textarea */
  className?: string;
  /** Whether the editor has an error state */
  hasError?: boolean;
  /** Position of the error (character index) for squiggle underline */
  errorPosition?: number | undefined;
  /** ID for the textarea */
  id?: string;
  /** Name for the textarea */
  name?: string;
  /** Aria label */
  ariaLabel?: string;
  /** Ref to expose the textarea element */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** ARIA attributes for autocomplete */
  ariaAutoComplete?: string;
  ariaControls?: string | undefined;
  ariaExpanded?: boolean;
}

/**
 * SQL Editor with syntax highlighting, line numbers, and find/replace.
 * Uses Prism.js overlay technique with a line number gutter.
 */
export function SqlEditor({
  value,
  onChange,
  onKeyDown,
  onSelect,
  onClick,
  placeholder,
  className = '',
  hasError = false,
  errorPosition,
  id,
  name,
  ariaLabel,
  textareaRef: externalRef,
  ariaAutoComplete,
  ariaControls,
  ariaExpanded,
}: SqlEditorProps): React.JSX.Element {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;
  const highlightRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find/Replace state
  const [showFindBar, setShowFindBar] = useState(false);
  
  // Word wrap state (default: on)
  const [wordWrap, setWordWrap] = useState(true);
  
  // Hover documentation state
  const [hoverDoc, setHoverDoc] = useState<{ doc: SqlDoc; keyword: string; x: number; y: number } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate line numbers
  const lineNumbers = useMemo(() => {
    const lines = value.split('\n');
    // Always show at least 1 line number
    return Array.from({ length: Math.max(lines.length, 1) }, (_, i) => i + 1);
  }, [value]);

  // Calculate gutter width based on number of digits
  const gutterWidth = useMemo(() => {
    const maxDigits = String(lineNumbers.length).length;
    // Base width + padding, minimum 3 characters wide
    return Math.max(maxDigits, 2) * 0.6 + 1.5; // em units
  }, [lineNumbers.length]);

  // Escape HTML for safety
  const escapeHtml = useCallback((text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }, []);

  // Highlight the code using Prism
  const getHighlightedCode = useCallback((code: string): string => {
    if (!code) return '';
    try {
      const grammar = Prism.languages['sql'];
      if (!grammar) {
        return escapeHtml(code);
      }
      return Prism.highlight(code, grammar, 'sql');
    } catch {
      return escapeHtml(code);
    }
  }, [escapeHtml]);

  // Sync scroll positions between all layers
  const syncScroll = (): void => {
    if (textareaRef.current) {
      const scrollTop = textareaRef.current.scrollTop;
      const scrollLeft = textareaRef.current.scrollLeft;
      
      if (highlightRef.current) {
        highlightRef.current.scrollTop = scrollTop;
        highlightRef.current.scrollLeft = scrollLeft;
      }
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = scrollTop;
      }
    }
  };

  // Add error squiggle to highlighted code at the specified position
  const addErrorSquiggle = useCallback((html: string, originalText: string, errPos: number): string => {
    if (errPos < 0 || errPos >= originalText.length) return html;
    
    // Find the length of the error token (word or single character)
    let errorEnd = errPos + 1;
    const char = originalText[errPos];
    
    // Extend to cover the whole word/token if it's a letter
    if (/[a-zA-Z_]/.test(char || '')) {
      while (errorEnd < originalText.length && /[a-zA-Z0-9_]/.test(originalText[errorEnd] || '')) {
        errorEnd++;
      }
    }
    
    // Track position in original text while scanning HTML
    let textPos = 0;
    let result = '';
    let i = 0;
    let inErrorSpan = false;
    let errorSpanStarted = false;
    
    while (i < html.length) {
      // Skip HTML tags
      if (html[i] === '<') {
        const tagEnd = html.indexOf('>', i);
        if (tagEnd !== -1) {
          // Check if we need to close error span before closing tag
          if (inErrorSpan && html[i + 1] === '/') {
            result += '</span>';
            inErrorSpan = false;
          }
          result += html.slice(i, tagEnd + 1);
          // Check if we need to reopen error span after opening tag
          if (errorSpanStarted && !inErrorSpan && textPos < errorEnd && html[i + 1] !== '/') {
            result += '<span class="sql-error-squiggle">';
            inErrorSpan = true;
          }
          i = tagEnd + 1;
          continue;
        }
      }
      
      // Check if we're entering the error region
      if (textPos === errPos && !errorSpanStarted) {
        result += '<span class="sql-error-squiggle">';
        inErrorSpan = true;
        errorSpanStarted = true;
      }
      
      // Add the character
      // Handle HTML entities
      if (html[i] === '&') {
        const entityEnd = html.indexOf(';', i);
        if (entityEnd !== -1 && entityEnd - i < 10) {
          result += html.slice(i, entityEnd + 1);
          textPos++;
          i = entityEnd + 1;
          
          // Check if we're exiting the error region
          if (textPos >= errorEnd && inErrorSpan) {
            result += '</span>';
            inErrorSpan = false;
          }
          continue;
        }
      }
      
      result += html[i] ?? '';
      textPos++;
      i++;
      
      // Check if we're exiting the error region
      if (textPos >= errorEnd && inErrorSpan) {
        result += '</span>';
        inErrorSpan = false;
      }
    }
    
    // Close any unclosed error span
    if (inErrorSpan) {
      result += '</span>';
    }
    
    return result;
  }, []);

  // Update highlighting when value changes
  useEffect(() => {
    if (highlightRef.current) {
      let highlighted = getHighlightedCode(value);
      
      // Add error squiggle if there's an error position
      if (hasError && errorPosition !== undefined && errorPosition >= 0) {
        highlighted = addErrorSquiggle(highlighted, value, errorPosition);
      }
      
      // Add a trailing newline to prevent layout shift
      highlightRef.current.innerHTML = highlighted + '\n';
    }
  }, [value, getHighlightedCode, hasError, errorPosition, addErrorSquiggle]);

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    onChange(e.target.value);
  };

  // Handle keyboard shortcuts for find/replace
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Ctrl+F or Cmd+F to open find bar
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setShowFindBar(true);
      return;
    }
    
    // Ctrl+H or Cmd+H to open find/replace (with replace visible)
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
      e.preventDefault();
      setShowFindBar(true);
      return;
    }

    // Pass through to parent handler
    onKeyDown?.(e);
  };

  // Select and scroll to a match in the editor
  const handleSelectMatch = (start: number, end: number): void => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    textarea.focus();
    textarea.setSelectionRange(start, end);
    
    // Scroll the selection into view
    // Calculate approximate scroll position based on character position
    const textBefore = value.slice(0, start);
    const linesBefore = textBefore.split('\n').length - 1;
    const lineHeight = 21; // Approximate line height in pixels
    const scrollTarget = linesBefore * lineHeight;
    
    // Only scroll if the selection is not visible
    const scrollTop = textarea.scrollTop;
    const visibleHeight = textarea.clientHeight;
    
    if (scrollTarget < scrollTop || scrollTarget > scrollTop + visibleHeight - lineHeight) {
      textarea.scrollTop = Math.max(0, scrollTarget - visibleHeight / 3);
      syncScroll();
    }
  };

  // Close find bar
  const handleCloseFindBar = (): void => {
    setShowFindBar(false);
    // Return focus to editor
    textareaRef.current?.focus();
  };

  // Measure actual character width for the monospace font
  const measureCharWidth = (): number => {
    const textarea = textareaRef.current;
    if (!textarea) return 8.4; // fallback
    
    // Create a hidden span to measure character width
    const span = document.createElement('span');
    span.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre;
      font-family: ${getComputedStyle(textarea).fontFamily};
      font-size: ${getComputedStyle(textarea).fontSize};
    `;
    span.textContent = 'MMMMMMMMMM'; // 10 wide chars
    document.body.appendChild(span);
    const width = span.offsetWidth / 10;
    document.body.removeChild(span);
    return width;
  };

  // Handle mouse move for hover documentation
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Clear any pending hover
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Get position relative to the content area
    const contentEl = e.currentTarget.querySelector('.sql-editor-content');
    if (!contentEl) return;
    
    const rect = contentEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Get the textarea for scroll and font info
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Calculate character position from pixel position
    const style = getComputedStyle(textarea);
    const paddingLeft = parseFloat(style.paddingLeft);
    const paddingTop = parseFloat(style.paddingTop);
    const lineHeight = parseFloat(style.lineHeight) || 21;
    
    // Get actual character width by measuring
    const charWidth = measureCharWidth();
    
    const scrollTop = textarea.scrollTop;
    const scrollLeft = textarea.scrollLeft;
    
    // Calculate line and column (adjust for padding and scroll)
    const adjustedY = y + scrollTop - paddingTop;
    const adjustedX = x + scrollLeft - paddingLeft;
    
    const line = Math.floor(adjustedY / lineHeight);
    const col = Math.max(0, Math.floor(adjustedX / charWidth));
    
    // Find position in text
    const lines = value.split('\n');
    if (line < 0 || line >= lines.length) {
      setHoverDoc(null);
      return;
    }
    
    const lineText = lines[line] || '';
    const clampedCol = Math.min(col, lineText.length);
    
    // Check if we're inside a quoted string - if so, don't show hover
    let inSingleQuote = false;
    let inDoubleQuote = false;
    for (let i = 0; i < clampedCol; i++) {
      const char = lineText[i];
      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
      if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    }
    if (inSingleQuote || inDoubleQuote) {
      setHoverDoc(null);
      return;
    }
    
    // Find the word at this column position directly in the line
    let wordStart = clampedCol;
    let wordEnd = clampedCol;
    
    // Find word boundaries
    while (wordStart > 0 && /[a-zA-Z_]/.test(lineText[wordStart - 1] || '')) {
      wordStart--;
    }
    while (wordEnd < lineText.length && /[a-zA-Z_]/.test(lineText[wordEnd] || '')) {
      wordEnd++;
    }
    
    if (wordStart === wordEnd) {
      setHoverDoc(null);
      return;
    }
    
    const word = lineText.slice(wordStart, wordEnd);
    let lookupWord = word.toUpperCase();
    
    // Check for compound keywords by looking at surrounding context
    const beforeText = lineText.slice(0, wordStart).trim();
    const afterText = lineText.slice(wordEnd).trim();
    const prevWord = beforeText.split(/\s+/).pop()?.toUpperCase() || '';
    const nextWord = afterText.split(/[\s(,]+/)[0]?.toUpperCase() || '';
    
    // Check for compound keywords like "ORDER BY", "GROUP BY", etc.
    if (prevWord === 'ORDER' && lookupWord === 'BY') {
      lookupWord = 'ORDER BY';
    } else if (prevWord === 'GROUP' && lookupWord === 'BY') {
      lookupWord = 'GROUP BY';
    } else if (['INNER', 'LEFT', 'RIGHT', 'CROSS', 'FULL'].includes(prevWord) && lookupWord === 'JOIN') {
      lookupWord = `${prevWord} JOIN`;
    } else if (prevWord === 'UNION' && lookupWord === 'ALL') {
      lookupWord = 'UNION ALL';
    } else if (lookupWord === 'ORDER' && nextWord === 'BY') {
      lookupWord = 'ORDER BY';
    } else if (lookupWord === 'GROUP' && nextWord === 'BY') {
      lookupWord = 'GROUP BY';
    } else if (['INNER', 'LEFT', 'RIGHT', 'CROSS', 'FULL'].includes(lookupWord) && nextWord === 'JOIN') {
      lookupWord = `${lookupWord} JOIN`;
    } else if (lookupWord === 'UNION' && nextWord === 'ALL') {
      lookupWord = 'UNION ALL';
    } else if (lookupWord === 'IF' && nextWord === 'NOT') {
      lookupWord = 'IF NOT EXISTS';
    } else if (lookupWord === 'IF' && nextWord === 'EXISTS') {
      lookupWord = 'IF EXISTS';
    } else if (prevWord === 'IF' && lookupWord === 'NOT') {
      lookupWord = 'IF NOT EXISTS';
    } else if (prevWord === 'NOT' && lookupWord === 'EXISTS' && beforeText.includes('IF')) {
      lookupWord = 'IF NOT EXISTS';
    } else if (prevWord === 'IF' && lookupWord === 'EXISTS') {
      lookupWord = 'IF EXISTS';
    }
    
    // Look up documentation
    const doc = getSqlDoc(lookupWord);
    if (!doc) {
      setHoverDoc(null);
      return;
    }
    
    // Set hover with delay
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverDoc({
        doc,
        keyword: lookupWord,
        x: e.clientX,
        y: e.clientY,
      });
    }, 300);
  };

  // Handle mouse leave
  const handleMouseLeave = (): void => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoverDoc(null);
  };

  return (
    <div 
      ref={containerRef}
      className="sql-editor-wrapper"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Find/Replace Bar */}
      {showFindBar && (
        <FindReplaceBar
          value={value}
          onChange={onChange}
          onClose={handleCloseFindBar}
          onSelectMatch={handleSelectMatch}
        />
      )}

      {/* Editor Toolbar */}
      <div className="sql-editor-toolbar">
        <button
          type="button"
          onClick={() => setWordWrap(!wordWrap)}
          className={`sql-editor-toolbar-btn ${wordWrap ? 'active' : ''}`}
          title={wordWrap ? 'Word Wrap: On (click to disable)' : 'Word Wrap: Off (click to enable)'}
          aria-pressed={wordWrap}
        >
          <WrapText className="h-3.5 w-3.5" />
        </button>
      </div>

      <div 
        className={`sql-editor-container ${wordWrap ? '' : 'no-wrap'}`}
        style={{ '--gutter-width': `${String(gutterWidth)}em` } as React.CSSProperties}
      >
        {/* Line numbers gutter */}
        <div
          ref={lineNumbersRef}
          className="sql-editor-line-numbers"
          aria-hidden="true"
        >
          {lineNumbers.map((num) => (
            <div key={num} className="sql-editor-line-number">
              {num}
            </div>
          ))}
        </div>

        {/* Editor area (highlight + textarea) */}
        <div className="sql-editor-content">
          {/* Highlighted code layer (behind) */}
          <pre
            ref={highlightRef}
            className={`sql-editor-highlight ${hasError ? 'has-error' : ''}`}
            aria-hidden="true"
          />
          
          {/* Textarea layer (front, transparent) */}
          <textarea
            ref={textareaRef}
            id={id}
            name={name}
            value={value}
            onChange={handleChange}
            onKeyDown={handleEditorKeyDown}
            onSelect={onSelect}
            onClick={onClick}
            onScroll={syncScroll}
            placeholder={placeholder}
            className={`sql-editor-textarea ${hasError ? 'has-error' : ''} ${className}`}
            aria-label={ariaLabel}
            aria-autocomplete={ariaAutoComplete as 'none' | 'inline' | 'list' | 'both' | undefined}
            aria-controls={ariaControls}
            aria-expanded={ariaExpanded}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
      </div>

      {/* Hover Documentation Tooltip */}
      {hoverDoc && (
        <div
          className="sql-hover-tooltip"
          style={{
            position: 'fixed',
            left: hoverDoc.x + 10,
            top: hoverDoc.y + 10,
          }}
        >
          <div className="sql-hover-keyword">{hoverDoc.keyword}</div>
          <div className="sql-hover-description">{hoverDoc.doc.description}</div>
          {hoverDoc.doc.syntax && (
            <div className="sql-hover-syntax">
              <code>{hoverDoc.doc.syntax}</code>
            </div>
          )}
        </div>
      )}

      {/* Inline styles for the editor */}
      <style>{`
        .sql-editor-wrapper {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 12rem; /* h-48 */
          border-radius: 0.375rem;
          overflow: hidden;
          background: hsl(var(--muted));
        }

        /* Editor Toolbar */
        .sql-editor-toolbar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 0.25rem 0.5rem;
          background: hsl(var(--muted));
          border-bottom: 1px solid hsl(var(--border));
          gap: 0.25rem;
        }

        .sql-editor-toolbar-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.25rem;
          border: none;
          background: transparent;
          color: hsl(var(--muted-foreground));
          border-radius: 0.25rem;
          cursor: pointer;
          transition: background-color 0.15s, color 0.15s;
        }

        .sql-editor-toolbar-btn:hover {
          background: hsl(var(--background));
          color: hsl(var(--foreground));
        }

        .sql-editor-toolbar-btn.active {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
        }

        .sql-editor-toolbar-btn.active:hover {
          background: hsl(var(--primary) / 0.9);
        }

        /* Hover Documentation Tooltip */
        .sql-hover-tooltip {
          z-index: 100;
          max-width: 400px;
          padding: 0.75rem;
          background: hsl(var(--popover));
          border: 1px solid hsl(var(--border));
          border-radius: 0.5rem;
          box-shadow: 0 4px 12px hsl(var(--foreground) / 0.1);
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 0.8125rem;
          pointer-events: none;
        }

        .sql-hover-keyword {
          font-weight: 600;
          color: hsl(var(--primary));
          margin-bottom: 0.25rem;
          font-family: ui-monospace, monospace;
        }

        .sql-hover-description {
          color: hsl(var(--foreground));
          line-height: 1.4;
        }

        .sql-hover-syntax {
          margin-top: 0.5rem;
          padding: 0.375rem 0.5rem;
          background: hsl(var(--muted));
          border-radius: 0.25rem;
          font-family: ui-monospace, monospace;
          font-size: 0.75rem;
          color: hsl(var(--muted-foreground));
          overflow-x: auto;
        }

        .sql-hover-syntax code {
          white-space: pre;
        }

        .sql-editor-container {
          position: relative;
          display: flex;
          flex: 1;
          min-height: 0;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 0.875rem;
          line-height: 1.5;
          overflow: hidden;
        }

        .sql-editor-container.has-error {
          background: hsl(var(--destructive) / 0.05);
        }

        /* Line numbers gutter */
        .sql-editor-line-numbers {
          flex-shrink: 0;
          width: var(--gutter-width, 3em);
          padding: 1rem 0.5rem 1rem 0.5rem;
          background: hsl(var(--muted));
          border-right: 1px solid hsl(var(--border));
          overflow: hidden;
          user-select: none;
          text-align: right;
        }

        .sql-editor-line-number {
          color: hsl(var(--muted-foreground));
          font-size: 0.75rem;
          line-height: 1.5;
          height: 1.3125rem; /* Match line height of editor */
        }

        /* Editor content area */
        .sql-editor-content {
          position: relative;
          flex: 1;
          overflow: hidden;
        }

        .sql-editor-highlight,
        .sql-editor-textarea {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          padding: 1rem;
          margin: 0;
          border: none;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow: auto;
        }

        /* Custom scrollbar styling */
        .sql-editor-highlight::-webkit-scrollbar,
        .sql-editor-textarea::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .sql-editor-highlight::-webkit-scrollbar-track,
        .sql-editor-textarea::-webkit-scrollbar-track {
          background: hsl(var(--muted));
        }

        .sql-editor-highlight::-webkit-scrollbar-thumb,
        .sql-editor-textarea::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.3);
          border-radius: 4px;
        }

        .sql-editor-highlight::-webkit-scrollbar-thumb:hover,
        .sql-editor-textarea::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground) / 0.5);
        }

        /* Firefox scrollbar */
        .sql-editor-highlight,
        .sql-editor-textarea {
          scrollbar-width: thin;
          scrollbar-color: hsl(var(--muted-foreground) / 0.3) hsl(var(--muted));
        }

        /* No word wrap mode */
        .sql-editor-container.no-wrap .sql-editor-highlight,
        .sql-editor-container.no-wrap .sql-editor-textarea {
          white-space: pre;
          word-wrap: normal;
          overflow-x: auto;
        }

        .sql-editor-highlight {
          pointer-events: none;
          z-index: 1;
          color: hsl(var(--foreground));
          background: transparent;
        }

        .sql-editor-textarea {
          z-index: 2;
          color: transparent;
          caret-color: hsl(var(--foreground));
          background: transparent;
          resize: none;
          outline: none;
        }

        .sql-editor-textarea:focus {
          box-shadow: inset 0 0 0 2px hsl(var(--ring));
        }

        .sql-editor-textarea.has-error {
          box-shadow: inset 0 0 0 1px hsl(var(--destructive));
        }

        .sql-editor-textarea::placeholder {
          color: hsl(var(--muted-foreground));
        }

        /* Selection highlight */
        .sql-editor-textarea::selection {
          background: hsl(var(--primary) / 0.3);
        }

        /* Error squiggle underline */
        .sql-error-squiggle {
          text-decoration: underline wavy hsl(var(--destructive));
          text-decoration-skip-ink: none;
          text-underline-offset: 2px;
        }

        /* Prism.js SQL syntax highlighting - Light theme */
        .sql-editor-highlight .token.comment,
        .sql-editor-highlight .token.block-comment,
        .sql-editor-highlight .token.prolog,
        .sql-editor-highlight .token.doctype,
        .sql-editor-highlight .token.cdata {
          color: #6b7280;
          font-style: italic;
        }

        .sql-editor-highlight .token.punctuation {
          color: #6b7280;
        }

        .sql-editor-highlight .token.keyword {
          color: #7c3aed;
          font-weight: 600;
        }

        .sql-editor-highlight .token.operator {
          color: #0891b2;
        }

        .sql-editor-highlight .token.string,
        .sql-editor-highlight .token.char {
          color: #059669;
        }

        .sql-editor-highlight .token.number,
        .sql-editor-highlight .token.boolean {
          color: #ea580c;
        }

        .sql-editor-highlight .token.function {
          color: #2563eb;
        }

        .sql-editor-highlight .token.variable {
          color: #dc2626;
        }

        /* Dark theme overrides */
        .dark .sql-editor-line-numbers {
          background: hsl(var(--muted));
          border-right-color: hsl(var(--border));
        }

        .dark .sql-editor-highlight .token.comment,
        .dark .sql-editor-highlight .token.block-comment,
        .dark .sql-editor-highlight .token.prolog,
        .dark .sql-editor-highlight .token.doctype,
        .dark .sql-editor-highlight .token.cdata {
          color: #9ca3af;
        }

        .dark .sql-editor-highlight .token.punctuation {
          color: #9ca3af;
        }

        .dark .sql-editor-highlight .token.keyword {
          color: #a78bfa;
          font-weight: 600;
        }

        .dark .sql-editor-highlight .token.operator {
          color: #22d3ee;
        }

        .dark .sql-editor-highlight .token.string,
        .dark .sql-editor-highlight .token.char {
          color: #34d399;
        }

        .dark .sql-editor-highlight .token.number,
        .dark .sql-editor-highlight .token.boolean {
          color: #fb923c;
        }

        .dark .sql-editor-highlight .token.function {
          color: #60a5fa;
        }

        .dark .sql-editor-highlight .token.variable {
          color: #f87171;
        }
      `}</style>
    </div>
  );
}
