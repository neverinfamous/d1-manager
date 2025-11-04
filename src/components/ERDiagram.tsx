import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Loader2, Download, LayoutGrid, Network as NetworkIcon, FileJson, FileImage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getAllForeignKeys, getTableSchema, type ForeignKeyGraph, type ColumnInfo } from '@/services/api';
import { applyLayout, type LayoutType, type GraphData } from '@/services/graphLayout';
import { exportERDiagramAsPNG, exportERDiagramAsSVG, exportERDiagramAsJSON } from '@/services/erExport';

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
}}) => {
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

function ERDiagramContent({ databaseId, databaseName, onTableSelect }: ERDiagramProps) {
  const [graphData, setGraphData] = useState<ForeignKeyGraph | null>(null);
  const [enrichedColumns, setEnrichedColumns] = useState<Record<string, ExtendedColumnInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layoutType, setLayoutType] = useState<LayoutType>('hierarchical');
  const [exporting, setExporting] = useState<'png' | 'svg' | 'json' | null>(null);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const { fitView } = useReactFlow();
  
  // Load foreign keys and enrich with schema data
  const loadDiagramData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const fkData = await getAllForeignKeys(databaseId);
      setGraphData(fkData);
      
      // Enrich columns with schema data to identify foreign keys
      const columnsMap: Record<string, ExtendedColumnInfo[]> = {};
      
      // Get foreign key column names for each table
      const fkColumnsByTable: Record<string, Set<string>> = {};
      fkData.edges.forEach(edge => {
        if (!fkColumnsByTable[edge.source]) {
          fkColumnsByTable[edge.source] = new Set();
        }
        fkColumnsByTable[edge.source].add(edge.sourceColumn);
      });
      
      // Fetch schema for each table and mark FK columns
      for (const node of fkData.nodes) {
        try {
          const schema = await getTableSchema(databaseId, node.label);
          const fkColumns = fkColumnsByTable[node.label] || new Set();
          
          columnsMap[node.label] = schema.map(col => ({
            ...col,
            isForeignKey: fkColumns.has(col.name)
          }));
        } catch (err) {
          console.error(`Failed to load schema for ${node.label}:`, err);
          // Use basic column info from node if schema fetch fails
          columnsMap[node.label] = node.columns.map(col => ({
            cid: 0,
            name: col.name,
            type: col.type,
            notnull: 0,
            dflt_value: null,
            pk: col.isPK ? 1 : 0,
            isForeignKey: false
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
    loadDiagramData();
  }, [loadDiagramData]);
  
  // Apply layout when data or layout type changes
  useEffect(() => {
    if (!graphData || Object.keys(enrichedColumns).length === 0) return;
    
    // Build graph data with enriched columns
    const graphDataWithColumns: GraphData = {
      nodes: graphData.nodes.map(node => ({
        ...node,
        columns: (enrichedColumns[node.label] || []).map(col => ({
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
        ...node.data,
        columns: enrichedColumns[node.id] || [],
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
  const handleExportPNG = async () => {
    setExporting('png');
    try {
      await exportERDiagramAsPNG(databaseName);
    } catch (err) {
      console.error('Failed to export PNG:', err);
      alert('Failed to export PNG. See console for details.');
    } finally {
      setExporting(null);
    }
  };
  
  const handleExportSVG = async () => {
    setExporting('svg');
    try {
      await exportERDiagramAsSVG(databaseName);
    } catch (err) {
      console.error('Failed to export SVG:', err);
      alert('Failed to export SVG. See console for details.');
    } finally {
      setExporting(null);
    }
  };
  
  const handleExportJSON = () => {
    setExporting('json');
    try {
      const exportData = {
        database: databaseName,
        tables: graphData?.nodes.map(node => ({
          name: node.label,
          rowCount: node.rowCount,
          columns: (enrichedColumns[node.label] || []).map(col => ({
            name: col.name,
            type: col.type,
            notnull: Boolean(col.notnull),
            dflt_value: col.dflt_value,
            pk: Boolean(col.pk),
            isForeignKey: col.isForeignKey
          }))
        })) || [],
        relationships: graphData?.edges.map(edge => ({
          sourceTable: edge.source,
          sourceColumn: edge.sourceColumn,
          targetTable: edge.target,
          targetColumn: edge.targetColumn,
          onDelete: edge.onDelete,
          onUpdate: edge.onUpdate
        })) || [],
        metadata: {
          exportDate: new Date().toISOString(),
          version: '1.0.0',
          layoutType: layoutType
        }
      };
      
      exportERDiagramAsJSON(exportData, databaseName);
    } catch (err) {
      console.error('Failed to export JSON:', err);
      alert('Failed to export JSON. See console for details.');
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
            <p className="text-destructive mb-2">Failed to load ER diagram</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={loadDiagramData}>Retry</Button>
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
    <div className="h-[calc(100vh-220px)] relative">
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
        <Controls />
        <MiniMap 
          nodeColor={() => {
            return 'hsl(var(--primary))';
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
        
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
          </div>
        </Panel>
        
        {/* Export Panel */}
        <Panel position="top-right" className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Export As:</p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportPNG}
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
              onClick={handleExportSVG}
              disabled={exporting !== null}
              className="justify-start"
            >
              {exporting === 'svg' ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-3 w-3 mr-2" />
                  SVG Vector
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
        </Panel>
        
        {/* Legend */}
        <Panel position="bottom-right" className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
          <p className="text-xs font-medium mb-2">Legend:</p>
          <div className="space-y-1 text-xs">
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
        </Panel>
      </ReactFlow>
    </div>
  );
}

// Wrapper component with ReactFlowProvider
export function ERDiagram(props: ERDiagramProps) {
  return (
    <ReactFlowProvider>
      <ERDiagramContent {...props} />
    </ReactFlowProvider>
  );
}

