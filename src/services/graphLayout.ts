import dagre from 'dagre';
import type { Node, Edge } from 'reactflow';
import { Position, MarkerType } from 'reactflow';

export type LayoutType = 'hierarchical' | 'force-directed';

export interface GraphNode {
  id: string;
  label: string;
  columns: {name: string; type: string; isPK: boolean}[];
  rowCount: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceColumn: string;
  targetColumn: string;
  onDelete: string;
  onUpdate: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Convert graph data to ReactFlow nodes and edges with layout applied
 */
export function applyLayout(
  graphData: GraphData,
  layoutType: LayoutType
): { nodes: Node[]; edges: Edge[] } {
  if (layoutType === 'hierarchical') {
    return applyHierarchicalLayout(graphData);
  } else {
    return applyForceDirectedLayout(graphData);
  }
}

/**
 * Apply hierarchical (dagre) layout to graph
 */
function applyHierarchicalLayout(graphData: GraphData): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  
  // Configure graph
  g.setGraph({ 
    rankdir: 'TB', // Top to bottom
    align: 'UL', // Align to upper left
    nodesep: 80, // Horizontal spacing between nodes
    ranksep: 100, // Vertical spacing between ranks
    marginx: 20,
    marginy: 20
  });
  
  g.setDefaultEdgeLabel(() => ({}));
  
  // Add nodes to dagre graph
  graphData.nodes.forEach((node) => {
    const width = 250;
    const height = Math.max(150, 60 + node.columns.length * 24); // Dynamic height based on columns
    g.setNode(node.id, { width, height });
  });
  
  // Add edges to dagre graph
  graphData.edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });
  
  // Calculate layout
  dagre.layout(g);
  
  // Convert to ReactFlow nodes
  const nodes: Node[] = graphData.nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    
    return {
      id: node.id,
      type: 'fkNode',
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2
      },
      data: {
        label: node.label,
        columns: node.columns,
        rowCount: node.rowCount
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top
    };
  });
  
  // Convert to ReactFlow edges
  const edges: Edge[] = graphData.edges.map((edge) => {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      // Use default edge type (smoothstep) instead of custom fkEdge which returns null
      type: 'smoothstep',
      animated: false,
      data: {
        sourceColumn: edge.sourceColumn,
        targetColumn: edge.targetColumn,
        onDelete: edge.onDelete,
        onUpdate: edge.onUpdate
      },
      label: edge.onDelete !== 'NO ACTION' ? edge.onDelete : undefined,
      labelStyle: { fill: '#fff', fontWeight: 500, fontSize: 10 },
      labelBgStyle: { fill: getEdgeColor(edge.onDelete), fillOpacity: 0.8 },
      labelBgPadding: [4, 2] as [number, number],
      style: {
        stroke: getEdgeColor(edge.onDelete),
        strokeWidth: 2,
        strokeDasharray: edge.onUpdate !== 'NO ACTION' ? '5,5' : undefined
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: getEdgeColor(edge.onDelete)
      }
    };
  });
  
  return { nodes, edges };
}

/**
 * Apply force-directed layout to graph
 * Uses a simple circular layout with physics-like positioning
 */
function applyForceDirectedLayout(graphData: GraphData): { nodes: Node[]; edges: Edge[] } {
  const nodeCount = graphData.nodes.length;
  
  if (nodeCount === 0) {
    return { nodes: [], edges: [] };
  }
  
  // Calculate positions using a force-directed algorithm
  const positions = calculateForceDirectedPositions(graphData);
  
  // Convert to ReactFlow nodes
  const nodes: Node[] = graphData.nodes.map((node) => {
    const pos = positions[node.id] ?? { x: 0, y: 0 };
    
    return {
      id: node.id,
      type: 'fkNode',
      position: pos,
      data: {
        label: node.label,
        columns: node.columns,
        rowCount: node.rowCount
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left
    };
  });
  
  // Convert to ReactFlow edges
  const edges: Edge[] = graphData.edges.map((edge) => {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      // Use default edge type (smoothstep) instead of custom fkEdge which returns null
      type: 'smoothstep',
      animated: false,
      data: {
        sourceColumn: edge.sourceColumn,
        targetColumn: edge.targetColumn,
        onDelete: edge.onDelete,
        onUpdate: edge.onUpdate
      },
      label: edge.onDelete !== 'NO ACTION' ? edge.onDelete : undefined,
      labelStyle: { fill: '#fff', fontWeight: 500, fontSize: 10 },
      labelBgStyle: { fill: getEdgeColor(edge.onDelete), fillOpacity: 0.8 },
      labelBgPadding: [4, 2] as [number, number],
      style: {
        stroke: getEdgeColor(edge.onDelete),
        strokeWidth: 2,
        strokeDasharray: edge.onUpdate !== 'NO ACTION' ? '5,5' : undefined
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: getEdgeColor(edge.onDelete)
      }
    };
  });

  return { nodes, edges };
}

/**
 * Calculate node positions using force-directed algorithm
 */
