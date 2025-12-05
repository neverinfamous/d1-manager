import type { CascadeSimulationResult, CascadePath, AffectedTable } from './api';

/**
 * Node and Edge types for ReactFlow visualization
 */
export interface FlowNode {
  id: string;
  type: 'source' | 'cascade' | 'restrict' | 'setNull' | 'default';
  data: {
    label: string;
    tableName: string;
    action: string;
    affectedRows: number;
    rowsBefore: number;
    rowsAfter: number;
    depth: number;
  };
  position: { x: number; y: number };
  style?: React.CSSProperties;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  animated?: boolean;
  style?: React.CSSProperties;
  markerEnd?: {
    type: string;
    color?: string;
  };
}

/**
 * Statistics about the cascade simulation
 */
export interface SimulationStatistics {
  totalTables: number;
  totalRowsAffected: number;
  cascadeActions: number;
  setNullActions: number;
  restrictActions: number;
  maxDepth: number;
  hasCascades: boolean;
  hasConstraints: boolean;
  hasCircularDeps: boolean;
  severityLevel: 'low' | 'medium' | 'high';
}

/**
 * Engine for processing cascade simulation results
 * Handles graph traversal, layout calculation, and statistics
 */
export class CascadeSimulationEngine {
  private simulation: CascadeSimulationResult;
  private nodes = new Map<string, FlowNode>();
  private edges: FlowEdge[] = [];

  constructor(simulation: CascadeSimulationResult) {
    this.simulation = simulation;
    this.buildGraph();
  }

  /**
   * Build the graph from simulation results
   */
  private buildGraph(): void {
    // Add source node (the table being deleted from)
    const sourceTable = this.simulation.affectedTables.find(
      t => t.tableName === this.simulation.targetTable && t.depth === 0
    );
    
    if (sourceTable) {
      this.nodes.set(this.simulation.targetTable, {
        id: this.simulation.targetTable,
        type: 'source',
        data: {
          label: this.simulation.targetTable,
          tableName: this.simulation.targetTable,
          action: 'DELETE',
          affectedRows: sourceTable.rowsBefore,
          rowsBefore: sourceTable.rowsBefore,
          rowsAfter: sourceTable.rowsAfter,
          depth: 0
        },
        position: { x: 0, y: 0 }, // Will be recalculated
        style: {
          background: '#ef4444',
          color: 'white',
          border: '2px solid #dc2626',
          borderRadius: '8px',
          padding: '12px',
          minWidth: '150px'
        }
      });
    }

    // Add nodes for each affected table
    for (const table of this.simulation.affectedTables) {
      if (table.tableName === this.simulation.targetTable) continue;

      const nodeType = this.getNodeType(table.action);
      const nodeStyle = this.getNodeStyle(table.action);

      this.nodes.set(table.tableName, {
        id: table.tableName,
        type: nodeType,
        data: {
          label: table.tableName,
          tableName: table.tableName,
          action: table.action,
          affectedRows: table.rowsBefore - table.rowsAfter,
          rowsBefore: table.rowsBefore,
          rowsAfter: table.rowsAfter,
          depth: table.depth
        },
        position: { x: 0, y: 0 }, // Will be recalculated
        style: nodeStyle
      });
    }

    // Add edges for cascade paths
    for (const path of this.simulation.cascadePaths) {
      const edgeStyle = this.getEdgeStyle(path.action);
      
      this.edges.push({
        id: path.id,
        source: path.sourceTable,
        target: path.targetTable,
        label: `${path.action} (${String(path.affectedRows)} rows)`,
        type: 'smoothstep',
        animated: path.action === 'CASCADE',
        style: edgeStyle,
        markerEnd: {
          type: 'arrowclosed',
          color: edgeStyle.stroke as string
        }
      });
    }
  }

  /**
   * Get node type based on action
   */
  private getNodeType(action: string): FlowNode['type'] {
    switch (action.toUpperCase()) {
      case 'CASCADE':
        return 'cascade';
      case 'RESTRICT':
      case 'NO ACTION':
        return 'restrict';
      case 'SET NULL':
        return 'setNull';
      default:
        return 'default';
    }
  }

  /**
   * Get node style based on action
   */
  private getNodeStyle(action: string): React.CSSProperties {
    const baseStyle: React.CSSProperties = {
      borderRadius: '8px',
      padding: '12px',
      minWidth: '150px',
      border: '2px solid'
    };

    switch (action.toUpperCase()) {
      case 'CASCADE':
        return {
          ...baseStyle,
          background: '#fbbf24',
          color: '#000',
          borderColor: '#f59e0b'
        };
      case 'RESTRICT':
      case 'NO ACTION':
        return {
          ...baseStyle,
          background: '#9ca3af',
          color: '#fff',
          borderColor: '#6b7280'
        };
      case 'SET NULL':
      case 'SET DEFAULT':
        return {
          ...baseStyle,
          background: '#3b82f6',
          color: '#fff',
          borderColor: '#2563eb'
        };
      default:
        return {
          ...baseStyle,
          background: '#e5e7eb',
          color: '#000',
          borderColor: '#d1d5db'
        };
    }
  }

