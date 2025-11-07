import { useState, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
  ReactFlowProvider,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Loader2, AlertTriangle, Info, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { getCircularDependencies, getAllForeignKeys, type CircularDependencyCycle } from '@/services/api';
import { applyLayout } from '@/services/graphLayout';

interface CircularDependencyDetectorProps {
  databaseId: string;
  onNavigateToRelationships?: () => void;
}

// Custom node component for cycle visualization
const CycleNode = ({ data }: { data: { label: string; inCycle: boolean; isHighlighted: boolean } }) => {
  return (
    <div 
      className={`px-4 py-3 rounded-lg shadow-lg min-w-[150px] border-2 ${
        data.isHighlighted 
          ? 'bg-red-100 border-red-500 dark:bg-red-900 dark:border-red-600' 
          : 'bg-card border-border'
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
  cycleNode: CycleNode
};

function CircularDependencyDetectorContent({ databaseId, onNavigateToRelationships }: CircularDependencyDetectorProps) {
  const [cycles, setCycles] = useState<CircularDependencyCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<CircularDependencyCycle | null>(null);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Fetch circular dependencies
  useEffect(() => {
    const fetchCycles = async () => {
      try {
        setLoading(true);
        setError(null);
        const detectedCycles = await getCircularDependencies(databaseId);
        setCycles(detectedCycles);
        
        // Auto-select first cycle if exists
        if (detectedCycles.length > 0) {
          setSelectedCycle(detectedCycles[0]);
        }
      } catch (err) {
        console.error('[CircularDependencyDetector] Error fetching cycles:', err);
        setError(err instanceof Error ? err.message : 'Failed to detect circular dependencies');
      } finally {
        setLoading(false);
      }
    };

    fetchCycles();
  }, [databaseId]);

  // Build graph visualization when a cycle is selected
  useEffect(() => {
    if (!selectedCycle) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const buildCycleGraph = async () => {
      try {
        // Get full FK graph to extract edge details
        const fkGraph = await getAllForeignKeys(databaseId);
        
        // Create nodes for tables in the cycle
        const cycleNodes: Node[] = selectedCycle.tables.map((table) => ({
          id: table,
          type: 'cycleNode',
          data: {
            label: table,
            inCycle: true,
            isHighlighted: true
          },
          position: { x: 0, y: 0 } // Will be recalculated by layout
        }));

        // Create edges for the cycle
        const cycleEdges: Edge[] = [];
        for (let i = 0; i < selectedCycle.tables.length; i++) {
          const source = selectedCycle.tables[i];
          const target = selectedCycle.tables[(i + 1) % selectedCycle.tables.length];
          
          // Find the FK edge in the graph
          const fkEdge = fkGraph.edges.find(e => e.source === source && e.target === target);
          
          cycleEdges.push({
            id: `cycle-edge-${i}`,
            source,
            target,
            label: fkEdge?.onDelete || 'FK',
            type: 'smoothstep',
            animated: true,
            style: {
              stroke: selectedCycle.severity === 'high' ? '#dc2626' : 
                      selectedCycle.severity === 'medium' ? '#f59e0b' : '#9ca3af',
              strokeWidth: 3
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: selectedCycle.severity === 'high' ? '#dc2626' : 
                     selectedCycle.severity === 'medium' ? '#f59e0b' : '#9ca3af'
            }
          });
        }

        // Apply layout
        const graphData = {
          nodes: cycleNodes.map(n => ({
            id: n.id,
            label: n.data.label,
            columns: [],
            rowCount: 0
          })),
          edges: cycleEdges.map(e => ({
            id: e.id,
            source: e.source!,
            target: e.target!,
            sourceColumn: '',
            targetColumn: '',
            onDelete: '',
            onUpdate: ''
          }))
        };

        const { nodes: layoutNodes } = applyLayout(graphData, 'hierarchical');
        
        // Merge layout positions with our styled nodes
        const finalNodes = cycleNodes.map(node => {
          const layoutNode = layoutNodes.find(n => n.id === node.id);
          return {
            ...node,
            position: layoutNode?.position || node.position
          };
        });

        setNodes(finalNodes);
        setEdges(cycleEdges);
      } catch (err) {
        console.error('[CircularDependencyDetector] Error building graph:', err);
      }
    };

    buildCycleGraph();
  }, [selectedCycle, databaseId, setNodes, setEdges]);

  const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high':
        return 'text-red-600 dark:text-red-400';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'low':
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getSeverityBadge = (severity: 'low' | 'medium' | 'high') => {
    const colors = {
      high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      low: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    };
    
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${colors[severity]}`}>
        {severity.toUpperCase()}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Analyzing schema for circular dependencies...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center text-destructive mb-2">
              <XCircle className="h-5 w-5 mr-2" />
              <span className="font-semibold">Error</span>
            </div>
            <p className="text-sm text-muted-foreground">{error}</p>
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
              <span className="font-semibold">No Circular Dependencies Detected</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Your database schema has no circular foreign key dependencies. This is a healthy schema design!
            </p>
            {onNavigateToRelationships && (
              <Button 
                variant="outline" 
                onClick={onNavigateToRelationships}
                className="w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
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
              Found <strong>{cycles.length}</strong> circular dependency {cycles.length === 1 ? 'cycle' : 'cycles'} in your database schema.
              These can cause unexpected behavior during DELETE operations and should be reviewed.
            </p>
            <div className="flex gap-2 items-center">
              <Info className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">
                Circular dependencies occur when tables reference each other in a loop (e.g., A → B → C → A)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cycle List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detected Cycles ({cycles.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {cycles.map((cycle, index) => (
                <AccordionItem key={index} value={`cycle-${index}`}>
                  <AccordionTrigger 
                    className="hover:no-underline"
                    onClick={() => setSelectedCycle(cycle)}
                  >
                    <div className="flex items-center justify-between w-full mr-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`h-4 w-4 ${getSeverityColor(cycle.severity)}`} />
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
                        <label className="text-xs font-semibold text-muted-foreground">Path:</label>
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
                              <span className="text-red-600 dark:text-red-400">CASCADE Risk</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span className="text-green-600 dark:text-green-400">No CASCADE</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          {cycle.restrictPresent ? (
                            <>
                              <Info className="h-4 w-4 text-blue-500" />
                              <span className="text-blue-600 dark:text-blue-400">Has RESTRICT</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">No RESTRICT</span>
                          )}
                        </div>
                      </div>

                      {/* Message */}
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground">Impact:</label>
                        <p className="text-sm mt-1 text-muted-foreground">
                          {cycle.message}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedCycle(cycle)}
                          className="flex-1"
                        >
                          View Graph
                        </Button>
                        {onNavigateToRelationships && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={onNavigateToRelationships}
                          >
                            <ExternalLink className="h-3 w-3" />
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedCycle ? `Cycle Visualization` : 'Select a Cycle'}
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
                  <Controls />
                  <Background />
                  <MiniMap />
                  <Panel position="top-right" className="bg-background border rounded p-2 text-xs">
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
                To break a circular dependency, you need to remove or modify at least one foreign key constraint in the cycle.
              </p>
              
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Recommendations:</h4>
                <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                  <li>Consider if all relationships in the cycle are truly necessary</li>
                  <li>Change CASCADE constraints to RESTRICT or SET NULL to prevent automatic deletions</li>
                  <li>Remove optional foreign keys that don't enforce critical business rules</li>
                  <li>Restructure your schema to use a junction table if appropriate</li>
                </ul>
              </div>

              {selectedCycle.constraintNames.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold mb-2">Constraints in this cycle:</h4>
                  <div className="space-y-1">
                    {selectedCycle.constraintNames.map((name, idx) => (
                      <div key={idx} className="text-xs font-mono bg-muted p-2 rounded">
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
                  <ExternalLink className="h-4 w-4 mr-2" />
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

export function CircularDependencyDetector(props: CircularDependencyDetectorProps) {
  return (
    <ReactFlowProvider>
      <CircularDependencyDetectorContent {...props} />
    </ReactFlowProvider>
  );
}

