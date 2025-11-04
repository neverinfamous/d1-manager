import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Loader2, CheckCircle2, XCircle, Info, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { validateConstraints, fixViolations, type ValidationReport, type FixResult } from '@/services/api';

interface ConstraintValidatorProps {
  databaseId: string;
  databaseName: string;
}

export function ConstraintValidator({ databaseId, databaseName }: ConstraintValidatorProps) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedViolations, setSelectedViolations] = useState<string[]>([]);
  const [showFixDialog, setShowFixDialog] = useState(false);
  const [fixStrategy, setFixStrategy] = useState<'delete' | 'set_null'>('delete');
  const [fixInProgress, setFixInProgress] = useState(false);
  const [fixProgress, setFixProgress] = useState(0);
  const [confirmFix, setConfirmFix] = useState(false);

  useEffect(() => {
    // Auto-run validation on mount
    runValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId]);

  const runValidation = async () => {
    try {
      setLoading(true);
      setError(null);
      const validationReport = await validateConstraints(databaseId);
      setReport(validationReport);
      setSelectedViolations([]); // Clear selection
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate constraints');
    } finally {
      setLoading(false);
    }
  };

  const toggleViolationSelection = (violationId: string) => {
    setSelectedViolations(prev => {
      if (prev.includes(violationId)) {
        return prev.filter(id => id !== violationId);
      } else {
        return [...prev, violationId];
      }
    });
  };

  const selectAllViolations = (type?: 'foreign_key' | 'not_null' | 'unique') => {
    if (!report) return;
    
    const violations = type 
      ? report.violations.filter(v => v.type === type && v.fixable)
      : report.violations.filter(v => v.fixable);
    
    setSelectedViolations(violations.map(v => v.id));
  };

  const clearSelection = () => {
    setSelectedViolations([]);
  };

  const openFixDialog = () => {
    if (selectedViolations.length === 0) return;
    setShowFixDialog(true);
    setConfirmFix(false);
    
    // Default to delete strategy
    setFixStrategy('delete');
  };

  const applyFixes = async () => {
    if (!confirmFix) return;
    
    try {
      setFixInProgress(true);
      setFixProgress(0);
      
      const results: FixResult[] = await fixViolations(databaseId, selectedViolations, fixStrategy);
      
      setFixProgress(100);
      
      // Check for errors
      const errors = results.filter(r => !r.success);
      if (errors.length > 0) {
        setError(`${errors.length} fix(es) failed. See details in console.`);
        console.error('Fix errors:', errors);
      }
      
      // Close dialog and refresh
      setShowFixDialog(false);
      setSelectedViolations([]);
      
      // Re-run validation to show updated state
      await runValidation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply fixes');
    } finally {
      setFixInProgress(false);
      setFixProgress(0);
    }
  };

  const getSeverityIcon = (severity: 'critical' | 'warning' | 'info') => {
    switch (severity) {
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-600 dark:text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-600 dark:text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: 'critical' | 'warning' | 'info') => {
    switch (severity) {
      case 'critical':
        return 'border-red-300 dark:border-red-700';
      case 'warning':
        return 'border-yellow-300 dark:border-yellow-700';
      case 'info':
        return 'border-blue-300 dark:border-blue-700';
    }
  };

  const getSelectedViolations = () => {
    if (!report) return [];
    return report.violations.filter(v => selectedViolations.includes(v.id));
  };

  const getTotalAffectedRows = () => {
    return getSelectedViolations().reduce((sum, v) => sum + v.affectedRows, 0);
  };

  const canSetNull = () => {
    // Check if all selected violations support set_null
    const selected = getSelectedViolations();
    return selected.every(v => v.fixStrategies?.includes('set_null'));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{databaseName}</h2>
          <p className="text-muted-foreground">Constraint Validator</p>
        </div>
        <Button onClick={runValidation} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Validating...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Run Validation
            </>
          )}
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <Card className="border-red-300 dark:border-red-700">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-600 dark:text-red-500">Error</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && !report && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report display */}
      {report && (
        <>
          {/* Health status */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {report.isHealthy ? (
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-500" />
                  ) : (
                    <AlertTriangle className="h-8 w-8 text-yellow-600 dark:text-yellow-500" />
                  )}
                  <div>
                    <h3 className="text-lg font-semibold">
                      {report.isHealthy ? 'Database Healthy' : 'Constraint Violations Detected'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Last validated: {new Date(report.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold">
                    {report.totalViolations}
                  </div>
                  <p className="text-sm text-muted-foreground">Total Violations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Foreign Key Violations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.violationsByType.foreign_key}</div>
                <p className="text-xs text-muted-foreground mt-1">Orphaned records</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">NOT NULL Violations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.violationsByType.not_null}</div>
                <p className="text-xs text-muted-foreground mt-1">NULL in NOT NULL columns</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">UNIQUE Violations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.violationsByType.unique}</div>
                <p className="text-xs text-muted-foreground mt-1">Duplicate values</p>
              </CardContent>
            </Card>
          </div>

          {/* Violations list */}
          {report.violations.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Violations</CardTitle>
                    <CardDescription>
                      {selectedViolations.length > 0 
                        ? `${selectedViolations.length} violation(s) selected`
                        : 'Select violations to apply fixes'}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {selectedViolations.length > 0 && (
                      <>
                        <Button variant="outline" size="sm" onClick={clearSelection}>
                          Clear Selection
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={openFixDialog}
                          disabled={selectedViolations.length === 0}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Fix Selected ({selectedViolations.length})
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {/* Foreign Key Violations */}
                  {report.violationsByType.foreign_key > 0 && (
                    <AccordionItem value="foreign_key">
                      <AccordionTrigger>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                          <span>Foreign Key Violations ({report.violationsByType.foreign_key})</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => selectAllViolations('foreign_key')}
                            className="mb-2"
                          >
                            Select All Fixable
                          </Button>
                          {report.violations
                            .filter(v => v.type === 'foreign_key')
                            .map(violation => (
                              <div 
                                key={violation.id} 
                                className={`border rounded-lg p-4 ${getSeverityColor(violation.severity)}`}
                              >
                                <div className="flex items-start gap-3">
                                  {violation.fixable && (
                                    <Checkbox 
                                      checked={selectedViolations.includes(violation.id)}
                                      onCheckedChange={() => toggleViolationSelection(violation.id)}
                                      className="mt-1"
                                    />
                                  )}
                                  <div className="flex-shrink-0 mt-0.5">
                                    {getSeverityIcon(violation.severity)}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-semibold">{violation.table}</span>
                                      {violation.column && (
                                        <>
                                          <span className="text-muted-foreground">•</span>
                                          <span className="font-mono text-sm">{violation.column}</span>
                                        </>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-2">{violation.details}</p>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                      <span>{violation.affectedRows} row(s) affected</span>
                                      {violation.metadata?.parentTable && (
                                        <span>References: {violation.metadata.parentTable}</span>
                                      )}
                                      {violation.fixable ? (
                                        <span className="text-green-600 dark:text-green-500">Fixable</span>
                                      ) : (
                                        <span className="text-yellow-600 dark:text-yellow-500">Manual fix required</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* NOT NULL Violations */}
                  {report.violationsByType.not_null > 0 && (
                    <AccordionItem value="not_null">
                      <AccordionTrigger>
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-600 dark:text-red-500" />
                          <span>NOT NULL Violations ({report.violationsByType.not_null})</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          {report.violations
                            .filter(v => v.type === 'not_null')
                            .map(violation => (
                              <div 
                                key={violation.id} 
                                className={`border rounded-lg p-4 ${getSeverityColor(violation.severity)}`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 mt-0.5">
                                    {getSeverityIcon(violation.severity)}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-semibold">{violation.table}</span>
                                      {violation.column && (
                                        <>
                                          <span className="text-muted-foreground">•</span>
                                          <span className="font-mono text-sm">{violation.column}</span>
                                        </>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-2">{violation.details}</p>
                                    <div className="flex items-center gap-4 text-xs">
                                      <span className="text-muted-foreground">{violation.affectedRows} row(s) affected</span>
                                      <span className="text-yellow-600 dark:text-yellow-500">Manual fix required</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* UNIQUE Violations */}
                  {report.violationsByType.unique > 0 && (
                    <AccordionItem value="unique">
                      <AccordionTrigger>
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-500" />
                          <span>UNIQUE Violations ({report.violationsByType.unique})</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          {report.violations
                            .filter(v => v.type === 'unique')
                            .map(violation => (
                              <div 
                                key={violation.id} 
                                className={`border rounded-lg p-4 ${getSeverityColor(violation.severity)}`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 mt-0.5">
                                    {getSeverityIcon(violation.severity)}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-semibold">{violation.table}</span>
                                      {violation.column && (
                                        <>
                                          <span className="text-muted-foreground">•</span>
                                          <span className="font-mono text-sm">{violation.column}</span>
                                        </>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-2">{violation.details}</p>
                                    <div className="flex items-center gap-4 text-xs">
                                      <span className="text-muted-foreground">{violation.affectedRows} row(s) affected</span>
                                      <span className="text-yellow-600 dark:text-yellow-500">Manual fix required</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Fix dialog */}
      <Dialog open={showFixDialog} onOpenChange={setShowFixDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply Fixes to Constraint Violations</DialogTitle>
            <DialogDescription>
              Select a fix strategy and confirm to apply changes. This operation will modify your data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Warning banner */}
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-900 dark:text-yellow-100">
                    This operation will modify your data
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    Backup recommended before proceeding. Changes cannot be undone automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Impact summary */}
            <div className="bg-muted rounded-lg p-4">
              <h4 className="font-medium mb-2">Impact Summary</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Selected Violations</p>
                  <p className="font-semibold">{selectedViolations.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Rows Affected</p>
                  <p className="font-semibold">{getTotalAffectedRows()}</p>
                </div>
              </div>
            </div>

            {/* Fix strategy selection */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Fix Strategy</Label>
              <RadioGroup value={fixStrategy} onValueChange={(value) => setFixStrategy(value as 'delete' | 'set_null')}>
                <div className="flex items-start space-x-2 border rounded-lg p-3">
                  <RadioGroupItem value="delete" id="delete" />
                  <div className="flex-1">
                    <Label htmlFor="delete" className="font-medium cursor-pointer">
                      Delete Orphaned Records
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Permanently delete rows that reference non-existent records. This is the most common fix.
                    </p>
                  </div>
                </div>
                
                <div className={`flex items-start space-x-2 border rounded-lg p-3 ${!canSetNull() ? 'opacity-50' : ''}`}>
                  <RadioGroupItem value="set_null" id="set_null" disabled={!canSetNull()} />
                  <div className="flex-1">
                    <Label htmlFor="set_null" className={`font-medium ${canSetNull() ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                      Set Foreign Keys to NULL
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {canSetNull() 
                        ? 'Keep rows but set foreign key columns to NULL. Only available for nullable columns.'
                        : 'Not available: selected violations include non-nullable columns.'}
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Confirmation checkbox */}
            <div className="flex items-start space-x-2 pt-2">
              <Checkbox 
                id="confirm-fix" 
                checked={confirmFix}
                onCheckedChange={(checked) => setConfirmFix(checked as boolean)}
              />
              <Label htmlFor="confirm-fix" className="text-sm cursor-pointer leading-relaxed">
                I understand this will modify <strong>{getTotalAffectedRows()} row(s)</strong> across{' '}
                <strong>{new Set(getSelectedViolations().map(v => v.table)).size} table(s)</strong>.
                I have backed up my data if needed.
              </Label>
            </div>

            {/* Progress */}
            {fixInProgress && (
              <div className="space-y-2">
                <Progress value={fixProgress} />
                <p className="text-sm text-center text-muted-foreground">
                  Applying fixes...
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFixDialog(false)} disabled={fixInProgress}>
              Cancel
            </Button>
            <Button 
              onClick={applyFixes} 
              disabled={!confirmFix || fixInProgress}
            >
              {fixInProgress ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Apply Fixes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

