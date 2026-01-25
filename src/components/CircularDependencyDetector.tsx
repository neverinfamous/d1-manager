import { useState, useEffect, useRef } from "react";
import ReactFlow, {
  type Node,
  type Edge,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Panel,
  ReactFlowProvider,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Loader2,
  AlertTriangle,
  Info,
  ArrowRight,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  getAllForeignKeys,
  type CircularDependencyCycle,
  type ForeignKeyGraphWithCycles,
} from "@/services/api";
import { applyLayout } from "@/services/graphLayout";
import { ErrorMessage } from "@/components/ui/error-message";

interface CycleNodeData {
  label: string;
  inCycle: boolean;
  isHighlighted: boolean;
}

interface CircularDependencyDetectorProps {
  databaseId: string;
  onNavigateToRelationships?: () => void;
}

// Custom node component for cycle visualization
const CycleNode = ({
  data,
}: {
  data: { label: string; inCycle: boolean; isHighlighted: boolean };
}): React.JSX.Element => {
  return (
    <div
      className={`px-4 py-3 rounded-lg shadow-lg min-w-[150px] border-2 ${
        data.isHighlighted
          ? "bg-red-100 border-red-500 dark:bg-red-900 dark:border-red-600"
          : "bg-card border-border"
      }`}
    >
      <div className="font-semibold text-sm">{data.label}</div>
      {data.inCycle && (
        <div className="text-xs text-muted-foreground mt-1">In cycle</div>
      )}
    </div>
  );
};

const nodeTypes = {
  cycleNode: CycleNode,
};

