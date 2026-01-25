import { useState, useEffect, useCallback } from "react";
import ReactFlow, {
  type Node,
  type Edge,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  MarkerType,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Loader2,
  Plus,
  RefreshCw,
  LayoutGrid,
  Network as NetworkIcon,
  Trash2,
  Edit,
  Info,
  AlertTriangle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { ErrorMessage } from "@/components/ui/error-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAllForeignKeys,
  addForeignKey,
  modifyForeignKey,
  deleteForeignKey,
  type ForeignKeyGraphWithCycles,
  type ForeignKeyGraphEdge,
  type CircularDependencyCycle,
} from "@/services/api";
import {
  applyLayout,
  type LayoutType,
  type GraphData,
} from "@/services/graphLayout";
import { ForeignKeyEditor } from "./ForeignKeyEditor";

interface ForeignKeyVisualizerProps {
  databaseId: string;
  focusTable?: string; // Optional table to focus on and center
  onTableSelect?: (tableName: string) => void;
}

// Custom node component for table visualization
const TableNode = ({
  data,
}: {
  data: {
    label: string;
    columns: { name: string; type: string; isPK: boolean }[];
    rowCount: number;
  };
}): React.JSX.Element => {
  return (
    <div className="bg-card border-2 border-border rounded-lg shadow-lg min-w-[250px] relative">
      {/* Connection handles for edges */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-primary !w-3 !h-3"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-primary !w-3 !h-3"
      />

      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded-t-lg font-semibold flex items-center justify-between">
        <span>{data.label}</span>
        <span className="text-xs opacity-80">{data.rowCount} rows</span>
      </div>

      {/* Columns */}
      <div className="p-2 max-h-[200px] overflow-y-auto">
        {data.columns.slice(0, 10).map((col, index) => (
          <div
            key={index}
            className="text-xs py-1 px-2 hover:bg-muted rounded flex items-center justify-between"
          >
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
  fkNode: TableNode,
};

function ForeignKeyVisualizerContent({
  databaseId,
  focusTable,
  onTableSelect,
}: ForeignKeyVisualizerProps): React.JSX.Element {
  const [graphData, setGraphData] = useState<ForeignKeyGraphWithCycles | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layoutType, setLayoutType] = useState<LayoutType>("hierarchical");
  const [selectedEdge, setSelectedEdge] = useState<ForeignKeyGraphEdge | null>(
    null,
  );
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [filterTable, setFilterTable] = useState<string>("all");
  const [highlightCycles, setHighlightCycles] = useState(false);
  const [cycles, setCycles] = useState<CircularDependencyCycle[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const { fitView } = useReactFlow();

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Refit view when entering/exiting fullscreen
  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }

    // Dispatch resize event to force ReactFlow to recalculate viewport
    window.dispatchEvent(new Event("resize"));

    // Fit view after ReactFlow has had time to recalculate
    const timer = setTimeout(() => {
      fitView({ padding: 0.1, duration: 300 });
    }, 150);

    return () => clearTimeout(timer);
  }, [isFullscreen, fitView, nodes.length]);

  // Load foreign keys with circular dependency detection in a single optimized API call
  const loadForeignKeys = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // OPTIMIZED: Single API call returns FK graph, cycles, and schemas
      // Uses unified cache key (cycles+schemas) shared by all relationship tabs
      const data = await getAllForeignKeys(databaseId, true, true);

      setGraphData(data);
      setCycles(data.cycles ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load foreign keys",
      );
    } finally {
      setLoading(false);
    }
  }, [databaseId]);

  useEffect(() => {
    void loadForeignKeys();
  }, [loadForeignKeys]);

  // Apply layout when data or layout type changes
  useEffect(() => {
    if (!graphData) return;

    let filteredData = graphData;

    // Filter by table if selected
    if (filterTable !== "all") {
      const relatedTables = new Set<string>();
      relatedTables.add(filterTable);

      // Add tables connected to the filtered table
      graphData.edges.forEach((edge) => {
        if (edge.source === filterTable || edge.target === filterTable) {
          relatedTables.add(edge.source);
          relatedTables.add(edge.target);
        }
      });

      filteredData = {
        nodes: graphData.nodes.filter((n) => relatedTables.has(n.id)),
        edges: graphData.edges.filter(
          (e) => relatedTables.has(e.source) && relatedTables.has(e.target),
        ),
      };
    }

    const layoutData: GraphData = {
      nodes: filteredData.nodes,
      edges: filteredData.edges,
    };

    const { nodes: layoutedNodes, edges: layoutedEdges } = applyLayout(
      layoutData,
      layoutType,
    );

    // Apply cycle highlighting if enabled
    if (highlightCycles && cycles.length > 0) {
      // Get all tables and edges in cycles
      const tablesInCycles = new Set<string>();
      const edgesInCycles = new Set<string>();

      cycles.forEach((cycle) => {
        cycle.tables.forEach((table) => tablesInCycles.add(table));
        cycle.constraintNames.forEach((name) => edgesInCycles.add(name));
      });

      // Update nodes with cycle highlighting
      const highlightedNodes = layoutedNodes.map((node) => ({
        ...node,
        style: tablesInCycles.has(node.id)
          ? {
              ...node.style,
              border: "3px solid #ef4444",
              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }
          : {
              ...node.style,
              opacity: 0.3,
            },
      }));

      // Update edges with cycle highlighting
      const highlightedEdges = layoutedEdges.map((edge) => {
        const isInCycle = edgesInCycles.has(edge.id);
        return {
          ...edge,
          animated: isInCycle,
          style: {
            ...edge.style,
            stroke: isInCycle ? "#ef4444" : (edge.style?.stroke ?? "#999"),
            strokeWidth: isInCycle ? 3 : 2,
            opacity: isInCycle ? 1 : 0.3,
          },
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
  }, [
    graphData,
    layoutType,
    filterTable,
    highlightCycles,
    cycles,
    setNodes,
    setEdges,
    fitView,
  ]);

  // Focus on specific table if provided
  useEffect(() => {
    if (focusTable && nodes.length > 0) {
      const node = nodes.find((n) => n.id === focusTable);
      if (node) {
        fitView({
          nodes: [node],
          padding: 0.5,
          duration: 500,
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
  }): Promise<void> => {
    await addForeignKey(databaseId, params);
    await loadForeignKeys();
  };

  // Handle edit foreign key
  const handleEditForeignKey = async (params: {
    onDelete?: string;
    onUpdate?: string;
  }): Promise<void> => {
    if (!selectedEdge) return;

    await modifyForeignKey(databaseId, selectedEdge.id, params);
    setSelectedEdge(null);
    await loadForeignKeys();
  };

  // Handle delete foreign key
  const handleDeleteForeignKey = async (): Promise<void> => {
    if (!selectedEdge) return;

    await deleteForeignKey(databaseId, selectedEdge.id);
    setSelectedEdge(null);
    setShowDeleteDialog(false);
    await loadForeignKeys();
  };

  // Handle edge click
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      const graphEdge = graphData?.edges.find((e) => e.id === edge.id);
      if (graphEdge) {
        setSelectedEdge(graphEdge);
      }
    },
    [graphData],
  );

  // Handle node click
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onTableSelect) {
        onTableSelect(node.id);
      }
    },
    [onTableSelect],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    const isRateLimited =
      error.includes("429") || error.toLowerCase().includes("rate limit");
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <ErrorMessage error={error} showTitle />
          {isRateLimited && (
            <p className="text-xs text-muted-foreground mt-2">
              Too many requests. Please wait a moment before retrying.
            </p>
          )}
          <Button
            className="mt-4"
            onClick={() => void loadForeignKeys()}
            variant={isRateLimited ? "outline" : "default"}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {isRateLimited ? "Retry (wait a moment)" : "Retry"}
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
    <div
      className={`relative ${isFullscreen ? "fixed inset-0 z-50 bg-background w-screen h-screen" : "h-[calc(100vh-200px)] border rounded-lg"}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
      >
        <Background />

        {/* Toolbar */}
        <Panel
          position="top-left"
          className="bg-card border rounded-lg p-2 shadow-lg space-y-2"
        >
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddDialog(true)}
              title="Add Foreign Key"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add FK
            </Button>
            {/* Only show cycle highlight when FKs exist */}
            {graphData.edges.length > 0 && (
              <Button
                size="sm"
                variant={highlightCycles ? "default" : "outline"}
                onClick={() => setHighlightCycles(!highlightCycles)}
                disabled={cycles.length === 0}
                title={
                  cycles.length > 0
                    ? `Highlight ${String(cycles.length)} circular ${cycles.length === 1 ? "dependency" : "dependencies"}`
                    : "No circular dependencies detected"
                }
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                {cycles.length > 0 && (
                  <span className="text-xs">{cycles.length}</span>
                )}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadForeignKeys()}
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowLegend(!showLegend)}
              title="Toggle legend"
            >
              <Info className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit fullscreen (Esc)" : "View fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={layoutType}
              onValueChange={(v) => setLayoutType(v as LayoutType)}
            >
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
                {[...graphData.nodes]
                  .sort((a, b) => a.label.localeCompare(b.label))
                  .map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {graphData.edges.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
              No foreign keys defined. Click "Add FK" to create one.
            </div>
          ) : (
            <div className="text-xs p-2 bg-amber-500/20 border border-amber-500/50 rounded text-amber-200 font-medium">
              💡 Click on a line/edge to edit or delete a constraint
            </div>
          )}
        </Panel>

        {/* Legend and Selected Edge Info Panel - positioned at top-right */}
        <Panel position="top-right" className="space-y-2">
          {/* Legend */}
          {showLegend && (
            <div className="bg-card border rounded-lg p-3 shadow-lg">
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
                  <div
                    className="w-8 h-0.5 bg-gray-500"
                    style={{ strokeDasharray: "5,5", borderTop: "2px dashed" }}
                  ></div>
                  <span className="text-[10px]">Dashed = ON UPDATE</span>
                </div>
              </div>
            </div>
          )}

          {/* Selected Edge Info - positioned next to legend at top-right */}
          {selectedEdge && (
            <div className="bg-card border rounded-lg p-3 shadow-lg min-w-[250px]">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">
                    Foreign Key Constraint
                  </h4>
                  <button
                    onClick={() => setSelectedEdge(null)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-xs space-y-1">
                  <p>
                    <strong>From:</strong> {selectedEdge.source}.
                    {selectedEdge.sourceColumn}
                  </p>
                  <p>
                    <strong>To:</strong> {selectedEdge.target}.
                    {selectedEdge.targetColumn}
                  </p>
                  <p>
                    <strong>ON DELETE:</strong> {selectedEdge.onDelete}
                  </p>
                  <p>
                    <strong>ON UPDATE:</strong> {selectedEdge.onUpdate}
                  </p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowEditDialog(true)}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Panel>
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
          onSave={(params) =>
            handleEditForeignKey({
              onDelete: params.onDelete,
              onUpdate: params.onUpdate,
            })
          }
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Foreign Key Constraint?</DialogTitle>
            <DialogDescription>
              This will remove the foreign key relationship. This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedEdge && (
            <div className="py-4">
              <p className="text-sm mb-2">Constraint details:</p>
              <div className="bg-muted p-3 rounded-md text-sm space-y-1">
                <p>
                  <strong>From:</strong> {selectedEdge.source}.
                  {selectedEdge.sourceColumn}
                </p>
                <p>
                  <strong>To:</strong> {selectedEdge.target}.
                  {selectedEdge.targetColumn}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteForeignKey()}
            >
              Delete Constraint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ForeignKeyVisualizer(
  props: ForeignKeyVisualizerProps,
): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <ForeignKeyVisualizerContent {...props} />
    </ReactFlowProvider>
  );
}
