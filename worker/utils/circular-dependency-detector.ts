import type { Env } from '../types';

/**
 * Represents a circular dependency cycle in the database schema
 */
export interface CircularDependencyCycle {
  tables: string[];           // Ordered list of tables in cycle
  path: string;               // "users -> profiles -> settings -> users"
  severity: 'low' | 'medium' | 'high';
  cascadeRisk: boolean;       // Has CASCADE operations in cycle
  restrictPresent: boolean;   // Has RESTRICT operations
  constraintNames: string[];  // FK constraint names involved
  message: string;            // Human-readable description
}

/**
 * Edge in the foreign key graph
 */
interface FKGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceColumn: string;
  targetColumn: string;
  onDelete: string;
  onUpdate: string;
}

/**
 * Node in the foreign key graph
 */
interface FKGraphNode {
  id: string;
  label: string;
  columns: Array<{name: string; type: string; isPK: boolean}>;
  rowCount: number;
}

/**
 * Foreign key graph structure
 */
export interface ForeignKeyGraph {
  nodes: FKGraphNode[];
  edges: FKGraphEdge[];
}

/**
 * Detect circular dependencies in a foreign key graph
 * Uses depth-first search (DFS) with path tracking
 */
export function detectCircularDependencies(graph: ForeignKeyGraph): CircularDependencyCycle[] {
  if (!graph.edges || graph.edges.length === 0) {
    return [];
  }

  // Build adjacency list from edges
  const adjacencyList = new Map<string, Array<{target: string; edge: FKGraphEdge}>>();
  
  for (const edge of graph.edges) {
    if (!adjacencyList.has(edge.source)) {
      adjacencyList.set(edge.source, []);
    }
    adjacencyList.get(edge.source)!.push({ target: edge.target, edge });
  }

  // Track visited nodes globally
  const visited = new Set<string>();
  // Track nodes in current recursion stack
  const recursionStack = new Set<string>();
  // Track current path for cycle extraction
  const currentPath: Array<{table: string; edge?: FKGraphEdge}> = [];
  // Store detected cycles
  const cycles: CircularDependencyCycle[] = [];
  // Track seen cycles to avoid duplicates
  const seenCycles = new Set<string>();

  /**
   * Depth-first search to detect cycles
   */
  function dfs(node: string) {
    visited.add(node);
    recursionStack.add(node);
    currentPath.push({ table: node });

    const neighbors = adjacencyList.get(node) || [];
    
    for (const { target, edge } of neighbors) {
      if (!visited.has(target)) {
        // Add edge to path before recursing
        currentPath[currentPath.length - 1].edge = edge;
        dfs(target);
      } else if (recursionStack.has(target)) {
        // Found a cycle - extract it from currentPath
        const cycleStartIndex = currentPath.findIndex(p => p.table === target);
        if (cycleStartIndex !== -1) {
          const cyclePath = currentPath.slice(cycleStartIndex);
          // Add the edge that closes the cycle
          cyclePath.push({ table: target, edge });
          
          const cycle = buildCycleMetadata(cyclePath);
          
          // Deduplicate cycles (same cycle in different starting positions)
          const cycleKey = getCycleKey(cycle.tables);
          if (!seenCycles.has(cycleKey)) {
            seenCycles.add(cycleKey);
            cycles.push(cycle);
          }
        }
      }
    }

    currentPath.pop();
    recursionStack.delete(node);
  }

  // Start DFS from each unvisited node
  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return cycles;
}

/**
 * Build cycle metadata from a path
 */
function buildCycleMetadata(cyclePath: Array<{table: string; edge?: FKGraphEdge}>): CircularDependencyCycle {
  const tables: string[] = [];
  const constraintNames: string[] = [];
  let hasCascade = false;
  let hasRestrict = false;

  // Extract tables and analyze edges
  for (let i = 0; i < cyclePath.length - 1; i++) {
    const pathNode = cyclePath[i];
    tables.push(pathNode.table);
    
    if (pathNode.edge) {
      const onDelete = pathNode.edge.onDelete?.toUpperCase() || 'NO ACTION';
      constraintNames.push(pathNode.edge.id);
      
      if (onDelete === 'CASCADE') {
        hasCascade = true;
      }
      if (onDelete === 'RESTRICT') {
        hasRestrict = true;
      }
    }
  }

  // Classify severity
  const cycleLength = tables.length;
  let severity: 'low' | 'medium' | 'high';
  
  if (cycleLength > 3 || (hasCascade && cycleLength > 2)) {
    severity = 'high';
  } else if (cycleLength === 3 || hasCascade) {
    severity = 'medium';
  } else {
    severity = 'low';
  }

  // Build path string
  const pathString = tables.join(' → ') + ' → ' + tables[0];

  // Build message
  let message = `Circular dependency detected: ${pathString}`;
  if (hasCascade) {
    message += ' (contains CASCADE operations)';
  }
  if (hasRestrict) {
    message += ' (contains RESTRICT constraints)';
  }

  return {
    tables,
    path: pathString,
    severity,
    cascadeRisk: hasCascade,
    restrictPresent: hasRestrict,
    constraintNames,
    message
  };
}

