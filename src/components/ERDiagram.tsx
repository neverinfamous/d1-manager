import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Loader2, LayoutGrid, Network as NetworkIcon, FileJson, FileImage, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getAllForeignKeys, type ForeignKeyGraphWithCycles, type ColumnInfo } from '@/services/api';
import { applyLayout, type LayoutType, type GraphData } from '@/services/graphLayout';
import { exportERDiagramAsPNG, exportERDiagramAsJSON } from '@/services/erExport';
import { ErrorMessage } from '@/components/ui/error-message';

interface ERDiagramProps {
  databaseId: string;
  databaseName: string;
  onTableSelect?: (tableName: string) => void;
}

interface ExtendedColumnInfo extends ColumnInfo {
  isForeignKey?: boolean;
}

// Custom node component for ER table visualization
const ERTableNode = ({ data }: { data: { 
  label: string; 
  columns: ExtendedColumnInfo[];
  onClick: () => void;
}}): React.JSX.Element => {
  return (
    <div 
      className="bg-card border-2 border-border rounded-lg shadow-lg min-w-[250px] cursor-pointer hover:shadow-xl transition-shadow"
      onClick={data.onClick}
    >
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded-t-lg font-semibold">
        <span>{data.label}</span>
      </div>
      
      {/* Columns */}
      <div className="p-2 max-h-[300px] overflow-y-auto">
        {data.columns.length === 0 ? (
          <div className="text-xs py-1 px-2 text-muted-foreground italic">
            No columns
          </div>
        ) : (
          data.columns.map((col, index) => (
            <div key={index} className="text-xs py-1 px-2 hover:bg-muted rounded flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {col.pk && <span className="text-yellow-500 flex-shrink-0">🔑</span>}
                {!col.pk && col.isForeignKey && <span className="text-blue-500 flex-shrink-0">🔗</span>}
                {!col.pk && !col.isForeignKey && <span className="flex-shrink-0 w-4"></span>}
                <span className="font-medium truncate">{col.name}</span>
              </div>
              <span className="text-muted-foreground flex-shrink-0 text-[10px]">{col.type}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const nodeTypes = {
  erNode: ERTableNode
};

function ERDiagramContent({ databaseId, databaseName, onTableSelect }: ERDiagramProps): React.JSX.Element {
  const [graphData, setGraphData] = useState<ForeignKeyGraphWithCycles | null>(null);
  const [enrichedColumns, setEnrichedColumns] = useState<Record<string, ExtendedColumnInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layoutType, setLayoutType] = useState<LayoutType>('hierarchical');
  const [exporting, setExporting] = useState<'png' | 'json' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const { fitView } = useReactFlow();
  
  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);
  
  // Refit view when entering/exiting fullscreen
  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }
    
    // Dispatch resize event to force ReactFlow to recalculate viewport
    window.dispatchEvent(new Event('resize'));
    
    // Fit view after ReactFlow has had time to recalculate
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 200 });
    }, 150);
    
    return () => clearTimeout(timer);
  }, [isFullscreen, fitView, nodes.length]);
  
  // Load foreign keys and schema data in a single optimized API call
  // OPTIMIZED: Uses includeSchemas=true to get all data in one request (avoids N+1 queries)
  const loadDiagramData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Single API call returns FK graph, cycles, and full column schemas
      // Uses unified cache key (cycles+schemas) shared by all relationship tabs
      const fkData = await getAllForeignKeys(databaseId, true, true);
      setGraphData(fkData);
      
      // Get foreign key column names for each table (to mark FK indicators)
      const fkColumnsByTable: Record<string, Set<string>> = {};
      fkData.edges.forEach(edge => {
        const sourceSet = fkColumnsByTable[edge.source] ?? new Set<string>();
        sourceSet.add(edge.sourceColumn);
        fkColumnsByTable[edge.source] = sourceSet;
      });
      
      // Build enriched columns from the schemas returned in the API response
      const columnsMap: Record<string, ExtendedColumnInfo[]> = {};
      
      if (fkData.schemas) {
        // Use schemas from API response (single call optimization)
        for (const [tableName, schema] of Object.entries(fkData.schemas)) {
          const fkColumns = fkColumnsByTable[tableName] ?? new Set();
          columnsMap[tableName] = schema.map(col => ({
            ...col,
            isForeignKey: fkColumns.has(col.name)
          }));
        }
      } else {
        // Fallback to basic column info from nodes if schemas not available
        for (const node of fkData.nodes) {
          const fkColumns = fkColumnsByTable[node.label] ?? new Set();
          columnsMap[node.label] = node.columns.map(col => ({
            cid: 0,
            name: col.name,
            type: col.type,
            notnull: 0,
            dflt_value: null,
            pk: col.isPK ? 1 : 0,
            isForeignKey: fkColumns.has(col.name)
          }));
        }
      }
      
      setEnrichedColumns(columnsMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diagram data');
    } finally {
      setLoading(false);
    }
  }, [databaseId]);
  
  useEffect(() => {
    void loadDiagramData();
  }, [loadDiagramData]);
  
  // Apply layout when data or layout type changes
  useEffect(() => {
    if (!graphData || Object.keys(enrichedColumns).length === 0) return;
    
    // Build graph data with enriched columns
    const graphDataWithColumns: GraphData = {
      nodes: graphData.nodes.map(node => ({
        ...node,
        columns: (enrichedColumns[node.label] ?? []).map(col => ({
          name: col.name,
          type: col.type,
          isPK: Boolean(col.pk)
        }))
      })),
      edges: graphData.edges
    };
    
    const { nodes: layoutNodes, edges: layoutEdges } = applyLayout(graphDataWithColumns, layoutType);
    
    // Add onClick handler to nodes
    const nodesWithHandlers = layoutNodes.map(node => ({
      ...node,
      data: {
        ...(node.data as Record<string, unknown>),
        columns: enrichedColumns[node.id] ?? [],
        onClick: () => {
          if (onTableSelect) {
            onTableSelect(node.id);
          }
        }
      },
      type: 'erNode'
    }));
    
    setNodes(nodesWithHandlers);
    setEdges(layoutEdges);
    
    // Fit view after a short delay to ensure layout is applied
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 200 });
    }, 50);
  }, [graphData, enrichedColumns, layoutType, onTableSelect, setNodes, setEdges, fitView]);
  
  // Export handlers
  const handleExportPNG = async (): Promise<void> => {
    setExporting('png');
    try {
      await exportERDiagramAsPNG(databaseName);
    } catch {
      alert('Failed to export PNG.');
    } finally {
      setExporting(null);
    }
  };
  
  const handleExportJSON = (): void => {
    setExporting('json');
    try {
      const exportData = {
        database: databaseName,
        tables: graphData?.nodes.map(node => ({
          name: node.label,
          rowCount: node.rowCount,
          columns: (enrichedColumns[node.label] ?? []).map(col => ({
            name: col.name,
            type: col.type,
            notnull: Boolean(col.notnull),
            dflt_value: col.dflt_value,
            pk: Boolean(col.pk),
            ...(col.isForeignKey !== undefined && { isForeignKey: col.isForeignKey })
          }))
        })) ?? [],
        relationships: graphData?.edges.map(edge => ({
          sourceTable: edge.source,
          sourceColumn: edge.sourceColumn,
          targetTable: edge.target,
          targetColumn: edge.targetColumn,
          onDelete: edge.onDelete,
          onUpdate: edge.onUpdate
        })) ?? [],
        metadata: {
          exportDate: new Date().toISOString(),
          version: '1.1.1',
          layoutType: layoutType
        }
      };
      
      exportERDiagramAsJSON(exportData, databaseName);
    } catch {
      alert('Failed to export JSON.');
    } finally {
      setExporting(null);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading ER diagram...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-[600px]">
          <div className="text-center">
            <ErrorMessage error={error} showTitle className="mb-4" />
            <Button onClick={() => void loadDiagramData()}>Retry</Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-[600px]">
          <div className="text-center">
            <p className="text-muted-foreground mb-2">No tables found in this database</p>
            <p className="text-sm text-muted-foreground">Create tables to see the ER diagram</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className={`relative ${isFullscreen ? 'fixed inset-0 z-50 bg-background w-screen h-screen' : 'h-[calc(100vh-220px)]'}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background />
        
        {/* Control Panel */}
        <Panel position="top-left" className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Layout:</label>
            <Select value={layoutType} onValueChange={(value) => setLayoutType(value as LayoutType)}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hierarchical">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-3 w-3" />
                    <span>Hierarchical</span>
                  </div>
                </SelectItem>
                <SelectItem value="force-directed">
                  <div className="flex items-center gap-2">
                    <NetworkIcon className="h-3 w-3" />
                    <span>Force-Directed</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setIsFullscreen(!isFullscreen)} 
              title={isFullscreen ? "Exit fullscreen (Esc)" : "View fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </Panel>
        
        {/* Export Panel and Legend - combined at top-right */}
        <Panel position="top-right" className="space-y-2">
          {/* Export Panel */}
          <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Export As:</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleExportPNG()}
                disabled={exporting !== null}
                className="justify-start"
              >
                {exporting === 'png' ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileImage className="h-3 w-3 mr-2" />
                    PNG Image
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportJSON}
                disabled={exporting !== null}
                className="justify-start"
              >
                {exporting === 'json' ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileJson className="h-3 w-3 mr-2" />
                    JSON Data
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {/* Legend */}
          <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
            <p className="text-sm font-semibold mb-2">Legend</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-yellow-500">🔑</span>
                <span>Primary Key</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-500">🔗</span>
                <span>Foreign Key</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-yellow-500"></div>
                <span>CASCADE</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-red-500"></div>
                <span>RESTRICT</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-blue-500"></div>
                <span>SET NULL</span>
              </div>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

// Wrapper component with ReactFlowProvider
export function ERDiagram(props: ERDiagramProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <ERDiagramContent {...props} />
    </ReactFlowProvider>
  );
}

