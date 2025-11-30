/**
 * Export ER Diagram as PNG using html2canvas
 */
export async function exportERDiagramAsPNG(databaseName: string): Promise<void> {
  // Find the ReactFlow viewport element
  const reactFlowElement = document.querySelector('.react-flow__viewport');
  
  if (!reactFlowElement) {
    throw new Error('ReactFlow viewport not found');
  }
  
  // Get the parent container to capture the full view
  const containerElement = reactFlowElement.parentElement;
  
  if (!containerElement) {
    throw new Error('ReactFlow container not found');
  }
  
  try {
    // Dynamic import for code splitting
    const { default: html2canvas } = await import('html2canvas');
    
    // Capture the canvas
    const canvas = await html2canvas(containerElement, {
      backgroundColor: '#ffffff',
      scale: 2, // Higher quality
      logging: false,
      useCORS: true,
      allowTaint: true
    });
    
    // Convert to blob and download
    canvas.toBlob((blob) => {
      if (!blob) {
        throw new Error('Failed to create image blob');
      }
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeFilename(databaseName)}-er-diagram.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/png');
  } catch (error) {
    console.error('Error exporting PNG:', error);
    throw error;
  }
}

/**
 * Export ER Diagram data as JSON
 */
export function exportERDiagramAsJSON(data: ERDiagramExportData, databaseName: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(databaseName)}-er-diagram.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Sanitize filename to remove invalid characters
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9_-]/gi, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

/**
 * Type definition for ER Diagram export data
 */
export interface ERDiagramExportData {
  database: string;
  tables: Array<{
    name: string;
    rowCount: number;
    columns: Array<{
      name: string;
      type: string;
      notnull: boolean;
      dflt_value: string | null;
      pk: boolean;
      isForeignKey?: boolean;
    }>;
  }>;
  relationships: Array<{
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    onDelete: string;
    onUpdate: string;
  }>;
  metadata: {
    exportDate: string;
    version: string;
    layoutType: string;
  };
}

