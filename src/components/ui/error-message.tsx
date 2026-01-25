import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "./card";

const SUPPORT_EMAIL = "support@adamic.tech";

interface ErrorMessageProps {
  error: string | null | undefined;
  variant?: "default" | "inline" | "card";
  className?: string;
  showTitle?: boolean;
}

/**
 * Reusable error message component with support email link.
 *
 * Variants:
 * - default: Full-width error box with padding (for page-level errors)
 * - inline: Smaller text for dialog/form errors
 * - card: Wrapped in Card component (for section-level errors)
 */
function ErrorMessage({
  error,
  variant = "default",
  className,
  showTitle = false,
}: ErrorMessageProps): React.JSX.Element | null {
  if (!error) return null;

  const supportLink = (
    <a
      href={`mailto:${SUPPORT_EMAIL}?subject=D1 Manager Error Report`}
      className="underline hover:no-underline"
      aria-label={`Report this error via email to ${SUPPORT_EMAIL}`}
    >
      Report this error to {SUPPORT_EMAIL}
    </a>
  );

  if (variant === "card") {
    return (
      <Card className={cn("border-destructive", className)}>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
          <p className="text-sm text-destructive mt-2">{supportLink}</p>
        </CardContent>
      </Card>
    );
  }

  const baseStyles =
    variant === "inline"
      ? "bg-destructive/10 border border-destructive text-destructive px-3 py-2 rounded-lg text-sm"
      : "bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg";

  return (
    <div className={cn(baseStyles, className)} role="alert" aria-live="polite">
      {showTitle && <div className="font-semibold mb-1">Error</div>}
      <div className="whitespace-pre-line">{error}</div>
      <div className="mt-2 text-xs opacity-80">{supportLink}</div>
    </div>
  );
}

export { ErrorMessage, type ErrorMessageProps };