function CircularDependencyDetectorContent({
  databaseId,
  onNavigateToRelationships,
}: CircularDependencyDetectorProps): React.JSX.Element {
  const [cycles, setCycles] = useState<CircularDependencyCycle[]>([]);
  const [fkGraph, setFkGraph] = useState<ForeignKeyGraphWithCycles | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCycle, setSelectedCycle] =
    useState<CircularDependencyCycle | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  // Ref for scrolling to graph visualization
  const graphCardRef = useRef<HTMLDivElement>(null);

  // OPTIMIZED: Single API call returns both FK graph and cycles
  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);

        // Single API call gets FK data, cycles, and schemas (uses unified cache key)
        // Shares cache with ForeignKeyVisualizer and ERDiagram
        const fkData = await getAllForeignKeys(databaseId, true, true);
        const detectedCycles = fkData.cycles ?? [];

        setCycles(detectedCycles);
        setFkGraph(fkData);

        // Auto-select first cycle if exists
        if (detectedCycles.length > 0) {
          setSelectedCycle(detectedCycles[0] ?? null);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to detect circular dependencies",
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [databaseId]);

  // Build graph visualization when a cycle is selected (uses cached FK data)
  useEffect(() => {
    if (!selectedCycle || !fkGraph) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Create nodes for tables in the cycle
    const cycleNodes: Node<CycleNodeData>[] = selectedCycle.tables.map(
      (table) => ({
        id: table,
        type: "cycleNode",
        data: {
          label: table,
          inCycle: true,
          isHighlighted: true,
        },
        position: { x: 0, y: 0 }, // Will be recalculated by layout
      }),
    );

    // Create edges for the cycle
    const cycleEdges: Edge[] = [];
    for (let i = 0; i < selectedCycle.tables.length; i++) {
      const source = selectedCycle.tables[i];
      const target =
        selectedCycle.tables[(i + 1) % selectedCycle.tables.length];
      if (!source || !target) continue;

      // Find the FK edge in the cached graph
      const fkEdge = fkGraph.edges.find(
        (e) => e.source === source && e.target === target,
      );

      cycleEdges.push({
        id: `cycle-edge-${String(i)}`,
        source,
        target,
        label: fkEdge?.onDelete || "FK",
        type: "smoothstep",
        animated: true,
        style: {
          stroke:
            selectedCycle.severity === "high"
              ? "#dc2626"
              : selectedCycle.severity === "medium"
                ? "#f59e0b"
                : "#9ca3af",
          strokeWidth: 3,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color:
            selectedCycle.severity === "high"
              ? "#dc2626"
              : selectedCycle.severity === "medium"
                ? "#f59e0b"
                : "#9ca3af",
        },
      });
    }

    // Apply layout
    const graphData = {
      nodes: cycleNodes.map((n) => ({
        id: n.id,
        label: n.data.label,
        columns: [],
        rowCount: 0,
      })),
      edges: cycleEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceColumn: "",
        targetColumn: "",
        onDelete: "",
        onUpdate: "",
      })),
    };

    const { nodes: layoutNodes } = applyLayout(graphData, "hierarchical");

    // Merge layout positions with our styled nodes
    const finalNodes = cycleNodes.map((node) => {
      const layoutNode = layoutNodes.find((n) => n.id === node.id);
      return {
        ...node,
        position: layoutNode?.position ?? node.position,
      };
    });

    setNodes(finalNodes);
    setEdges(cycleEdges);
  }, [selectedCycle, fkGraph, setNodes, setEdges]);

  const getSeverityColor = (severity: "low" | "medium" | "high"): string => {
    switch (severity) {
      case "high":
        return "text-red-600 dark:text-red-400";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400";
      case "low":
        return "text-gray-600 dark:text-gray-400";
    }
  };

  const getSeverityBadge = (
    severity: "low" | "medium" | "high",
  ): React.JSX.Element => {
    const colors = {
      high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      medium:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      low: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    };

    return (
      <span
        className={`px-2 py-1 rounded text-xs font-semibold ${colors[severity]}`}
      >
        {severity.toUpperCase()}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">
          Analyzing schema for circular dependencies...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <ErrorMessage error={error} showTitle />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (cycles.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center text-green-600 dark:text-green-400 mb-2">
              <CheckCircle className="h-5 w-5 mr-2" />
              <span className="font-semibold">
                No Circular Dependencies Detected
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Your database schema has no circular foreign key dependencies.
              This is a healthy schema design!
            </p>
            {onNavigateToRelationships && (
              <Button
                variant="outline"
                onClick={onNavigateToRelationships}
                className="w-full"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                View All Relationships
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Summary Banner */}
      <Card className="border-yellow-500 dark:border-yellow-600">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            Circular Dependencies Detected
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Found <strong>{cycles.length}</strong> circular dependency{" "}
              {cycles.length === 1 ? "cycle" : "cycles"} in your database
              schema. These can cause unexpected behavior during DELETE
              operations and should be reviewed.
            </p>
            <div className="flex gap-2 items-center">
              <Info className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">
                Circular dependencies occur when tables reference each other in
                a loop (e.g., A → B → C → A)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cycle List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Detected Cycles ({cycles.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {cycles.map((cycle, index) => (
                <AccordionItem key={index} value={`cycle-${String(index)}`}>
                  <AccordionTrigger
                    className="hover:no-underline"
                    onClick={() => setSelectedCycle(cycle)}
                  >
                    <div className="flex items-center justify-between w-full mr-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className={`h-4 w-4 ${getSeverityColor(cycle.severity)}`}
                        />
                        <span className="text-sm font-medium">
                          Cycle {index + 1} ({cycle.tables.length} tables)
                        </span>
                      </div>
                      {getSeverityBadge(cycle.severity)}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      {/* Path */}
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">
                          Path:
                        </label>
                        <p className="text-sm mt-1 font-mono bg-muted p-2 rounded">
                          {cycle.path}
                        </p>
                      </div>

                      {/* Risk Indicators */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 text-sm">
                          {cycle.cascadeRisk ? (
                            <>
                              <XCircle className="h-4 w-4 text-red-500" />
                              <span className="text-red-600 dark:text-red-400">
                                CASCADE Risk
                              </span>
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span className="text-green-600 dark:text-green-400">
                                No CASCADE
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          {cycle.restrictPresent ? (
                            <>
                              <Info className="h-4 w-4 text-blue-500" />
                              <span className="text-blue-600 dark:text-blue-400">
                                Has RESTRICT
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">
                              No RESTRICT
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Message */}
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">
                          Impact:
                        </label>
                        <p className="text-sm mt-1 text-muted-foreground">
                          {cycle.message}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedCycle(cycle);
                            // Scroll to graph visualization on mobile/small screens
                            setTimeout(() => {
                              graphCardRef.current?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                            }, 100);
                          }}
                          className="flex-1"
                        >
                          View Graph
                        </Button>
                        {onNavigateToRelationships && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={onNavigateToRelationships}
                            title="Go to Foreign Key Editor"
                            aria-label="Go to Foreign Key Editor"
                          >
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Graph Visualization */}
        <Card ref={graphCardRef}>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedCycle ? `Cycle Visualization` : "Select a Cycle"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedCycle ? (
              <div className="h-[500px] border rounded-lg bg-muted/20">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  nodeTypes={nodeTypes}
                  fitView
                  minZoom={0.5}
                  maxZoom={2}
                >
                  <Background />
                  {/* Custom controls with dark mode support */}
                  <Panel
                    position="bottom-left"
                    className="bg-card border rounded-lg shadow-lg p-1 flex flex-col gap-1"
                  >
                    <button
                      onClick={() => zoomIn()}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-foreground"
                      title="Zoom In"
                    >
                      +
                    </button>
                    <button
                      onClick={() => zoomOut()}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-foreground"
                      title="Zoom Out"
                    >
                      −
                    </button>
                    <button
                      onClick={() => fitView({ padding: 0.2, duration: 200 })}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-foreground text-xs"
                      title="Fit View"
                    >
                      ⤢
                    </button>
                  </Panel>
                  <Panel
                    position="top-right"
                    className="bg-background border rounded p-2 text-xs"
                  >
                    <div className="font-semibold mb-1">Legend:</div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-red-500"></div>
                        <span>High Severity</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-yellow-500"></div>
                        <span>Medium Severity</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-gray-500"></div>
                        <span>Low Severity</span>
                      </div>
                    </div>
                  </Panel>
                </ReactFlow>
              </div>
            ) : (
              <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                <p>Select a cycle from the list to visualize it</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Breaking Suggestions */}
      {selectedCycle && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">How to Break This Cycle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                To break a circular dependency, you need to remove or modify at
                least one foreign key constraint in the cycle.
              </p>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Recommendations:</h4>
                <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                  <li>
                    Consider if all relationships in the cycle are truly
                    necessary
                  </li>
                  <li>
                    Change CASCADE constraints to RESTRICT or SET NULL to
                    prevent automatic deletions
                  </li>
                  <li>
                    Remove optional foreign keys that don't enforce critical
                    business rules
                  </li>
                  <li>
                    Restructure your schema to use a junction table if
                    appropriate
                  </li>
                </ul>
              </div>

              {selectedCycle.constraintNames.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold mb-2">
                    Constraints in this cycle:
                  </h4>
                  <div className="space-y-1">
                    {selectedCycle.constraintNames.map((name, idx) => (
                      <div
                        key={idx}
                        className="text-xs font-mono bg-muted p-2 rounded"
                      >
                        {name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {onNavigateToRelationships && (
                <Button
                  variant="default"
                  onClick={onNavigateToRelationships}
                  className="w-full mt-4"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Open Foreign Key Editor
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function CircularDependencyDetector(
  props: CircularDependencyDetectorProps,
): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <CircularDependencyDetectorContent {...props} />
    </ReactFlowProvider>
  );
}
