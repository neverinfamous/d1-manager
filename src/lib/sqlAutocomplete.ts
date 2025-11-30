/**
 * SQL autocomplete utilities for textarea elements
 * Provides IDE-like auto-pairing and smart indentation for SQL queries
 */

/** Matching pairs for auto-completion */
const PAIRS: Record<string, string> = {
  '(': ')',
  '{': '}',
  '[': ']',
  "'": "'",
  '"': '"',
};

/** Opening characters that trigger auto-pairing */
const OPENERS = new Set(Object.keys(PAIRS));

/** Closing characters */
const CLOSERS = new Set(Object.values(PAIRS));

/**
 * Result of handling a keydown event
 */
export interface AutocompleteResult {
  /** Whether the event was handled (should preventDefault) */
  handled: boolean;
  /** New value for the textarea */
  newValue?: string;
  /** New cursor position */
  newCursorPos?: number;
}

/**
 * Get the current line's indentation
 */
function getLineIndent(text: string, cursorPos: number): string {
  const lineStart = text.lastIndexOf('\n', cursorPos - 1) + 1;
  const lineText = text.slice(lineStart, cursorPos);
  const match = /^(\s*)/.exec(lineText);
  return match?.[1] ?? '';
}

/**
 * Get the current line's text (before cursor)
 */
function getCurrentLineText(text: string, cursorPos: number): string {
  const lineStart = text.lastIndexOf('\n', cursorPos - 1) + 1;
  return text.slice(lineStart, cursorPos).trim().toUpperCase();
}

/**
 * Check if cursor is inside an empty pair like (), {}, [], or ''
 */
function isInsideEmptyPair(text: string, cursorPos: number): boolean {
  if (cursorPos === 0 || cursorPos >= text.length) return false;
  const before = text[cursorPos - 1];
  const after = text[cursorPos];
  return (
    (before === '(' && after === ')') ||
    (before === '{' && after === '}') ||
    (before === '[' && after === ']') ||
    (before === "'" && after === "'") ||
    (before === '"' && after === '"')
  );
}

/**
 * Check if the next character is a closing character we should skip
 */
function shouldSkipCloser(text: string, cursorPos: number, char: string): boolean {
  if (cursorPos >= text.length) return false;
  return text[cursorPos] === char && CLOSERS.has(char);
}

/**
 * Check if we're inside a string literal (for quote handling)
 */
function isInsideString(text: string, cursorPos: number, quoteChar: string): boolean {
  let count = 0;
  for (let i = 0; i < cursorPos; i++) {
    if (text[i] === quoteChar && (i === 0 || text[i - 1] !== '\\')) {
      count++;
    }
  }
  return count % 2 === 1;
}

/**
 * Handle keydown event for SQL autocomplete
 */