/**
 * Get a normalized cycle key for deduplication
 * Cycles are the same regardless of starting position
 * e.g., [A, B, C] and [B, C, A] and [C, A, B] are the same cycle
 */
function getCycleKey(tables: string[]): string {
  // Find the lexicographically smallest table
  let minIndex = 0;
  for (let i = 1; i < tables.length; i++) {
    if (tables[i] < tables[minIndex]) {
      minIndex = i;
    }
  }
  
  // Rotate the array to start with the smallest table
  const rotated = [...tables.slice(minIndex), ...tables.slice(0, minIndex)];
  
  // Determine if we should reverse (to handle bidirectional cycles)
  const forward = rotated.join(',');
  const reversed = [...rotated].reverse().join(',');
  
  return forward < reversed ? forward : reversed;
}

/**
 * Simulate adding a foreign key and check if it would create a cycle
 */
export function wouldCreateCycle(
  graph: ForeignKeyGraph,
  sourceTable: string,
  targetTable: string
): { wouldCreateCycle: boolean; cycle?: CircularDependencyCycle } {
  // Create a temporary graph with the new edge
  const tempGraph: ForeignKeyGraph = {
    nodes: graph.nodes,
    edges: [
      ...graph.edges,
      {
        id: `temp_fk_${sourceTable}_${targetTable}`,
        source: sourceTable,
        target: targetTable,
        sourceColumn: 'temp_column',
        targetColumn: 'temp_target',
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION'
      }
    ]
  };

  // Detect cycles in the temporary graph
  const cycles = detectCircularDependencies(tempGraph);
  
  // Check if any cycle involves the new edge
  for (const cycle of cycles) {
    if (cycle.tables.includes(sourceTable) && cycle.tables.includes(targetTable)) {
      // Check if the cycle includes the transition from source to target
      const sourceIndex = cycle.tables.indexOf(sourceTable);
      const targetIndex = cycle.tables.indexOf(targetTable);
      
      // If target comes right after source in the cycle, this is the new edge creating the cycle
      if ((sourceIndex + 1) % cycle.tables.length === targetIndex) {
        return {
          wouldCreateCycle: true,
          cycle
        };
      }
    }
  }

  return { wouldCreateCycle: false };
}

/**
 * Get breaking suggestions for a cycle
 * Identifies the "weakest link" - constraints that could be modified or removed
 */
export function getBreakingSuggestions(
  cycle: CircularDependencyCycle,
  graph: ForeignKeyGraph
): Array<{
  constraintName: string;
  sourceTable: string;
  targetTable: string;
  currentAction: string;
  suggestion: string;
  reason: string;
}> {
  const suggestions: Array<{
    constraintName: string;
    sourceTable: string;
    targetTable: string;
    currentAction: string;
    suggestion: string;
    reason: string;
  }> = [];

  // Find edges involved in the cycle
  for (const constraintName of cycle.constraintNames) {
    const edge = graph.edges.find(e => e.id === constraintName);
    if (!edge) continue;

    const onDelete = edge.onDelete?.toUpperCase() || 'NO ACTION';

    // Prioritize CASCADE constraints as candidates for modification
    if (onDelete === 'CASCADE') {
      suggestions.push({
        constraintName: edge.id,
        sourceTable: edge.source,
        targetTable: edge.target,
        currentAction: onDelete,
        suggestion: 'Change ON DELETE to RESTRICT or SET NULL',
        reason: 'CASCADE operations in circular dependencies can cause unexpected data loss'
      });
    }

    // Also suggest removing or modifying NO ACTION constraints
    if (onDelete === 'NO ACTION') {
      suggestions.push({
        constraintName: edge.id,
        sourceTable: edge.source,
        targetTable: edge.target,
        currentAction: onDelete,
        suggestion: 'Consider removing this constraint or changing to SET NULL',
        reason: 'This is a potential weak link that could break the circular dependency'
      });
    }
  }

  return suggestions;
}

