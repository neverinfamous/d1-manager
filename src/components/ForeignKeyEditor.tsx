import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTableSchema, type ColumnInfo, type ForeignKeyGraphNode } from '@/services/api';

interface ForeignKeyEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databaseId: string;
  mode: 'add' | 'edit';
  nodes: ForeignKeyGraphNode[];
  existingConstraint?: {
    id: string;
    source: string;
    target: string;
    sourceColumn: string;
    targetColumn: string;
    onDelete: string;
    onUpdate: string;
  };
  onSave: (params: {
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    onDelete: string;
    onUpdate: string;
    constraintName?: string;
  }) => Promise<void>;
}

const FK_ACTIONS = ['NO ACTION', 'CASCADE', 'RESTRICT', 'SET NULL', 'SET DEFAULT'];

export function ForeignKeyEditor({
  open,
  onOpenChange,
  databaseId,
  mode,
  nodes,
  existingConstraint,
  onSave
}: ForeignKeyEditorProps) {
  const [sourceTable, setSourceTable] = useState('');
  const [sourceColumn, setSourceColumn] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [targetColumn, setTargetColumn] = useState('');
  const [onDelete, setOnDelete] = useState('NO ACTION');
  const [onUpdate, setOnUpdate] = useState('NO ACTION');
  const [constraintName, setConstraintName] = useState('');
  
  const [sourceColumns, setSourceColumns] = useState<ColumnInfo[]>([]);
  const [targetColumns, setTargetColumns] = useState<ColumnInfo[]>([]);
  
  const [loadingSourceCols, setLoadingSourceCols] = useState(false);
  const [loadingTargetCols, setLoadingTargetCols] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  
  // Initialize from existing constraint if in edit mode
  useEffect(() => {
    if (open && mode === 'edit' && existingConstraint) {
      setSourceTable(existingConstraint.source);
      setSourceColumn(existingConstraint.sourceColumn);
      setTargetTable(existingConstraint.target);
      setTargetColumn(existingConstraint.targetColumn);
      setOnDelete(existingConstraint.onDelete);
      setOnUpdate(existingConstraint.onUpdate);
    } else if (open && mode === 'add') {
      // Reset for add mode
      setSourceTable('');
      setSourceColumn('');
      setTargetTable('');
      setTargetColumn('');
      setOnDelete('NO ACTION');
      setOnUpdate('NO ACTION');
      setConstraintName('');
    }
  }, [open, mode, existingConstraint]);
  
  // Load source table columns
  useEffect(() => {
    if (!sourceTable) {
      setSourceColumns([]);
      return;
    }
    
    const loadSourceColumns = async () => {
      setLoadingSourceCols(true);
      try {
        const cols = await getTableSchema(databaseId, sourceTable);
        setSourceColumns(cols);
      } catch (err) {
        console.error('Failed to load source columns:', err);
        setError('Failed to load source table columns');
      } finally {
        setLoadingSourceCols(false);
      }
    };
    
    loadSourceColumns();
  }, [databaseId, sourceTable]);
  
  // Load target table columns
  useEffect(() => {
    if (!targetTable) {
      setTargetColumns([]);
      return;
    }
    
    const loadTargetColumns = async () => {
      setLoadingTargetCols(true);
      try {
        const cols = await getTableSchema(databaseId, targetTable);
        setTargetColumns(cols);
      } catch (err) {
        console.error('Failed to load target columns:', err);
        setError('Failed to load target table columns');
      } finally {
        setLoadingTargetCols(false);
      }
    };
    
    loadTargetColumns();
  }, [databaseId, targetTable]);
  
  // Validate column type compatibility
  useEffect(() => {
    if (!sourceColumn || !targetColumn || sourceColumns.length === 0 || targetColumns.length === 0) {
      setWarnings([]);
      return;
    }
    
    const sourceCol = sourceColumns.find(c => c.name === sourceColumn);
    const targetCol = targetColumns.find(c => c.name === targetColumn);
    
    if (!sourceCol || !targetCol) return;
    
    const newWarnings: string[] = [];
    
    // Check type compatibility
    if (sourceCol.type !== targetCol.type) {
      newWarnings.push(`Column types differ: ${sourceCol.type} vs ${targetCol.type}. SQLite may allow this with implicit conversion.`);
    }
    
    // Check if target column is a primary key or has unique constraint
    if (targetCol.pk === 0) {
      newWarnings.push('Target column should ideally be a PRIMARY KEY or have a UNIQUE constraint.');
    }
    
    // Warn about CASCADE operations
    if (onDelete === 'CASCADE') {
      newWarnings.push('CASCADE on DELETE will automatically delete rows in this table when referenced rows are deleted.');
    }
    if (onUpdate === 'CASCADE') {
      newWarnings.push('CASCADE on UPDATE will automatically update the foreign key value when the referenced value changes.');
    }
    
    setWarnings(newWarnings);
  }, [sourceColumn, targetColumn, sourceColumns, targetColumns, onDelete, onUpdate]);
  
  const handleSave = async () => {
    setError(null);
    
    // Validation
    if (!sourceTable || !sourceColumn || !targetTable || !targetColumn) {
      setError('All fields are required');
      return;
    }
    
    if (sourceTable === targetTable && sourceColumn === targetColumn) {
      setError('Cannot create foreign key referencing the same column');
      return;
    }
    
    setSaving(true);
    
    try {
      await onSave({
        sourceTable,
        sourceColumn,
        targetTable,
        targetColumn,
        onDelete,
        onUpdate,
        constraintName: constraintName.trim() || undefined
      });
      
      // Reset form
      setSourceTable('');
      setSourceColumn('');
      setTargetTable('');
      setTargetColumn('');
      setOnDelete('NO ACTION');
      setOnUpdate('NO ACTION');
      setConstraintName('');
      setError(null);
      setWarnings([]);
      
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save foreign key');
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'add' ? 'Add Foreign Key Constraint' : 'Edit Foreign Key Constraint'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'add' 
              ? 'Define a foreign key relationship between two tables.' 
              : 'Modify the ON DELETE and ON UPDATE behaviors for this foreign key.'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Source Table */}
          <div className="grid gap-2">
            <Label htmlFor="source-table">Source Table (Child)</Label>
            <Select
              value={sourceTable}
              onValueChange={setSourceTable}
              disabled={mode === 'edit' || saving}
            >
              <SelectTrigger id="source-table">
                <SelectValue placeholder="Select source table..." />
              </SelectTrigger>
              <SelectContent>
                {nodes.map(node => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Source Column */}
          <div className="grid gap-2">
            <Label htmlFor="source-column">Source Column</Label>
            <Select
              value={sourceColumn}
              onValueChange={setSourceColumn}
              disabled={!sourceTable || loadingSourceCols || mode === 'edit' || saving}
            >
              <SelectTrigger id="source-column">
                <SelectValue placeholder={
                  loadingSourceCols ? 'Loading columns...' : 
                  !sourceTable ? 'Select source table first' :
                  'Select source column...'
                } />
              </SelectTrigger>
              <SelectContent>
                {sourceColumns.map(col => (
                  <SelectItem key={col.name} value={col.name}>
                    {col.name} ({col.type || 'ANY'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Target Table */}
          <div className="grid gap-2">
            <Label htmlFor="target-table">Target Table (Parent)</Label>
            <Select
              value={targetTable}
              onValueChange={setTargetTable}
              disabled={mode === 'edit' || saving}
            >
              <SelectTrigger id="target-table">
                <SelectValue placeholder="Select target table..." />
              </SelectTrigger>
              <SelectContent>
                {nodes.filter(node => node.id !== sourceTable).map(node => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Target Column */}
          <div className="grid gap-2">
            <Label htmlFor="target-column">Target Column (Referenced)</Label>
            <Select
              value={targetColumn}
              onValueChange={setTargetColumn}
              disabled={!targetTable || loadingTargetCols || mode === 'edit' || saving}
            >
              <SelectTrigger id="target-column">
                <SelectValue placeholder={
                  loadingTargetCols ? 'Loading columns...' :
                  !targetTable ? 'Select target table first' :
                  'Select target column...'
                } />
              </SelectTrigger>
              <SelectContent>
                {targetColumns.map(col => (
                  <SelectItem key={col.name} value={col.name}>
                    {col.name} ({col.type || 'ANY'})
                    {col.pk > 0 && ' [PK]'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* ON DELETE */}
          <div className="grid gap-2">
            <Label htmlFor="on-delete">ON DELETE</Label>
            <Select
              value={onDelete}
              onValueChange={setOnDelete}
              disabled={saving}
            >
              <SelectTrigger id="on-delete">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FK_ACTIONS.map(action => (
                  <SelectItem key={action} value={action}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              What happens to child rows when parent row is deleted
            </p>
          </div>
          
          {/* ON UPDATE */}
          <div className="grid gap-2">
            <Label htmlFor="on-update">ON UPDATE</Label>
            <Select
              value={onUpdate}
              onValueChange={setOnUpdate}
              disabled={saving}
            >
              <SelectTrigger id="on-update">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FK_ACTIONS.map(action => (
                  <SelectItem key={action} value={action}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              What happens to child rows when parent key is updated
            </p>
          </div>
          
          {/* Constraint Name (optional) */}
          {mode === 'add' && (
            <div className="grid gap-2">
              <Label htmlFor="constraint-name">Constraint Name (Optional)</Label>
              <Input
                id="constraint-name"
                placeholder="Leave empty for auto-generated name"
                value={constraintName}
                onChange={(e) => setConstraintName(e.target.value)}
                disabled={saving}
              />
            </div>
          )}
          
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  {warnings.map((warning, index) => (
                    <p key={index} className="text-sm text-yellow-800 dark:text-yellow-200">
                      {warning}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive text-destructive px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              saving ||
              !sourceTable ||
              !sourceColumn ||
              !targetTable ||
              !targetColumn ||
              loadingSourceCols ||
              loadingTargetCols
            }
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saving ? 'Saving...' : mode === 'add' ? 'Add Foreign Key' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

