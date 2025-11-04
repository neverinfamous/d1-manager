import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ForeignKeyBadgeProps {
  value: unknown;
  refTable: string;
  refColumn: string;
  onClick: () => void;
}

export function ForeignKeyBadge({ value, refTable, refColumn, onClick }: ForeignKeyBadgeProps) {
  // Don't make null/undefined values clickable
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">NULL</span>;
  }

  const displayValue = String(value);
  const tooltip = `References ${refTable}.${refColumn}`;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-auto py-0.5 px-2 font-mono text-xs hover:bg-primary/10 border border-primary/30 gap-1.5"
      title={tooltip}
    >
      <Link2 className="h-3 w-3 text-primary" />
      <span className="text-primary font-medium">{displayValue}</span>
    </Button>
  );
}

