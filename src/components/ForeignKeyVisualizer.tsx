import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Loader2, Plus, RefreshCw, Maximize2, LayoutGrid, Network as NetworkIcon, Trash2, Edit, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getAllForeignKeys, addForeignKey, modifyForeignKey, deleteForeignKey, getCircularDependencies, type ForeignKeyGraph, type ForeignKeyGraphEdge, type CircularDependencyCycle } from '@/services/api';
import { applyLayout, type LayoutType, type GraphData } from '@/services/graphLayout';
import { ForeignKeyEditor } from './ForeignKeyEditor';

interface ForeignKeyVisualizerProps {
  databaseId: string;
  focusTable?: string; // Optional table to focus on and center
  onTableSelect?: (tableName: string) => void;
}

// Custom node component for table visualization
const TableNode = ({ data }: { data: { label: string; columns: Array<{name: string; type: string; isPK: boolean}>; rowCount: number } }) => {
  return (
    <div className="bg-card border-2 border-border rounded-lg shadow-lg min-w-[250px]">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded-t-lg font-semibold flex items-center justify-between">
        <span>{data.label}</span>
        <span className="text-xs opacity-80">{data.rowCount} rows</span>
      </div>
      
      {/* Columns */}
      <div className="p-2 max-h-[200px] overflow-y-auto">
        {data.columns.slice(0, 10).map((col, index) => (
          <div key={index} className="text-xs py-1 px-2 hover:bg-muted rounded flex items-center justify-between">
            <div className="flex items-center gap-2">
              {col.isPK && <span className="text-yellow-500">🔑</span>}
              <span className="font-medium">{col.name}</span>
            </div>
            <span className="text-muted-foreground">{col.type}</span>
          </div>
        ))}
        {data.columns.length > 10 && (
          <div className="text-xs py-1 px-2 text-muted-foreground italic">
            +{data.columns.length - 10} more columns...
          </div>
        )}
      </div>
    </div>
  );
};

const nodeTypes = {
  fkNode: TableNode
};

// Custom edge component
const edgeTypes = {
  fkEdge: () => {
    return null; // Use default edge rendering with custom styles
  }
};

