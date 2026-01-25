import { useState, useEffect, useRef, useCallback } from "react";
import ReactFlow, {
  type Node,
  type Edge,
  Background,
  useNodesState,
  useEdgesState,
  Panel,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Download,
  FileJson,
  FileText,
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  simulateCascadeImpact,
  type CascadeSimulationResult,
} from "@/services/api";
import { CascadeSimulationEngine } from "@/services/cascadeSimulation";
import { CascadeExportService } from "@/services/cascadeExport";

interface CascadeImpactSimulatorProps {
  databaseId: string;
  targetTable: string;
  whereClause?: string;
  open: boolean;
  onClose: () => void;
}

// Custom node component for better styling
interface CustomNodeData {
  tableName: string;
  action: string;
  rowsBefore: number;
  rowsAfter: number;
  affectedRows?: number;
  depth: number;
  isTarget: boolean;
}

const CustomNode = ({ data }: { data: CustomNodeData }): React.JSX.Element => {
  const getSeverityColor = (action: string): string => {
    switch (action.toUpperCase()) {
      case "DELETE":
        return "text-red-100";
      case "CASCADE":
        return "text-yellow-900";
      case "RESTRICT":
      case "NO ACTION":
        return "text-gray-100";
      case "SET NULL":
      case "SET DEFAULT":
        return "text-blue-100";
      default:
        return "text-gray-900";
    }
  };

  return (
    <div className="px-4 py-3 rounded-lg shadow-lg min-w-[150px]">
      <div
        className={`font-semibold text-sm mb-1 ${getSeverityColor(data.action)}`}
      >
        {data.tableName}
      </div>
      <div className={`text-xs ${getSeverityColor(data.action)} opacity-90`}>
        {data.action}
      </div>
      {data.affectedRows !== undefined && (
        <div
          className={`text-xs mt-1 ${getSeverityColor(data.action)} opacity-80`}
        >
          {data.affectedRows} row{data.affectedRows !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  source: CustomNode,
  cascade: CustomNode,
  restrict: CustomNode,
  setNull: CustomNode,
  default: CustomNode,
};

export function CascadeImpactSimulator({
  databaseId,
  targetTable,
  whereClause,
  open,
  onClose,
}: CascadeImpactSimulatorProps): React.JSX.Element | null {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<CascadeSimulationResult | null>(
    null,
  );
  const [engine, setEngine] = useState<CascadeSimulationEngine | null>(null);
  const [exportService, setExportService] =
    useState<CascadeExportService | null>(null);
  const [activeTab, setActiveTab] = useState<
    "visualization" | "details" | "export"
  >("visualization");
  const [exporting, setExporting] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const graphRef = useRef<HTMLDivElement>(null);

  const loadSimulation = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await simulateCascadeImpact(
        databaseId,
        targetTable,
        whereClause,
      );
      setSimulation(result);

      // Initialize engine and export service
      const simEngine = new CascadeSimulationEngine(result);
      setEngine(simEngine);
      setExportService(new CascadeExportService(result));

      // Calculate layout and set nodes/edges
      const { nodes: flowNodes, edges: flowEdges } =
        simEngine.calculateLayout();
      setNodes(flowNodes as Node[]);
      setEdges(flowEdges as Edge[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to simulate cascade impact",
      );
    } finally {
      setLoading(false);
    }
  }, [databaseId, targetTable, whereClause, setNodes, setEdges]);

  // Load simulation on mount
  useEffect(() => {
    if (open) {
      void loadSimulation();
    }
  }, [open, loadSimulation]);

  const handleExport = async (
    format: "csv" | "json" | "text" | "pdf",
  ): Promise<void> => {
    if (!exportService) return;

    try {
      setExporting(true);

      switch (format) {
        case "csv":
          exportService.exportAndDownloadCSV();
          break;
        case "json":
          exportService.exportAndDownloadJSON();
          break;
        case "text":
          exportService.exportAndDownloadText();
          break;
        case "pdf":
          await exportService.exportAndDownloadPDF(graphRef.current);
          break;
      }
    } catch {
      setError(`Failed to export as ${format.toUpperCase()}`);
    } finally {
      setExporting(false);
    }
  };

  const getSeverityColor = (severity: "low" | "medium" | "high"): string => {
    switch (severity) {
      case "high":
        return "text-red-600 dark:text-red-400";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400";
      case "low":
        return "text-blue-600 dark:text-blue-400";
    }
  };

  const getSeverityBg = (severity: "low" | "medium" | "high"): string => {
    switch (severity) {
      case "high":
        return "bg-red-100 dark:bg-red-950/30";
      case "medium":
        return "bg-yellow-100 dark:bg-yellow-950/30";
      case "low":
        return "bg-blue-100 dark:bg-blue-950/30";
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Cascade Impact Simulator</DialogTitle>
          <DialogDescription>
            Analyzing deletion impact for table{" "}
            <span className="font-mono font-semibold">{targetTable}</span>
            {whereClause && (
              <span className="ml-2 text-xs">with WHERE clause</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">
                Analyzing cascade impact...
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="px-6 py-4">
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-destructive">Error</p>
                    <p className="text-sm text-destructive/90">{error}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!loading && !error && simulation && engine && (
          <>
            {/* Tab navigation */}
            <div className="flex border-b px-6">
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === "visualization"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("visualization")}
              >
                Visualization
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === "details"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("details")}
              >
                Details
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === "export"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("export")}
              >
                Export
              </button>
            </div>

            {/* Tab content */}
            <div
              className="flex-1 overflow-y-auto"
              style={{ maxHeight: "calc(90vh - 180px)" }}
            >
              {activeTab === "visualization" && (
                <div className="h-[600px] relative" ref={graphRef}>
                  <ReactFlowProvider>
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      nodeTypes={nodeTypes}
                      fitView
                      fitViewOptions={{ padding: 0.2 }}
                      minZoom={0.1}
                      maxZoom={2}
                    >
                      <Background />
                      <Panel
                        position="top-right"
                        className="bg-background/95 backdrop-blur-sm p-4 rounded-lg shadow-lg m-2"
                      >
                        <div className="text-xs space-y-2">
                          <div className="font-semibold mb-2">Legend</div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-red-500" />
                            <span>Source (DELETE)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-yellow-500" />
                            <span>CASCADE</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-blue-500" />
                            <span>SET NULL</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-gray-500" />
                            <span>RESTRICT</span>
                          </div>
                        </div>
                      </Panel>
                    </ReactFlow>
                  </ReactFlowProvider>
                </div>
              )}

              {activeTab === "details" && (
                <div className="p-6 space-y-6">
                  {/* Statistics */}
                  <Card>
                    <CardContent className="pt-6">
                      <h3 className="text-lg font-semibold mb-4">
                        Impact Summary
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-2xl font-bold">
                            {simulation.totalAffectedRows}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Total Rows
                          </div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold">
                            {simulation.affectedTables.length}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Tables
                          </div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold">
                            {simulation.maxDepth}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Max Depth
                          </div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold">
                            {engine.getStatistics().cascadeActions}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Cascades
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Warnings */}
                  {simulation.warnings.length > 0 && (
                    <Card>
                      <CardContent className="pt-6">
                        <h3 className="text-lg font-semibold mb-4">Warnings</h3>
                        <div className="space-y-3">
                          {simulation.warnings.map((warning, idx) => (
                            <div
                              key={idx}
                              className={`flex items-start gap-3 p-3 rounded-lg ${getSeverityBg(warning.severity)}`}
                            >
                              <AlertTriangle
                                className={`h-5 w-5 flex-shrink-0 mt-0.5 ${getSeverityColor(warning.severity)}`}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span
                                    className={`text-xs font-semibold uppercase ${getSeverityColor(warning.severity)}`}
                                  >
                                    {warning.severity}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {warning.type}
                                  </span>
                                </div>
                                <p className="text-sm">{warning.message}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Affected Tables */}
                  <Card>
                    <CardContent className="pt-6">
                      <h3 className="text-lg font-semibold mb-4">
                        Affected Tables by Depth
                      </h3>
                      <div className="space-y-4">
                        {Array.from(engine.getTablesByDepth().entries())
                          .sort((a, b) => a[0] - b[0])
                          .map(([depth, tables]) => (
                            <div key={depth}>
                              <div className="text-sm font-semibold mb-2 text-muted-foreground">
                                Depth {depth}
                              </div>
                              <div className="space-y-2">
                                {tables.map((table, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="font-medium">
                                        {table.tableName}
                                      </span>
                                      <span className="text-xs px-2 py-1 rounded bg-background">
                                        {table.action}
                                      </span>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      {table.rowsBefore - table.rowsAfter}{" "}
                                      row(s) affected
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Constraints */}
                  {simulation.constraints.length > 0 && (
                    <Card className="border-destructive">
                      <CardContent className="pt-6">
                        <h3 className="text-lg font-semibold mb-4 text-destructive">
                          Blocking Constraints
                        </h3>
                        <div className="space-y-2">
                          {simulation.constraints.map((constraint, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10"
                            >
                              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                              <div>
                                <div className="font-medium text-sm">
                                  {constraint.table}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {constraint.message}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Circular Dependencies */}
                  {simulation.circularDependencies.length > 0 && (
                    <Card className="border-yellow-500">
                      <CardContent className="pt-6">
                        <h3 className="text-lg font-semibold mb-4 text-yellow-600 dark:text-yellow-400">
                          Circular Dependencies
                        </h3>
                        <div className="space-y-2">
                          {simulation.circularDependencies.map(
                            (circular, idx) => (
                              <div
                                key={idx}
                                className="flex items-start gap-2 p-3 rounded-lg bg-yellow-100 dark:bg-yellow-950/30"
                              >
                                <Info className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                                <div className="text-sm">
                                  {circular.message}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {activeTab === "export" && (
                <div className="p-6">
                  <Card>
                    <CardContent className="pt-6">
                      <h3 className="text-lg font-semibold mb-4">
                        Export Report
                      </h3>
                      <p className="text-sm text-muted-foreground mb-6">
                        Download the cascade impact analysis in your preferred
                        format.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Button
                          variant="outline"
                          className="justify-start h-auto py-4 px-4"
                          onClick={() => void handleExport("csv")}
                          disabled={exporting}
                        >
                          <FileSpreadsheet className="h-5 w-5 mr-3 flex-shrink-0" />
                          <div className="text-left">
                            <div className="font-medium">Export as CSV</div>
                            <div className="text-xs text-muted-foreground">
                              Tabular data with affected entities
                            </div>
                          </div>
                        </Button>

                        <Button
                          variant="outline"
                          className="justify-start h-auto py-4 px-4"
                          onClick={() => void handleExport("json")}
                          disabled={exporting}
                        >
                          <FileJson className="h-5 w-5 mr-3 flex-shrink-0" />
                          <div className="text-left">
                            <div className="font-medium">Export as JSON</div>
                            <div className="text-xs text-muted-foreground">
                              Complete graph structure
                            </div>
                          </div>
                        </Button>

                        <Button
                          variant="outline"
                          className="justify-start h-auto py-4 px-4"
                          onClick={() => void handleExport("text")}
                          disabled={exporting}
                        >
                          <FileText className="h-5 w-5 mr-3 flex-shrink-0" />
                          <div className="text-left">
                            <div className="font-medium">Export as Text</div>
                            <div className="text-xs text-muted-foreground">
                              Human-readable summary
                            </div>
                          </div>
                        </Button>

                        <Button
                          variant="outline"
                          className="justify-start h-auto py-4 px-4"
                          onClick={() => void handleExport("pdf")}
                          disabled={exporting}
                        >
                          <Download className="h-5 w-5 mr-3 flex-shrink-0" />
                          <div className="text-left">
                            <div className="font-medium">Export as PDF</div>
                            <div className="text-xs text-muted-foreground">
                              Visual graph + statistics
                            </div>
                          </div>
                        </Button>
                      </div>

                      {exporting && (
                        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Exporting...</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
