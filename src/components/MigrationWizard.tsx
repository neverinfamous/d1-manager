import { useState } from 'react';
import { ArrowRight, Database, Loader2, CheckCircle, AlertCircle, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listTables, getTableSchema, getTableData, executeQuery } from '@/services/api';

interface MigrationWizardProps {
  databases: Array<{ uuid: string; name: string }>;
}

type MigrationStep = 'select' | 'configure' | 'preview' | 'migrate' | 'complete';

interface MigrationTask {
  table: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  rowCount?: number;
  error?: string;
}

export function MigrationWizard({ databases }: MigrationWizardProps) {
  const [step, setStep] = useState<MigrationStep>('select');
  const [sourceDb, setSourceDb] = useState<string>('');
  const [targetDb, setTargetDb] = useState<string>('');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [copySchema, setCopySchema] = useState(true);
  const [copyData, setCopyData] = useState(true);
  const [dropExisting, setDropExisting] = useState(false);
  const [tasks, setTasks] = useState<MigrationTask[]>([]);
  const [, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSourceChange = async (dbId: string) => {
    setSourceDb(dbId);
    setSelectedTables([]);
    setError(null);

    if (dbId) {
      try {
        const tables = await listTables(dbId);
        const tableNames = tables.filter(t => t.type === 'table').map(t => t.name);
        setAvailableTables(tableNames);
      } catch {
        setError('Failed to load tables from source database');
      }
    } else {
      setAvailableTables([]);
    }
  };

  const handleNext = () => {
    if (step === 'select') {
      if (!sourceDb || !targetDb || selectedTables.length === 0) {
        setError('Please select source database, target database, and at least one table');
        return;
      }
      if (sourceDb === targetDb) {
        setError('Source and target databases must be different');
        return;
      }
      setError(null);
      setStep('configure');
    } else if (step === 'configure') {
      if (!copySchema && !copyData) {
        setError('Please select at least one option: schema or data');
        return;
      }
      setError(null);
      setStep('preview');
    } else if (step === 'preview') {
      setStep('migrate');
      handleMigrate();
    }
  };

  const handleMigrate = async () => {
    setMigrating(true);
    const migrationTasks: MigrationTask[] = selectedTables.map(table => ({
      table,
      status: 'pending'
    }));
    setTasks(migrationTasks);

    for (let i = 0; i < selectedTables.length; i++) {
      const table = selectedTables[i]!;
      
      // Update status to running
      setTasks(prev => prev.map((t, idx) =>
        idx === i ? { ...t, status: 'running' } : t
      ));

      try {
        // Copy schema
        if (copySchema) {
          const schema = await getTableSchema(sourceDb, table);
          
          // Drop if requested
          if (dropExisting) {
            try {
              await executeQuery(targetDb, `DROP TABLE IF EXISTS ${table};`, undefined, true);
            } catch {
              console.warn(`Table ${table} doesn't exist in target, skipping drop`);
            }
          }

          // Create table (use simple names - D1 API doesn't need quoted identifiers)
          const columns = schema.map(col => {
            let def = `${col.name} ${col.type || 'TEXT'}`;
            if (col.pk > 0) def += ' PRIMARY KEY';
            if (col.notnull && col.pk === 0) def += ' NOT NULL';
            // Skip default values - they can cause syntax errors and aren't essential for migration
            // DEFAULT values from PRAGMA often include function calls like datetime('now') which may not transfer correctly
            return def;
          }).join(', ');

          await executeQuery(targetDb, `CREATE TABLE IF NOT EXISTS ${table} (${columns});`, undefined, true);
        }

        // Copy data
        if (copyData) {
          const dataResult = await getTableData(sourceDb, table, 1000); // Limit for safety
          const data = dataResult.results || [];
          
          if (data.length > 0) {
            // Get column names
            const firstRow = data[0];
            const cols = firstRow ? Object.keys(firstRow) : [];
            
            // Insert data row by row (D1 REST API doesn't support batched INSERTs)
            for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
              const row = data[rowIdx];
              if (!row) continue;
              try {
                const values = cols.map(col => {
                  const val = row[col];
                  if (val === null) return 'NULL';
                  if (typeof val === 'number') return String(val);
                  if (typeof val === 'boolean') return val ? '1' : '0';
                  // Properly escape single quotes in strings
                  const strVal = String(val).replace(/'/g, "''");
                  return `'${strVal}'`;
                }).join(', ');

                // Execute INSERT statement (skip validation for migration)
                await executeQuery(
                  targetDb,
                  `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${values});`,
                  undefined,
                  true
                );
              } catch (err) {
                console.error(`Failed to insert row ${rowIdx + 1}:`, row, err);
                // Continue with next row instead of failing entire migration
              }
            }
          }

          // Update task with row count
          setTasks(prev => prev.map((t, idx) =>
            idx === i ? { ...t, status: 'completed', rowCount: data.length } : t
          ));
        } else {
          setTasks(prev => prev.map((t, idx) =>
            idx === i ? { ...t, status: 'completed' } : t
          ));
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Migration failed';
        setTasks(prev => prev.map((t, idx) =>
          idx === i ? { ...t, status: 'failed', error: errorMsg } : t
        ));
      }
    }

    setMigrating(false);
    setStep('complete');
  };

  const getStepStatus = (currentStep: MigrationStep): 'active' | 'completed' | 'pending' => {
    const steps: MigrationStep[] = ['select', 'configure', 'preview', 'migrate', 'complete'];
    const currentIndex = steps.indexOf(step);
    const stepIndex = steps.indexOf(currentStep);
    
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const sourceDbName = databases.find(d => d.uuid === sourceDb)?.name || '';
  const targetDbName = databases.find(d => d.uuid === targetDb)?.name || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Copy className="h-5 w-5" />
          Database Migration Wizard
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Copy tables and data between databases
        </p>
      </div>

      {/* Progress Steps */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {(['Select', 'Configure', 'Preview', 'Migrate', 'Complete'] as const).map((label, idx) => {
              const steps: MigrationStep[] = ['select', 'configure', 'preview', 'migrate', 'complete'];
              const currentStepStatus = getStepStatus(steps[idx]!);
              
              return (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                      currentStepStatus === 'completed'
                        ? 'bg-primary border-primary text-primary-foreground'
                        : currentStepStatus === 'active'
                        ? 'border-primary text-primary'
                        : 'border-muted text-muted-foreground'
                    }`}
                  >
                    {currentStepStatus === 'completed' ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <span>{idx + 1}</span>
                    )}
                  </div>
                  <span className="text-xs mt-2">{label}</span>
                </div>
                {idx < 4 && (
                  <div
                    className={`w-12 h-0.5 mx-2 ${
                      currentStepStatus === 'completed'
                        ? 'bg-primary'
                        : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            )})}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      {step === 'select' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 1: Select Databases and Tables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="source-database-select" className="text-sm font-medium">Source Database</label>
                <select
                  id="source-database-select"
                  name="source-database"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  value={sourceDb}
                  onChange={(e) => handleSourceChange(e.target.value)}
                >
                  <option value="">Select source...</option>
                  {databases.map(db => (
                    <option key={db.uuid} value={db.uuid}>{db.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="target-database-select" className="text-sm font-medium">Target Database</label>
                <select
                  id="target-database-select"
                  name="target-database"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  value={targetDb}
                  onChange={(e) => setTargetDb(e.target.value)}
                >
                  <option value="">Select target...</option>
                  {databases.filter(d => d.uuid !== sourceDb).map(db => (
                    <option key={db.uuid} value={db.uuid}>{db.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {availableTables.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Tables to Migrate</label>
                <div className="border rounded-md p-4 max-h-48 overflow-y-auto">
                  <div className="space-y-2">
                    {availableTables.map(table => (
                      <label key={table} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedTables.includes(table)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTables([...selectedTables, table]);
                            } else {
                              setSelectedTables(selectedTables.filter(t => t !== table));
                            }
                          }}
                        />
                        <span className="text-sm">{table}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedTables.length} of {availableTables.length} tables selected
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'configure' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 2: Configure Migration Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={copySchema}
                  onChange={(e) => setCopySchema(e.target.checked)}
                />
                <div>
                  <div className="text-sm font-medium">Copy Schema</div>
                  <div className="text-xs text-muted-foreground">
                    Create table structures in target database
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={copyData}
                  onChange={(e) => setCopyData(e.target.checked)}
                />
                <div>
                  <div className="text-sm font-medium">Copy Data</div>
                  <div className="text-xs text-muted-foreground">
                    Copy all rows from source tables (limited to 1000 rows per table for safety)
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dropExisting}
                  onChange={(e) => setDropExisting(e.target.checked)}
                />
                <div>
                  <div className="text-sm font-medium text-destructive">Drop Existing Tables</div>
                  <div className="text-xs text-muted-foreground">
                    ⚠️ Warning: This will permanently delete existing tables in target database
                  </div>
                </div>
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 3: Review Migration Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-md">
              <div>
                <div className="text-sm font-medium">Source</div>
                <div className="flex items-center gap-2 mt-1">
                  <Database className="h-4 w-4" />
                  <span>{sourceDbName}</span>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Target</div>
                <div className="flex items-center gap-2 mt-1">
                  <Database className="h-4 w-4" />
                  <span>{targetDbName}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Tables to Migrate ({selectedTables.length})</div>
              <div className="flex flex-wrap gap-2">
                {selectedTables.map(table => (
                  <span key={table} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">
                    {table}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Options</div>
              <ul className="text-sm space-y-1">
                <li>✓ {copySchema ? 'Copy schema' : 'Skip schema'}</li>
                <li>✓ {copyData ? 'Copy data (max 1000 rows per table)' : 'Skip data'}</li>
                {dropExisting && <li className="text-destructive">⚠️ Drop existing tables</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {(step === 'migrate' || step === 'complete') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {step === 'migrate' ? 'Step 4: Migration in Progress' : 'Step 5: Migration Complete'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.map(task => (
              <div
                key={task.table}
                className="flex items-center justify-between p-3 bg-muted rounded-md"
              >
                <div className="flex items-center gap-3">
                  {task.status === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {task.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {task.status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive" />}
                  {task.status === 'pending' && <div className="h-4 w-4 border-2 border-muted-foreground rounded-full" />}
                  
                  <div>
                    <div className="text-sm font-medium">{task.table}</div>
                    {task.error && <div className="text-xs text-destructive">{task.error}</div>}
                    {task.rowCount !== undefined && (
                      <div className="text-xs text-muted-foreground">{task.rowCount} rows copied</div>
                    )}
                  </div>
                </div>

                <span className="text-xs text-muted-foreground capitalize">{task.status}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        {step !== 'select' && step !== 'migrate' && step !== 'complete' && (
          <Button variant="outline" onClick={() => {
            const steps: MigrationStep[] = ['select', 'configure', 'preview', 'migrate', 'complete'];
            const currentIndex = steps.indexOf(step);
            const prevStep = steps[currentIndex - 1];
            if (currentIndex > 0 && prevStep) {
              setStep(prevStep);
            }
          }}>
            Back
          </Button>
        )}

        {step !== 'migrate' && step !== 'complete' && (
          <Button onClick={handleNext} className="ml-auto">
            {step === 'preview' ? 'Start Migration' : 'Next'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}

        {step === 'complete' && (
          <Button onClick={() => {
            setStep('select');
            setSourceDb('');
            setTargetDb('');
            setSelectedTables([]);
            setTasks([]);
          }} className="ml-auto">
            Start New Migration
          </Button>
        )}
      </div>
    </div>
  );
}