function ForeignKeyVisualizerContent({ databaseId, focusTable, onTableSelect }: ForeignKeyVisualizerProps) {
  const [graphData, setGraphData] = useState<ForeignKeyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layoutType, setLayoutType] = useState<LayoutType>('hierarchical');
  const [selectedEdge, setSelectedEdge] = useState<ForeignKeyGraphEdge | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [filterTable, setFilterTable] = useState<string>('all');
  const [highlightCycles, setHighlightCycles] = useState(false);
  const [cycles, setCycles] = useState<CircularDependencyCycle[]>([]);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const { fitView } = useReactFlow();
  
  // Load foreign keys
  const loadForeignKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await getAllForeignKeys(databaseId);
      setGraphData(data);
      
      // Load circular dependencies
      const detectedCycles = await getCircularDependencies(databaseId);
      setCycles(detectedCycles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load foreign keys');
    } finally {
      setLoading(false);
    }
  }, [databaseId]);
  
  useEffect(() => {
    loadForeignKeys();
  }, [loadForeignKeys]);
  
  // Apply layout when data or layout type changes
  useEffect(() => {
    if (!graphData) return;
    
    let filteredData = graphData;
    
    // Filter by table if selected
    if (filterTable !== 'all') {
      const relatedTables = new Set<string>();
      relatedTables.add(filterTable);
      
      // Add tables connected to the filtered table
      graphData.edges.forEach(edge => {
        if (edge.source === filterTable || edge.target === filterTable) {
          relatedTables.add(edge.source);
          relatedTables.add(edge.target);
        }
      });
      
      filteredData = {
        nodes: graphData.nodes.filter(n => relatedTables.has(n.id)),
        edges: graphData.edges.filter(e => relatedTables.has(e.source) && relatedTables.has(e.target))
      };
    }
    
    const layoutData: GraphData = {
      nodes: filteredData.nodes,
      edges: filteredData.edges
    };
    
    const { nodes: layoutedNodes, edges: layoutedEdges } = applyLayout(layoutData, layoutType);
    
    // Apply cycle highlighting if enabled
    if (highlightCycles && cycles.length > 0) {
      // Get all tables and edges in cycles
      const tablesInCycles = new Set<string>();
      const edgesInCycles = new Set<string>();
      
      cycles.forEach(cycle => {
        cycle.tables.forEach(table => tablesInCycles.add(table));
        cycle.constraintNames.forEach(name => edgesInCycles.add(name));
      });
      
      // Update nodes with cycle highlighting
      const highlightedNodes = layoutedNodes.map(node => ({
        ...node,
        style: tablesInCycles.has(node.id) ? {
          ...node.style,
          border: '3px solid #ef4444',
          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
        } : {
          ...node.style,
          opacity: 0.3
        }
      }));
      
      // Update edges with cycle highlighting
      const highlightedEdges = layoutedEdges.map(edge => {
        const isInCycle = edgesInCycles.has(edge.id);
        return {
          ...edge,
          animated: isInCycle,
          style: {
            ...edge.style,
            stroke: isInCycle ? '#ef4444' : (edge.style?.stroke || '#999'),
            strokeWidth: isInCycle ? 3 : 2,
            opacity: isInCycle ? 1 : 0.3
          }
        };
      });
      
      setNodes(highlightedNodes);
      setEdges(highlightedEdges);
    } else {
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
    
    // Fit view after layout
    setTimeout(() => {
      fitView({ padding: 0.1, duration: 300 });
    }, 50);
  }, [graphData, layoutType, filterTable, highlightCycles, cycles, setNodes, setEdges, fitView]);
  
  // Focus on specific table if provided
  useEffect(() => {
    if (focusTable && nodes.length > 0) {
      const node = nodes.find(n => n.id === focusTable);
      if (node) {
        fitView({
          nodes: [node],
          padding: 0.5,
          duration: 500
        });
      }
    }
  }, [focusTable, nodes, fitView]);
  
  // Handle add foreign key
  const handleAddForeignKey = async (params: {
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    onDelete: string;
    onUpdate: string;
    constraintName?: string;
  }) => {
    await addForeignKey(databaseId, params);
    await loadForeignKeys();
  };
  
  // Handle edit foreign key
  const handleEditForeignKey = async (params: {
    onDelete?: string;
    onUpdate?: string;
  }) => {
    if (!selectedEdge) return;
    
    await modifyForeignKey(databaseId, selectedEdge.id, params);
    setSelectedEdge(null);
    await loadForeignKeys();
  };
  
  // Handle delete foreign key
  const handleDeleteForeignKey = async () => {
    if (!selectedEdge) return;
    
    await deleteForeignKey(databaseId, selectedEdge.id);
    setSelectedEdge(null);
    setShowDeleteDialog(false);
    await loadForeignKeys();
  };
  
  // Handle edge click
  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    const graphEdge = graphData?.edges.find(e => e.id === edge.id);
    if (graphEdge) {
      setSelectedEdge(graphEdge);
    }
  }, [graphData]);
  
  // Handle node click
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (onTableSelect) {
      onTableSelect(node.id);
    }
  }, [onTableSelect]);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button className="mt-4" onClick={loadForeignKeys}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <NetworkIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Tables Found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            This database doesn't have any tables yet
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="relative h-[calc(100vh-200px)] border rounded-lg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        className="bg-background"
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          markerEnd: { type: MarkerType.ArrowClosed }
        }}
      >
        <Background />
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            const hasOutgoing = edges.some(e => e.source === node.id);
            const hasIncoming = edges.some(e => e.target === node.id);
            
            if (hasOutgoing && hasIncoming) return '#3b82f6'; // blue
            if (hasOutgoing) return '#10b981'; // green
            if (hasIncoming) return '#f59e0b'; // amber
            return '#6b7280'; // gray
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
        
        {/* Toolbar */}
        <Panel position="top-left" className="bg-card border rounded-lg p-2 shadow-lg space-y-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add FK
            </Button>
            <Button 
              size="sm" 
              variant={highlightCycles ? "default" : "outline"}
              onClick={() => setHighlightCycles(!highlightCycles)}
              disabled={cycles.length === 0}
              title={cycles.length > 0 ? `Highlight ${cycles.length} circular ${cycles.length === 1 ? 'dependency' : 'dependencies'}` : 'No circular dependencies detected'}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              {cycles.length > 0 && <span className="text-xs">{cycles.length}</span>}
            </Button>
            <Button size="sm" variant="outline" onClick={loadForeignKeys}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => fitView({ padding: 0.1, duration: 300 })}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowLegend(!showLegend)}>
              <Info className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={layoutType} onValueChange={(v) => setLayoutType(v as LayoutType)}>
              <SelectTrigger className="h-8 text-xs">
                <LayoutGrid className="h-3 w-3 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hierarchical">Hierarchical</SelectItem>
                <SelectItem value="force-directed">Force-Directed</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={filterTable} onValueChange={setFilterTable}>
              <SelectTrigger className="h-8 text-xs w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                {graphData.nodes.map(node => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {graphData.edges.length === 0 && (
            <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
              No foreign keys defined. Click "Add FK" to create one.
            </div>
          )}
        </Panel>
        
        {/* Legend */}
        {showLegend && (
          <Panel position="top-right" className="bg-card border rounded-lg p-3 shadow-lg">
            <h4 className="text-sm font-semibold mb-2">Legend</h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-8 h-0.5 bg-yellow-500"></div>
                <span>CASCADE</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-0.5 bg-red-500"></div>
                <span>RESTRICT</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-0.5 bg-blue-500"></div>
                <span>SET NULL/DEFAULT</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-0.5 bg-gray-500"></div>
                <span>NO ACTION</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-0.5 bg-gray-500" style={{ strokeDasharray: '5,5', borderTop: '2px dashed' }}></div>
                <span className="text-[10px]">Dashed = ON UPDATE</span>
              </div>
            </div>
          </Panel>
        )}
        
        {/* Selected Edge Info */}
        {selectedEdge && (
          <Panel position="bottom-right" className="bg-card border rounded-lg p-3 shadow-lg min-w-[250px]">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Foreign Key Constraint</h4>
              <div className="text-xs space-y-1">
                <p><strong>From:</strong> {selectedEdge.source}.{selectedEdge.sourceColumn}</p>
                <p><strong>To:</strong> {selectedEdge.target}.{selectedEdge.targetColumn}</p>
                <p><strong>ON DELETE:</strong> {selectedEdge.onDelete}</p>
                <p><strong>ON UPDATE:</strong> {selectedEdge.onUpdate}</p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setShowEditDialog(true)}>
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
      
      {/* Add Foreign Key Dialog */}
      <ForeignKeyEditor
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        databaseId={databaseId}
        mode="add"
        nodes={graphData.nodes}
        onSave={handleAddForeignKey}
      />
      
      {/* Edit Foreign Key Dialog */}
      {selectedEdge && (
        <ForeignKeyEditor
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          databaseId={databaseId}
          mode="edit"
          nodes={graphData.nodes}
          existingConstraint={selectedEdge}
          onSave={(params) => handleEditForeignKey({ onDelete: params.onDelete, onUpdate: params.onUpdate })}
        />
      )}
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Foreign Key Constraint?</DialogTitle>
            <DialogDescription>
              This will remove the foreign key relationship. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedEdge && (
            <div className="py-4">
              <p className="text-sm mb-2">Constraint details:</p>
              <div className="bg-muted p-3 rounded-md text-sm space-y-1">
                <p><strong>From:</strong> {selectedEdge.source}.{selectedEdge.sourceColumn}</p>
                <p><strong>To:</strong> {selectedEdge.target}.{selectedEdge.targetColumn}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteForeignKey}>
              Delete Constraint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ForeignKeyVisualizer(props: ForeignKeyVisualizerProps) {
  return (
    <ReactFlowProvider>
      <ForeignKeyVisualizerContent {...props} />
    </ReactFlowProvider>
  );
}