  /**
   * Get edge style based on action
   */
  private getEdgeStyle(action: string): React.CSSProperties {
    const baseStyle: React.CSSProperties = {
      strokeWidth: 2
    };

    switch (action.toUpperCase()) {
      case 'CASCADE':
        return {
          ...baseStyle,
          stroke: '#f59e0b'
        };
      case 'RESTRICT':
      case 'NO ACTION':
        return {
          ...baseStyle,
          stroke: '#6b7280',
          strokeDasharray: '5,5'
        };
      case 'SET NULL':
      case 'SET DEFAULT':
        return {
          ...baseStyle,
          stroke: '#2563eb'
        };
      default:
        return {
          ...baseStyle,
          stroke: '#d1d5db'
        };
    }
  }

  /**
   * Calculate hierarchical layout using depth information
   */
  public calculateLayout(): { nodes: FlowNode[]; edges: FlowEdge[] } {
    const nodes = Array.from(this.nodes.values());
    
    // Group nodes by depth
    const depthGroups = new Map<number, FlowNode[]>();
    for (const node of nodes) {
      const depth = node.data.depth;
      if (!depthGroups.has(depth)) {
        depthGroups.set(depth, []);
      }
      const group = depthGroups.get(depth);
      if (group) group.push(node);
    }

    // Calculate positions
    const horizontalSpacing = 250;
    const verticalSpacing = 150;
    const maxDepth = Math.max(...Array.from(depthGroups.keys()));

    for (let depth = 0; depth <= maxDepth; depth++) {
      const nodesAtDepth = depthGroups.get(depth) ?? [];
      const totalWidth = (nodesAtDepth.length - 1) * horizontalSpacing;
      const startX = -totalWidth / 2;

      nodesAtDepth.forEach((node, index) => {
        node.position = {
          x: startX + index * horizontalSpacing,
          y: depth * verticalSpacing
        };
      });
    }

    return { nodes, edges: this.edges };
  }

  /**
   * Get simulation statistics
   */
  public getStatistics(): SimulationStatistics {
    const cascadeActions = this.simulation.cascadePaths.filter(
      p => p.action.toUpperCase() === 'CASCADE'
    ).length;

    const setNullActions = this.simulation.cascadePaths.filter(
      p => p.action.toUpperCase() === 'SET NULL' || p.action.toUpperCase() === 'SET DEFAULT'
    ).length;

    const restrictActions = this.simulation.cascadePaths.filter(
      p => p.action.toUpperCase() === 'RESTRICT' || p.action.toUpperCase() === 'NO ACTION'
    ).length;

    // Determine severity
    let severityLevel: 'low' | 'medium' | 'high' = 'low';
    if (this.simulation.totalAffectedRows > 100 || this.simulation.maxDepth > 5) {
      severityLevel = 'high';
    } else if (this.simulation.totalAffectedRows > 10 || this.simulation.maxDepth > 2) {
      severityLevel = 'medium';
    }

    return {
      totalTables: this.simulation.affectedTables.length,
      totalRowsAffected: this.simulation.totalAffectedRows,
      cascadeActions,
      setNullActions,
      restrictActions,
      maxDepth: this.simulation.maxDepth,
      hasCascades: cascadeActions > 0,
      hasConstraints: this.simulation.constraints.length > 0,
      hasCircularDeps: this.simulation.circularDependencies.length > 0,
      severityLevel
    };
  }

  /**
   * Get the raw simulation result
   */
  public getSimulationResult(): CascadeSimulationResult {
    return this.simulation;
  }

  /**
   * Check for circular dependencies
   */
  public hasCircularDependencies(): boolean {
    return this.simulation.circularDependencies.length > 0;
  }

  /**
   * Get affected tables grouped by depth
   */
  public getTablesByDepth(): Map<number, AffectedTable[]> {
    const grouped = new Map<number, AffectedTable[]>();
    
    for (const table of this.simulation.affectedTables) {
      if (!grouped.has(table.depth)) {
        grouped.set(table.depth, []);
      }
      const depthGroup = grouped.get(table.depth);
      if (depthGroup) depthGroup.push(table);
    }

    return grouped;
  }

  /**
   * Get cascade paths grouped by source table
   */
  public getPathsBySource(): Map<string, CascadePath[]> {
    const grouped = new Map<string, CascadePath[]>();
    
    for (const path of this.simulation.cascadePaths) {
      if (!grouped.has(path.sourceTable)) {
        grouped.set(path.sourceTable, []);
      }
      const sourceGroup = grouped.get(path.sourceTable);
      if (sourceGroup) sourceGroup.push(path);
    }

    return grouped;
  }
}