export function handleSqlKeydown(
  key: string,
  text: string,
  selectionStart: number,
  selectionEnd: number,
  shiftKey: boolean
): AutocompleteResult {
  const hasSelection = selectionStart !== selectionEnd;

  // Handle opening brackets/quotes - auto-pair
  if (OPENERS.has(key) && !hasSelection) {
    const closer = PAIRS[key];
    if (!closer) return { handled: false };

    // For quotes, check if we're already inside a string
    if (key === "'" || key === '"') {
      // Skip if the next char is already this quote
      if (shouldSkipCloser(text, selectionStart, key)) {
        return {
          handled: true,
          newValue: text,
          newCursorPos: selectionStart + 1,
        };
      }

      // Don't auto-pair if we're inside a string of the same type
      if (isInsideString(text, selectionStart, key)) {
        return { handled: false };
      }
    }

    const newValue =
      text.slice(0, selectionStart) + key + closer + text.slice(selectionEnd);

    return {
      handled: true,
      newValue,
      newCursorPos: selectionStart + 1,
    };
  }

  // Handle closing characters - skip if already there
  if (CLOSERS.has(key) && !hasSelection) {
    if (shouldSkipCloser(text, selectionStart, key)) {
      return {
        handled: true,
        newValue: text,
        newCursorPos: selectionStart + 1,
      };
    }
  }

  // Handle Enter key - smart indentation
  if (key === 'Enter' && !hasSelection) {
    const currentIndent = getLineIndent(text, selectionStart);
    const charBefore = selectionStart > 0 ? text[selectionStart - 1] : '';
    const charAfter = selectionStart < text.length ? text[selectionStart] : '';
    const lineText = getCurrentLineText(text, selectionStart);

    // Inside empty brackets - add extra indentation and closing on new line
    if ((charBefore === '(' && charAfter === ')') ||
        (charBefore === '{' && charAfter === '}') ||
        (charBefore === '[' && charAfter === ']')) {
      const newIndent = currentIndent + '  ';
      const newValue =
        text.slice(0, selectionStart) +
        '\n' +
        newIndent +
        '\n' +
        currentIndent +
        text.slice(selectionStart);

      return {
        handled: true,
        newValue,
        newCursorPos: selectionStart + 1 + newIndent.length,
      };
    }

    // After opening bracket - increase indent
    if (charBefore === '(' || charBefore === '{' || charBefore === '[') {
      const newIndent = currentIndent + '  ';
      const newValue =
        text.slice(0, selectionStart) + '\n' + newIndent + text.slice(selectionStart);

      return {
        handled: true,
        newValue,
        newCursorPos: selectionStart + 1 + newIndent.length,
      };
    }

    // After SQL keywords that typically precede new clauses - increase indent
    const keywordsForIndent = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'SET', 'VALUES', 'ORDER', 'GROUP', 'HAVING'];
    const shouldIndent = keywordsForIndent.some(kw => lineText.endsWith(kw));
    
    if (shouldIndent) {
      const newIndent = currentIndent + '  ';
      const newValue =
        text.slice(0, selectionStart) + '\n' + newIndent + text.slice(selectionStart);

      return {
        handled: true,
        newValue,
        newCursorPos: selectionStart + 1 + newIndent.length,
      };
    }

    // Normal enter - maintain indentation
    const newValue =
      text.slice(0, selectionStart) + '\n' + currentIndent + text.slice(selectionStart);

    return {
      handled: true,
      newValue,
      newCursorPos: selectionStart + 1 + currentIndent.length,
    };
  }

  // Handle Backspace - delete matching pairs
  if (key === 'Backspace' && !hasSelection && selectionStart > 0) {
    if (isInsideEmptyPair(text, selectionStart)) {
      const newValue =
        text.slice(0, selectionStart - 1) + text.slice(selectionStart + 1);

      return {
        handled: true,
        newValue,
        newCursorPos: selectionStart - 1,
      };
    }
  }

  // Handle Tab - insert 2 spaces instead of losing focus
  if (key === 'Tab' && !shiftKey) {
    if (hasSelection) {
      // Indent selected lines
      const beforeSelection = text.slice(0, selectionStart);
      const afterSelection = text.slice(selectionEnd);
      
      // Find the start of the first selected line
      const lineStart = beforeSelection.lastIndexOf('\n') + 1;
      const prefix = text.slice(0, lineStart);
      const selectedWithLineStart = text.slice(lineStart, selectionEnd);
      
      // Add indent to each line
      const indented = selectedWithLineStart.replace(/^/gm, '  ');
      const newValue = prefix + indented + afterSelection;
      
      return {
        handled: true,
        newValue,
        newCursorPos: selectionEnd + (indented.length - selectedWithLineStart.length),
      };
    } else {
      const newValue =
        text.slice(0, selectionStart) + '  ' + text.slice(selectionEnd);

      return {
        handled: true,
        newValue,
        newCursorPos: selectionStart + 2,
      };
    }
  }

  // Handle Shift+Tab - unindent
  if (key === 'Tab' && shiftKey && !hasSelection) {
    const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1;
    const lineText = text.slice(lineStart, selectionStart);
    
    // Check if line starts with spaces we can remove
    if (lineText.startsWith('  ')) {
      const newValue = text.slice(0, lineStart) + lineText.slice(2) + text.slice(selectionStart);
      return {
        handled: true,
        newValue,
        newCursorPos: Math.max(lineStart, selectionStart - 2),
      };
    }
  }

  return { handled: false };
}