function calculateForceDirectedPositions(graphData: GraphData): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const velocities: Record<string, { x: number; y: number }> = {};
  
  // Initialize positions in a circle
  const radius = Math.max(300, graphData.nodes.length * 30);
  const angleStep = (2 * Math.PI) / graphData.nodes.length;
  
  graphData.nodes.forEach((node, index) => {
    const angle = index * angleStep;
    positions[node.id] = {
      x: radius + radius * Math.cos(angle),
      y: radius + radius * Math.sin(angle)
    };
    velocities[node.id] = { x: 0, y: 0 };
  });
  
  // Physics simulation parameters
  const repulsionForce = 5000; // Nodes repel each other
  const attractionForce = 0.01; // Connected nodes attract
  const damping = 0.85; // Velocity damping
  const iterations = 150;
  const minDistance = 200; // Minimum distance between nodes
  
  // Build adjacency map for faster edge lookup
  const adjacency = new Map<string, Set<string>>();
  graphData.edges.forEach(edge => {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, new Set());
    }
    const adjSet = adjacency.get(edge.source);
    if (adjSet) adjSet.add(edge.target);
  });
  
  // Run simulation
  for (let iter = 0; iter < iterations; iter++) {
    const forces: Record<string, { x: number; y: number }> = {};
    
    // Initialize forces
    graphData.nodes.forEach(node => {
      forces[node.id] = { x: 0, y: 0 };
    });
    
    // Calculate repulsion forces (all pairs)
    for (let i = 0; i < graphData.nodes.length; i++) {
      for (let j = i + 1; j < graphData.nodes.length; j++) {
        const node1 = graphData.nodes[i];
        const node2 = graphData.nodes[j];
        if (!node1 || !node2) continue;
        
        const pos1 = positions[node1.id];
        const pos2 = positions[node2.id];
        if (!pos1 || !pos2) continue;
        
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 1;
        
        if (dist < minDistance * 2) {
          const force = repulsionForce / (distSq || 1);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          
          const force1 = forces[node1.id];
          const force2 = forces[node2.id];
          if (force1) {
            force1.x -= fx;
            force1.y -= fy;
          }
          if (force2) {
            force2.x += fx;
            force2.y += fy;
          }
        }
      }
    }
    
    // Calculate attraction forces (connected nodes)
    graphData.edges.forEach(edge => {
      const pos1 = positions[edge.source];
      const pos2 = positions[edge.target];
      const force1 = forces[edge.source];
      const force2 = forces[edge.target];
      
      if (pos1 && pos2 && force1 && force2) {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const force = attractionForce * dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        
        force1.x += fx;
        force1.y += fy;
        force2.x -= fx;
        force2.y -= fy;
      }
    });
    
    // Apply forces to velocities and positions
    graphData.nodes.forEach(node => {
      const vel = velocities[node.id];
      const force = forces[node.id];
      const pos = positions[node.id];
      if (!vel || !force || !pos) return;
      
      vel.x = (vel.x + force.x) * damping;
      vel.y = (vel.y + force.y) * damping;
      
      pos.x += vel.x;
      pos.y += vel.y;
    });
  }
  
  // Center the graph
  const minX = Math.min(...Object.values(positions).map(p => p.x));
  const minY = Math.min(...Object.values(positions).map(p => p.y));
  
  Object.keys(positions).forEach(nodeId => {
    const pos = positions[nodeId];
    if (!pos) return;
    pos.x -= minX - 50;
    pos.y -= minY - 50;
  });
  
  return positions;
}

/**
 * Get edge color based on ON DELETE action
 */
function getEdgeColor(onDelete: string): string {
  switch (onDelete.toUpperCase()) {
    case 'CASCADE':
      return '#eab308'; // yellow-500
    case 'RESTRICT':
      return '#ef4444'; // red-500
    case 'SET NULL':
    case 'SET DEFAULT':
      return '#3b82f6'; // blue-500
    default:
      return '#6b7280'; // gray-500
  }
}

/**
 * Get edge label for display
 */
export function getEdgeLabel(edge: GraphEdge): string {
  const parts = [];
  
  if (edge.onDelete && edge.onDelete !== 'NO ACTION') {
    parts.push(`ON DELETE ${edge.onDelete}`);
  }
  
  if (edge.onUpdate && edge.onUpdate !== 'NO ACTION') {
    parts.push(`ON UPDATE ${edge.onUpdate}`);
  }
  
  return parts.join('\n') || '';
}

/**
 * Find optimal zoom level to fit all nodes
 */
export function calculateFitView(nodes: Node[]): { zoom: number; center: { x: number; y: number } } {
  if (nodes.length === 0) {
    return { zoom: 1, center: { x: 0, y: 0 } };
  }
  
  const padding = 100;
  const minX = Math.min(...nodes.map(n => n.position.x)) - padding;
  const maxX = Math.max(...nodes.map(n => n.position.x + 250)) + padding;
  const minY = Math.min(...nodes.map(n => n.position.y)) - padding;
  const maxY = Math.max(...nodes.map(n => n.position.y + 200)) + padding;
  
  const width = maxX - minX;
  const height = maxY - minY;
  
  const viewportWidth = window.innerWidth - 300; // Account for sidebars
  const viewportHeight = window.innerHeight - 200; // Account for headers
  
  const zoom = Math.min(
    viewportWidth / width,
    viewportHeight / height,
    1.5 // Max zoom
  );
  
  return {
    zoom,
    center: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2
    }
  };
}

