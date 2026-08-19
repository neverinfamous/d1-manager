import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface EditableCellProps {
  initialValue: unknown;
  columnName: string;
  onSave: (value: string) => Promise<void>;
  type?: string;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function EditableCell({
  initialValue,
  onSave,
}: EditableCellProps) {
  const formatInitialValue = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    if (typeof val === "string") return val;
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    return JSON.stringify(val);
  };

  const [value, setValue] = useState(formatInitialValue(initialValue));
  const [prevInitial, setPrevInitial] = useState(initialValue);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  if (initialValue !== prevInitial) {
    setPrevInitial(initialValue);
    setValue(formatInitialValue(initialValue));
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleBlur = async (): Promise<void> => {
    setIsEditing(false);
    
    // Only save if value changed
    if (value === formatInitialValue(initialValue)) {
      return;
    }

    setIsSaving(true);
    setStatus("idle");

    try {
      await onSave(value);
      setStatus("success");
      // Flash green then return to idle
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      // Revert to original
      setValue(formatInitialValue(initialValue));
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setValue(formatInitialValue(initialValue));
      setIsEditing(false);
    }
  };

  const renderPreview = (val: string): ReactNode => {
    if (/^https?:\/\//.test(val)) {
      const isImage = /\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i.test(val);
      if (isImage) {
        return (
          <a
            href={val}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block h-8 max-w-[100px] overflow-hidden rounded border border-border/50 hover:opacity-80 transition-opacity"
            title={val}
          >
            <img src={val} alt="Preview" className="w-full h-full object-cover" />
          </a>
        );
      }
      return (
        <a
          href={val}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-500 hover:underline truncate block"
          title={val}
        >
          {val}
        </a>
      );
    }
    return <span className="truncate block">{val}</span>;
  };

  if (!isEditing && !isSaving && status === "idle") {
    return (
      <div
        tabIndex={0}
        role="button"
        className="px-2 py-1.5 cursor-text min-h-[32px] rounded border border-transparent hover:border-border hover:bg-muted/50 transition-colors truncate focus:outline-none focus:ring-1 focus:ring-ring"
        onClick={() => setIsEditing(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setIsEditing(true);
          }
        }}
      >
        {initialValue === null ? (
          <span className="italic text-muted-foreground">NULL</span>
        ) : (
          renderPreview(value)
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void handleBlur()}
        onKeyDown={handleKeyDown}
        className={`h-8 rounded-sm ${
          status === "error"
            ? "border-destructive focus-visible:ring-destructive"
            : status === "success"
            ? "border-green-500 focus-visible:ring-green-500 bg-green-50 dark:bg-green-900/20"
            : isSaving
            ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
            : "border-primary"
        }`}
        disabled={isSaving}
      />
      {isSaving && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-yellow-600" />
      )}
    </div>
  );
}
