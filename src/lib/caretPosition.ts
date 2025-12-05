/**
 * Caret Position Utility
 * Calculates pixel coordinates of the cursor in a textarea
 * Uses a hidden mirror element technique
 */

/** Coordinates relative to the textarea */
export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

/** CSS properties to copy from textarea to mirror element */
const MIRROR_PROPERTIES = [
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'whiteSpace',
  'wordWrap',
  'wordBreak',
] as const;

/**
 * Calculate pixel coordinates of the caret in a textarea
 * @param textarea - The textarea element
 * @param position - Character position in the text (defaults to selectionStart)
 * @returns Coordinates relative to the textarea's top-left corner
 */
export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position?: number
): CaretCoordinates {
  const pos = position ?? textarea.selectionStart;
  
  // Create mirror div
  const mirror = document.createElement('div');
  mirror.id = 'textarea-caret-mirror';
  
  // Apply matching styles
  const computed = window.getComputedStyle(textarea);
  
  // Position off-screen
  mirror.style.position = 'absolute';
  mirror.style.top = '-9999px';
  mirror.style.left = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  
  // Copy relevant styles
  for (const prop of MIRROR_PROPERTIES) {
    const value = computed.getPropertyValue(
      prop.replace(/([A-Z])/g, '-$1').toLowerCase()
    );
    mirror.style.setProperty(
      prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
      value
    );
  }
  
  // Set width explicitly for accurate measurement
  mirror.style.width = `${String(textarea.offsetWidth)}px`;
  
  // Handle scrolling - we need fixed height
  mirror.style.height = 'auto';
  mirror.style.overflow = 'hidden';
  
  document.body.appendChild(mirror);
  
  try {
    // Get text up to cursor
    const textBeforeCursor = textarea.value.substring(0, pos);
    
    // Create text node for content before cursor
    mirror.textContent = textBeforeCursor;
    
    // Create span for cursor position measurement
    const cursorSpan = document.createElement('span');
    cursorSpan.textContent = '|'; // Use a character to get height
    mirror.appendChild(cursorSpan);
    
    // Get the span's position
    const spanRect = cursorSpan.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    
    // Calculate position relative to mirror (which has same layout as textarea)
    const top = spanRect.top - mirrorRect.top;
    const left = spanRect.left - mirrorRect.left;
    
    // Account for textarea scroll position
    const scrollTop = textarea.scrollTop;
    const scrollLeft = textarea.scrollLeft;
    
    return {
      top: top - scrollTop,
      left: left - scrollLeft,
      height: spanRect.height,
    };
  } finally {
    // Clean up
    document.body.removeChild(mirror);
  }
}

/**
 * Get the bounding rect of the textarea relative to the viewport
 * Combined with caret coordinates, gives absolute popup position
 */
export function getTextareaRect(textarea: HTMLTextAreaElement): DOMRect {
  return textarea.getBoundingClientRect();
}

