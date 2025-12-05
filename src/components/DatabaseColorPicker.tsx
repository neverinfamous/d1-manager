import { useState, useRef, useLayoutEffect } from 'react'
import { Palette, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DatabaseColor } from '@/services/api'
import { DATABASE_COLORS, getColorConfig } from '@/utils/databaseColors'

interface DatabaseColorPickerProps {
  /** Current color value */
  value: DatabaseColor
  /** Callback when color changes */
  onChange: (color: DatabaseColor) => Promise<void> | void
  /** Disable the picker */
  disabled?: boolean
}

interface DropdownPosition {
  top?: number
  bottom?: number
  right: number
}

/**
 * Color picker for database visual organization
 */
export function DatabaseColorPicker({
  value,
  onChange,
  disabled = false,
}: DatabaseColorPickerProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [position, setPosition] = useState<DropdownPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Calculate fixed position for dropdown based on button position and available space
  useLayoutEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth
      const spaceBelow = viewportHeight - rect.bottom
      const dropdownHeight = 180 // Approximate height including "Remove color" button
      
      // Calculate right position (align right edge of dropdown with right edge of button)
      const rightPos = viewportWidth - rect.right
      
      // Open above if not enough space below (with some margin)
      if (spaceBelow < dropdownHeight + 10) {
        setPosition({
          bottom: viewportHeight - rect.top + 4,
          right: rightPos
        })
      } else {
        setPosition({
          top: rect.bottom + 4,
          right: rightPos
        })
      }
    } else {
      setPosition(null)
    }
  }, [isOpen])

  const handleColorSelect = async (color: DatabaseColor): Promise<void> => {
    setLoading(true)
    try {
      await onChange(color)
      setIsOpen(false)
    } finally {
      setLoading(false)
    }
  }

  const currentColor = getColorConfig(value)

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        disabled={disabled || loading}
        className="h-8 w-8 p-0"
        title={currentColor ? `Color: ${currentColor.label}` : 'Set color'}
        aria-label={currentColor ? `Color: ${currentColor.label}` : 'Set color'}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : currentColor ? (
          <div className={`w-4 h-4 rounded-full ${currentColor.bgClass}`} />
        ) : (
          <Palette className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(false)
            }}
          />
          
          {/* Dropdown - uses fixed positioning to escape overflow containers */}
          {position && (
            <div 
              className="fixed z-50 bg-popover border rounded-lg shadow-lg p-3"
              style={{
                top: position.top !== undefined ? `${String(position.top)}px` : undefined,
                bottom: position.bottom !== undefined ? `${String(position.bottom)}px` : undefined,
                right: `${String(position.right)}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-6 gap-1.5">
                {DATABASE_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => void handleColorSelect(color.value)}
                    disabled={loading}
                    className={`w-6 h-6 rounded-full transition-all ${color.bgClass} ${
                      value === color.value ? 'ring-2 ring-offset-1 ring-offset-background ring-primary' : 'hover:scale-110'
                    }`}
                    title={color.label}
                    aria-label={`Set color to ${color.label}`}
                  />
                ))}
              </div>
              {value && (
                <button
                  type="button"
                  onClick={() => void handleColorSelect(null)}
                  disabled={loading}
                  className="w-full mt-2 pt-2 border-t text-xs text-muted-foreground hover:text-destructive flex items-center justify-center gap-1 py-1"
                >
                  <X className="h-3 w-3" />
                  Remove color
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
