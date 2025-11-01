import { useState, useEffect } from 'react'
import { api, type D1Database } from './services/api'
import { auth } from './services/auth'
import { useTheme } from './hooks/useTheme'
import { Database, Plus, Moon, Sun, Monitor, Loader2, Code, GitCompare, Upload, Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { DatabaseView } from './components/DatabaseView'
import { TableView } from './components/TableView'
import { QueryConsole } from './components/QueryConsole'
import { CrossDatabaseSearch } from './components/CrossDatabaseSearch'
import { DatabaseComparison } from './components/DatabaseComparison'
import { MigrationWizard } from './components/MigrationWizard'

type View = 
  | { type: 'list' }
  | { type: 'database'; databaseId: string; databaseName: string }
  | { type: 'table'; databaseId: string; databaseName: string; tableName: string }
  | { type: 'query'; databaseId: string; databaseName: string }

export default function App() {
  const [databases, setDatabases] = useState<D1Database[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newDbName, setNewDbName] = useState('')
  const [creating, setCreating] = useState(false)
  const [currentView, setCurrentView] = useState<View>({ type: 'list' })
  const [showComparison, setShowComparison] = useState(false)
  const [showMigration, setShowMigration] = useState(false)
  const { theme, setTheme } = useTheme()
  
  // Bulk operations state
  const [selectedDatabases, setSelectedDatabases] = useState<string[]>([])
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState<{
    progress: number
    status: 'preparing' | 'downloading' | 'complete' | 'error'
    error?: string
  } | null>(null)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadMode, setUploadMode] = useState<'create' | 'import'>('create')
  const [uploadDbName, setUploadDbName] = useState('')
  const [uploadTargetDb, setUploadTargetDb] = useState('')
  const [uploading, setUploading] = useState(false)
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    databaseIds: string[]
    databaseNames: string[]
    isDeleting: boolean
    currentProgress?: { current: number; total: number }
  } | null>(null)

  // Load databases on mount
  useEffect(() => {
    loadDatabases()
  }, [])

  const loadDatabases = async () => {
    try {
      setLoading(true)
      setError('')
      const dbs = await api.listDatabases()
      setDatabases(dbs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load databases')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDatabase = async () => {
    if (!newDbName.trim()) return

    try {
      setCreating(true)
      await api.createDatabase(newDbName.trim())
      setShowCreateDialog(false)
      setNewDbName('')
      await loadDatabases()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create database')
    } finally {
      setCreating(false)
    }
  }

  const cycleTheme = () => {
    const modes: Array<typeof theme> = ['system', 'light', 'dark']
    const currentIndex = modes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % modes.length
    setTheme(modes[nextIndex])
  }

  const getThemeIcon = () => {
    if (theme === 'system') return <Monitor className="h-5 w-5" />
    if (theme === 'light') return <Sun className="h-5 w-5" />
    return <Moon className="h-5 w-5" />
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  const handleDatabaseClick = (db: D1Database) => {
    setCurrentView({
      type: 'database',
      databaseId: db.uuid,
      databaseName: db.name
    })
  }

  const handleOpenQueryConsole = (db: D1Database) => {
    setCurrentView({
      type: 'query',
      databaseId: db.uuid,
      databaseName: db.name
    })
  }

  // Bulk operation handlers
  const toggleDatabaseSelection = (uuid: string) => {
    setSelectedDatabases(prev => {
      if (prev.includes(uuid)) {
        return prev.filter(id => id !== uuid)
      } else {
        return [...prev, uuid]
      }
    })
  }

  const selectAllDatabases = () => {
    setSelectedDatabases(databases.map(db => db.uuid))
  }

  const clearSelection = () => {
    setSelectedDatabases([])
  }

  const handleBulkDownload = async () => {
    if (selectedDatabases.length === 0) return
    
    setError('')
    setBulkDownloadProgress({ progress: 0, status: 'preparing' })
    
    try {
      const selectedDbData = databases.filter(db => selectedDatabases.includes(db.uuid))
      
      await api.exportDatabases(selectedDbData, (progress) => {
        setBulkDownloadProgress({
          progress,
          status: progress < 100 ? 'downloading' : 'complete'
        })
      })
      
      // Clear selection after successful download
      setSelectedDatabases([])
      
      setTimeout(() => {
        setBulkDownloadProgress(null)
      }, 2000)
    } catch (err) {
      console.error('Bulk download error:', err)
      setError(err instanceof Error ? err.message : 'Failed to download databases')
      setBulkDownloadProgress({
        progress: 0,
        status: 'error',
        error: err instanceof Error ? err.message : 'Download failed'
      })
    }
  }

  const handleBulkDelete = () => {
    if (selectedDatabases.length === 0) return
    
    const selectedDbData = databases.filter(db => selectedDatabases.includes(db.uuid))
    
    setDeleteConfirmState({
      databaseIds: selectedDatabases,
      databaseNames: selectedDbData.map(db => db.name),
      isDeleting: false
    })
  }

  const confirmBulkDelete = async () => {
    if (!deleteConfirmState) return
    
    setDeleteConfirmState(prev => prev ? { ...prev, isDeleting: true } : null)
    setError('')
    
    try {
      const result = await api.deleteDatabases(deleteConfirmState.databaseIds, (current, total) => {
        setDeleteConfirmState(prev => prev ? {
          ...prev,
          currentProgress: { current, total }
        } : null)
      })
      
      // Show errors if any
      if (result.failed.length > 0) {
        setError(`Some databases failed to delete:\n${result.failed.map(f => `${f.id}: ${f.error}`).join('\n')}`)
      }
      
      // Reload databases
      await loadDatabases()
      
      // Clear selection
      setSelectedDatabases([])
      setDeleteConfirmState(null)
    } catch (err) {
      setError('Failed to delete databases')
      console.error('Bulk delete error:', err)
      setDeleteConfirmState(prev => prev ? { ...prev, isDeleting: false } : null)
    }
  }

  const handleUploadDatabase = async () => {
    if (!uploadFile) return
    
    setUploading(true)
    setError('')
    
    try {
      await api.importDatabase(uploadFile, {
        createNew: uploadMode === 'create',
        databaseName: uploadMode === 'create' ? uploadDbName : undefined,
        targetDatabaseId: uploadMode === 'import' ? uploadTargetDb : undefined
      })
      
      // Reload databases
      await loadDatabases()
      
      // Close dialog and reset
      setShowUploadDialog(false)
      setUploadFile(null)
      setUploadDbName('')
      setUploadTargetDb('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload database')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => setCurrentView({ type: 'list' })}
          >
            <Database className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">D1 Database Manager</h1>
              <p className="text-sm text-muted-foreground">Manage your Cloudflare D1 databases</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleTheme}
              title={`Theme: ${theme}`}
            >
              {getThemeIcon()}
            </Button>
            <Button variant="outline" onClick={() => auth.logout()}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {currentView.type === 'list' && (
          <>
            {/* Actions Bar */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold">Databases</h2>
                <p className="text-muted-foreground mt-1">
                  {databases.length} {databases.length === 1 ? 'database' : 'databases'}
                </p>
              </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Database
            </Button>
          </div>

          {/* Cross-Database Search */}
          {databases.length > 0 && (
            <CrossDatabaseSearch databases={databases} />
          )}

          {/* Database Comparison */}
          {databases.length >= 2 && !showComparison && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowComparison(true)}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5" />
                  <CardTitle>Compare Databases</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Compare schemas between databases to identify differences
                </p>
              </CardContent>
            </Card>
          )}

          {showComparison && databases.length >= 2 && (
            <Card>
              <CardContent className="pt-6">
                <DatabaseComparison databases={databases} />
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowComparison(false)}
                >
                  Close Comparison
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Migration Wizard */}
          {databases.length >= 2 && !showMigration && !showComparison && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowMigration(true)}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  <CardTitle>Migrate Database</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Copy tables and data from one database to another
                </p>
              </CardContent>
            </Card>
          )}

          {showMigration && databases.length >= 2 && (
            <Card>
              <CardContent className="pt-6">
                <MigrationWizard databases={databases} />
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowMigration(false)}
                >
                  Close Migration Wizard
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Bulk Operations Toolbar */}
          {(selectedDatabases.length > 0 || databases.length > 0) && (
            <div className="flex items-center justify-between mb-6 p-4 border rounded-lg bg-card">
              <div className="flex items-center gap-4">
                {databases.length > 0 && selectedDatabases.length === 0 && (
                  <Button variant="outline" onClick={selectAllDatabases}>
                    Select All
                  </Button>
                )}
                {selectedDatabases.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {selectedDatabases.length} database{selectedDatabases.length !== 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setShowUploadDialog(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Database
                </Button>
                {selectedDatabases.length > 0 && (
                  <>
                    <Button variant="outline" onClick={clearSelection}>
                      Clear Selection
                    </Button>
                    <Button onClick={handleBulkDownload} disabled={bulkDownloadProgress !== null}>
                      <Download className="h-4 w-4 mr-2" />
                      {bulkDownloadProgress ? (
                        bulkDownloadProgress.status === 'error' ? 'Download Failed' :
                        bulkDownloadProgress.status === 'complete' ? 'Download Complete' :
                        bulkDownloadProgress.status === 'preparing' ? 'Preparing...' :
                        `Downloading (${Math.round(bulkDownloadProgress.progress)}%)`
                      ) : 'Download Selected'}
                    </Button>
                    <Button variant="destructive" onClick={handleBulkDelete}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Selected
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
            {error && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Database Grid */}
            {!loading && databases.length === 0 && (
              <div className="text-center py-12">
                <Database className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No databases yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first D1 database to get started
                </p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Database
                </Button>
              </div>
            )}

            {!loading && databases.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {databases.map((db) => {
                  const isSelected = selectedDatabases.includes(db.uuid)
                  return (
                  <Card 
                    key={db.uuid} 
                    className={`hover:shadow-lg transition-shadow relative ${
                      isSelected ? 'ring-2 ring-primary' : ''
                    }`}
                  >
                    <div className="absolute top-4 left-4 z-10">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleDatabaseSelection(db.uuid)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <CardHeader className="pl-12">
                      <div className="flex items-start justify-between">
                        <Database className="h-8 w-8 text-primary" />
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          db.version === 'production' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        }`}>
                          {db.version}
                        </span>
                      </div>
                      <CardTitle className="mt-4">{db.name}</CardTitle>
                      <CardDescription>{db.uuid}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm mb-4">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Created:</span>
                          <span className="font-medium">{formatDate(db.created_at)}</span>
                        </div>
                        {db.file_size !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Size:</span>
                            <span className="font-medium">{formatSize(db.file_size)}</span>
                          </div>
                        )}
                        {db.num_tables !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tables:</span>
                            <span className="font-medium">{db.num_tables}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => handleDatabaseClick(db)}
                        >
                          <Database className="h-4 w-4 mr-2" />
                          Browse
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1"
                          onClick={() => handleOpenQueryConsole(db)}
                        >
                          <Code className="h-4 w-4 mr-2" />
                          Query
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )})}
              </div>
            )}
          </>
        )}

        {currentView.type === 'database' && (
          <DatabaseView
            databaseId={currentView.databaseId}
            databaseName={currentView.databaseName}
            onBack={() => setCurrentView({ type: 'list' })}
            onSelectTable={(tableName) => {
              setCurrentView({
                type: 'table',
                databaseId: currentView.databaseId,
                databaseName: currentView.databaseName,
                tableName
              })
            }}
          />
        )}

        {currentView.type === 'table' && (
          <TableView
            databaseId={currentView.databaseId}
            databaseName={currentView.databaseName}
            tableName={currentView.tableName}
            onBack={() => {
              setCurrentView({
                type: 'database',
                databaseId: currentView.databaseId,
                databaseName: currentView.databaseName
              })
            }}
          />
        )}

        {currentView.type === 'query' && (
          <div className="space-y-6">
            <Button 
              variant="outline" 
              onClick={() => setCurrentView({ type: 'list' })}
            >
              ← Back to Databases
            </Button>
            <QueryConsole
              databaseId={currentView.databaseId}
              databaseName={currentView.databaseName}
            />
          </div>
        )}
      </main>

      {/* Create Database Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Database</DialogTitle>
            <DialogDescription>
              Enter a name for your new D1 database. The name must be unique.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Database Name</Label>
              <Input
                id="name"
                placeholder="my-database"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !creating) {
                    handleCreateDatabase()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateDatabase} disabled={creating || !newDbName.trim()}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Database Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Database</DialogTitle>
            <DialogDescription>
              Upload a SQL file to create a new database or import into an existing one.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="sql-file">SQL File</Label>
              <Input
                id="sql-file"
                type="file"
                accept=".sql"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground">
                Maximum file size: 5GB
              </p>
            </div>

            {uploadFile && (
              <>
                <div className="grid gap-2">
                  <Label>Import Mode</Label>
                  <RadioGroup value={uploadMode} onValueChange={(v) => setUploadMode(v as 'create' | 'import')}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="create" id="create" />
                      <Label htmlFor="create" className="font-normal">Create new database</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="import" id="import" />
                      <Label htmlFor="import" className="font-normal">Import into existing database</Label>
                    </div>
                  </RadioGroup>
                </div>

                {uploadMode === 'create' && (
                  <div className="grid gap-2">
                    <Label htmlFor="new-db-name">New Database Name</Label>
                    <Input
                      id="new-db-name"
                      placeholder="my-database"
                      value={uploadDbName}
                      onChange={(e) => setUploadDbName(e.target.value)}
                      disabled={uploading}
                    />
                  </div>
                )}

                {uploadMode === 'import' && (
                  <div className="grid gap-2">
                    <Label htmlFor="target-db">Target Database</Label>
                    <Select value={uploadTargetDb} onValueChange={setUploadTargetDb} disabled={uploading}>
                      <SelectTrigger>
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
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadDialog(false)
                setUploadFile(null)
                setUploadDbName('')
                setUploadTargetDb('')
              }}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUploadDatabase} 
              disabled={
                uploading || 
                !uploadFile || 
                (uploadMode === 'create' && !uploadDbName.trim()) ||
                (uploadMode === 'import' && !uploadTargetDb)
              }
            >
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmState && (
        <Dialog open={true} onOpenChange={() => !deleteConfirmState.isDeleting && setDeleteConfirmState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {deleteConfirmState.databaseNames.length === 1
                  ? 'Delete Database?'
                  : `Delete ${deleteConfirmState.databaseNames.length} Databases?`}
              </DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete the database(s) and all their data.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {deleteConfirmState.databaseNames.length === 1 ? (
                <p className="text-sm">
                  Database: <strong>{deleteConfirmState.databaseNames[0]}</strong>
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Databases to delete:</p>
                  <ul className="text-sm list-disc list-inside max-h-40 overflow-y-auto">
                    {deleteConfirmState.databaseNames.map((name, index) => (
                      <li key={index}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {deleteConfirmState.isDeleting && deleteConfirmState.currentProgress && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Deleting database {deleteConfirmState.currentProgress.current} of {deleteConfirmState.currentProgress.total}...
                  </p>
                  <Progress 
                    value={(deleteConfirmState.currentProgress.current / deleteConfirmState.currentProgress.total) * 100} 
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmState(null)}
                disabled={deleteConfirmState.isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmBulkDelete}
                disabled={deleteConfirmState.isDeleting}
              >
                {deleteConfirmState.isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {deleteConfirmState.isDeleting 
                  ? 'Deleting...' 
                  : deleteConfirmState.databaseNames.length === 1
                    ? 'Delete Database'
                    : `Delete ${deleteConfirmState.databaseNames.length} Databases`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
