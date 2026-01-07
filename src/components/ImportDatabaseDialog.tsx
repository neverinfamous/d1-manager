/**
 * Import Database Dialog
 * 
 * Multi-format import wizard supporting SQL, JSON, and CSV (ZIP) formats.
 * Counterpart to ExportDatabaseDialog - handles D1 Manager export files.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Upload,
    Loader2,
    FileText,
    FileJson,
    Table2,
    Info,
    CheckCircle,
    AlertTriangle,
} from 'lucide-react';
import { type D1Database } from '@/services/api';
import {
    detectFormat,
    parseJsonExport,
    parseCsvZipExport,
    convertJsonToSql,
    convertCsvZipToSql,
    validateSqlContent,
    type ImportFormat,
    type ImportPreview,
} from '@/services/importApi';
import { ErrorMessage } from '@/components/ui/error-message';

interface ImportDatabaseDialogProps {
    open: boolean;
    databases: D1Database[];
    onClose: () => void;
    onImport: (options: {
        sqlContent: string;
        createNew: boolean;
        databaseName?: string;
        targetDatabaseId?: string;
    }) => Promise<void>;
}

type Step = 'upload' | 'preview' | 'options' | 'progress';

export function ImportDatabaseDialog({
    open,
    databases,
    onClose,
    onImport,
}: ImportDatabaseDialogProps): React.JSX.Element {
    // Step state
    const [step, setStep] = useState<Step>('upload');

    // File state
    const [file, setFile] = useState<File | null>(null);
    const [fileContent, setFileContent] = useState<string>('');
    const [detectedFormat, setDetectedFormat] = useState<ImportFormat>('sql');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    // Import options
    const [importMode, setImportMode] = useState<'create' | 'existing'>('create');
    const [newDbName, setNewDbName] = useState('');
    const [targetDbId, setTargetDbId] = useState('');
    const [includeSchema, setIncludeSchema] = useState(true);
    const [deferForeignKeys, setDeferForeignKeys] = useState(true);

    // Progress state
    const [importing, setImporting] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setStep('upload');
            setFile(null);
            setFileContent('');
            setDetectedFormat('sql');
            setPreview(null);
            setImportMode('create');
            setNewDbName('');
            setTargetDbId('');
            setIncludeSchema(true);
            setDeferForeignKeys(true);
            setImporting(false);
            setCompleted(false);
            setError(null);
            setWarnings([]);
        }
    }, [open]);

    const handleFileSelect = useCallback(async (selectedFile: File) => {
        setFile(selectedFile);
        setError(null);
        setLoadingPreview(true);

        try {
            // Detect format
            const isZip = selectedFile.name.toLowerCase().endsWith('.zip');

            if (isZip) {
                // Handle ZIP (CSV export)
                setDetectedFormat('csv');
                const csvPreview = await parseCsvZipExport(selectedFile);
                setPreview(csvPreview);
                setWarnings(csvPreview.warnings);

                // Suggest database name from metadata if available
                if (csvPreview.tables.length > 0) {
                    setNewDbName(`imported-${new Date().toISOString().slice(0, 10)}`);
                }
            } else {
                // Read file content for non-ZIP files
                const content = await selectedFile.text();
                setFileContent(content);

                const detected = detectFormat(content, selectedFile.name);
                setDetectedFormat(detected.format);

                if (detected.format === 'json') {
                    const jsonPreview = parseJsonExport(content);
                    setPreview(jsonPreview);
                    setWarnings(jsonPreview.warnings);
                } else {
                    // SQL - validate and count tables
                    const validation = validateSqlContent(content);
                    setWarnings(validation.warnings);

                    // Create a basic preview for SQL
                    const tableMatches: string[] = content.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/gi) ?? [];
                    const insertMatches: string[] = content.match(/INSERT\s+INTO\s+["']?(\w+)["']?/gi) ?? [];

                    const tableNames = new Set<string>();
                    for (const match of tableMatches) {
                        const name = match.replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?/i, '').replace(/["']?$/, '');
                        tableNames.add(name);
                    }
                    for (const match of insertMatches) {
                        const name = match.replace(/INSERT\s+INTO\s+["']?/i, '').replace(/["']?$/, '');
                        tableNames.add(name);
                    }

                    setPreview({
                        format: 'sql',
                        tables: Array.from(tableNames).map(name => ({
                            name,
                            columns: [],
                            rowCount: 0,
                            hasSchema: tableMatches.some(m => m.toLowerCase().includes(name.toLowerCase()))
                        })),
                        totalRows: insertMatches.length,
                        estimatedSqlSize: content.length,
                        warnings: validation.warnings
                    });
                }
            }

            // Extract database name suggestion from filename
            const baseName = selectedFile.name.replace(/\.[^.]+$/, '').replace(/-\d{4}-\d{2}-\d{2}.*$/, '');
            if (baseName && !baseName.includes('export')) {
                setNewDbName(baseName);
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to parse file');
        } finally {
            setLoadingPreview(false);
        }
    }, []);

    const handleImport = async (): Promise<void> => {
        setImporting(true);
        setError(null);
        setCompleted(false);

        try {
            let sqlContent: string;

            // Convert to SQL based on format
            if (detectedFormat === 'json' && fileContent) {
                sqlContent = convertJsonToSql(fileContent, { includeSchema, deferForeignKeys });
            } else if (detectedFormat === 'csv' && file) {
                sqlContent = await convertCsvZipToSql(file, { includeSchema, deferForeignKeys });
            } else {
                sqlContent = fileContent;
            }

            // Validate SQL
            const validation = validateSqlContent(sqlContent);
            if (!validation.valid) {
                throw new Error(validation.errors.join('; '));
            }

            // Execute import
            await onImport({
                sqlContent,
                createNew: importMode === 'create',
                ...(importMode === 'create' ? { databaseName: newDbName } : {}),
                ...(importMode === 'existing' ? { targetDatabaseId: targetDbId } : {}),
            });

            setCompleted(true);
        } catch (err) {
            // Parse and improve error messages for common issues
            const errorMessage = err instanceof Error ? err.message : 'Import failed';

            // Check for common error patterns and provide user-friendly messages
            if (errorMessage.includes('already exists') || errorMessage.includes('7502')) {
                setError(`A database named "${newDbName}" already exists. Please choose a different name or import into the existing database.`);
            } else if (errorMessage.includes('Failed to create database')) {
                setError('Failed to create database. Please check the database name and try again.');
            } else if (errorMessage.includes('SQLITE_CONSTRAINT')) {
                setError('Import failed due to constraint violation. The target database may already contain conflicting data.');
            } else {
                setError(errorMessage);
            }
        } finally {
            setImporting(false);
        }
    };

    const handleNext = (): void => {
        setError(null);

        if (step === 'upload') {
            setStep('preview');
        } else if (step === 'preview') {
            setStep('options');
        } else if (step === 'options') {
            setStep('progress');
            void handleImport();
        }
    };

    const handleBack = (): void => {
        setError(null);

        if (step === 'preview') {
            setStep('upload');
        } else if (step === 'options') {
            setStep('preview');
        }
    };

    const handleClose = (): void => {
        if (!importing) {
            onClose();
        }
    };

    const canProceed = (): boolean => {
        if (step === 'upload') return file !== null && !loadingPreview;
        if (step === 'preview') return preview !== null;
        if (step === 'options') {
            if (importMode === 'create') return newDbName.trim().length > 0;
            if (importMode === 'existing') return targetDbId.length > 0;
        }
        return false;
    };

    const getFormatIcon = (format: ImportFormat): React.ReactNode => {
        switch (format) {
            case 'sql': return <FileText className="h-5 w-5 text-blue-600" />;
            case 'json': return <FileJson className="h-5 w-5 text-green-600" />;
            case 'csv': return <Table2 className="h-5 w-5 text-orange-600" />;
        }
    };

    const getFormatLabel = (format: ImportFormat): string => {
        switch (format) {
            case 'sql': return 'SQL Dump';
            case 'json': return 'JSON Export';
            case 'csv': return 'CSV (ZIP)';
        }
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5 text-primary" />
                        Import Database
                    </DialogTitle>
                    <DialogDescription>
                        Import from D1 Manager export files (SQL, JSON, or CSV)
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    {/* Step 1: File Upload */}
                    {step === 'upload' && (
                        <>
                            <div className="space-y-3">
                                <Label htmlFor="import-file">Select Export File</Label>
                                <div className="relative">
                                    <Input
                                        id="import-file"
                                        type="file"
                                        accept=".sql,.json,.zip"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) void handleFileSelect(f);
                                        }}
                                        className="file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer cursor-pointer"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Accepts .sql, .json, or .zip (CSV export) files
                                </p>
                            </div>

                            {loadingPreview && (
                                <div className="flex items-center justify-center py-6">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    <span className="ml-2 text-sm text-muted-foreground">Analyzing file...</span>
                                </div>
                            )}

                            {file && !loadingPreview && (
                                <div className="bg-muted/50 rounded-lg p-3">
                                    <div className="flex items-center gap-2">
                                        {getFormatIcon(detectedFormat)}
                                        <div>
                                            <p className="font-medium text-sm">{file.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Detected format: {getFormatLabel(detectedFormat)} ({(file.size / 1024).toFixed(1)} KB)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Cross-account info */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                                <div className="flex items-start gap-2">
                                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                    <div className="text-xs text-blue-700 dark:text-blue-300">
                                        <span className="font-medium">Cross-Account Import:</span> Use export files from another
                                        D1 Manager instance or files created with the Export dialog.
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Step 2: Preview */}
                    {step === 'preview' && preview && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 pb-2 border-b">
                                {getFormatIcon(preview.format)}
                                <span className="font-medium">{getFormatLabel(preview.format)} Preview</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-muted/50 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold">{preview.tables.length}</p>
                                    <p className="text-xs text-muted-foreground">Tables</p>
                                </div>
                                <div className="bg-muted/50 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold">{preview.totalRows.toLocaleString()}</p>
                                    <p className="text-xs text-muted-foreground">Rows</p>
                                </div>
                            </div>

                            {preview.tables.length > 0 && (
                                <div className="border rounded-md p-3 max-h-32 overflow-y-auto">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Tables to import:</p>
                                    <div className="flex flex-wrap gap-1">
                                        {preview.tables.map(table => (
                                            <span
                                                key={table.name}
                                                className="text-xs px-2 py-1 bg-muted rounded"
                                            >
                                                {table.name} {table.rowCount > 0 && `(${table.rowCount})`}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {warnings.length > 0 && (
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                        <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                                            {warnings.map((w, i) => (
                                                <p key={i}>{w}</p>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Import Options */}
                    {step === 'options' && (
                        <div className="space-y-4">
                            <fieldset className="space-y-3">
                                <legend className="text-sm font-medium leading-none mb-3">Import Target</legend>
                                <RadioGroup value={importMode} onValueChange={(v) => setImportMode(v as 'create' | 'existing')}>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="create" id="mode-create" />
                                        <Label htmlFor="mode-create" className="font-normal cursor-pointer">
                                            Create new database
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="existing" id="mode-existing" />
                                        <Label htmlFor="mode-existing" className="font-normal cursor-pointer">
                                            Import into existing database
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </fieldset>

                            {importMode === 'create' && (
                                <div className="space-y-2">
                                    <Label htmlFor="new-db-name">New Database Name</Label>
                                    <Input
                                        id="new-db-name"
                                        placeholder="my-database"
                                        value={newDbName}
                                        onChange={(e) => setNewDbName(e.target.value)}
                                    />
                                </div>
                            )}

                            {importMode === 'existing' && (
                                <div className="space-y-2">
                                    <Label htmlFor="target-db">Target Database</Label>
                                    <Select value={targetDbId} onValueChange={setTargetDbId}>
                                        <SelectTrigger id="target-db">
                                            <SelectValue placeholder="Select a database" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {databases.map((db) => (
                                                <SelectItem key={db.uuid} value={db.uuid}>
                                                    {db.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {detectedFormat !== 'sql' && (
                                <div className="space-y-3 pt-2 border-t">
                                    <p className="text-sm font-medium">Conversion Options</p>

                                    <div className="flex items-start gap-3">
                                        <Checkbox
                                            id="include-schema"
                                            checked={includeSchema}
                                            onCheckedChange={(checked) => setIncludeSchema(checked === true)}
                                        />
                                        <div>
                                            <Label htmlFor="include-schema" className="font-medium cursor-pointer">Include Schema</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Generate CREATE TABLE statements
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <Checkbox
                                            id="defer-fk"
                                            checked={deferForeignKeys}
                                            onCheckedChange={(checked) => setDeferForeignKeys(checked === true)}
                                        />
                                        <div>
                                            <Label htmlFor="defer-fk" className="font-medium cursor-pointer">Defer Foreign Keys</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Add PRAGMA defer_foreign_keys for easier import
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 4: Progress */}
                    {step === 'progress' && (
                        <div className="space-y-4">
                            {!completed && !error && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="flex items-center gap-2">
                                            {getFormatIcon(detectedFormat)}
                                            {importing ? 'Importing...' : 'Preparing import...'}
                                        </span>
                                    </div>
                                    <Progress value={importing ? 50 : 10} className="h-2" />
                                    <p className="text-xs text-muted-foreground text-center">
                                        {detectedFormat !== 'sql' ? 'Converting to SQL and importing...' : 'Uploading to D1...'}
                                    </p>
                                </div>
                            )}

                            {completed && (
                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-lg p-4">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="h-5 w-5 text-green-600" />
                                        <span className="font-medium text-green-800 dark:text-green-200">
                                            Import completed!
                                        </span>
                                    </div>
                                    <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                                        Your data has been imported successfully.
                                        {importMode === 'create' && ` Database "${newDbName}" has been created.`}
                                    </p>
                                </div>
                            )}

                            <ErrorMessage error={error} variant="inline" />
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    {step !== 'progress' && (
                        <>
                            {step !== 'upload' && (
                                <Button variant="outline" onClick={handleBack} className="sm:mr-auto">
                                    Back
                                </Button>
                            )}

                            <Button variant="outline" onClick={handleClose}>
                                Cancel
                            </Button>

                            <Button
                                onClick={handleNext}
                                disabled={!canProceed()}
                            >
                                {step === 'options' ? (
                                    <>
                                        <Upload className="h-4 w-4 mr-2" />
                                        Start Import
                                    </>
                                ) : (
                                    'Next'
                                )}
                            </Button>
                        </>
                    )}

                    {step === 'progress' && (
                        <>
                            {(completed || error) ? (
                                <Button onClick={handleClose}>
                                    {completed ? 'Done' : 'Close'}
                                </Button>
                            ) : (
                                <Button disabled>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Importing...
                                </Button>
                            )}
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
