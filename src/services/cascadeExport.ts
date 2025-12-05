import type { CascadeSimulationResult } from './api';
import { CascadeSimulationEngine } from './cascadeSimulation';

/**
 * Service for exporting cascade simulation results in multiple formats
 */
export class CascadeExportService {
  private simulation: CascadeSimulationResult;
  private engine: CascadeSimulationEngine;

  constructor(simulation: CascadeSimulationResult) {
    this.simulation = simulation;
    this.engine = new CascadeSimulationEngine(simulation);
  }

  /**
   * Export as CSV format
   * Returns tabular data with all affected entities
   */
  public exportAsCSV(): string {
    const lines: string[] = [];
    
    // Header
    lines.push('Table Name,Action,Rows Before,Rows After,Affected Rows,Depth,Severity');
    
    // Data rows
    for (const table of this.simulation.affectedTables) {
      const affectedRows = table.rowsBefore - table.rowsAfter;
      const severity = this.getSeverityForTable(table.action, affectedRows);
      
      lines.push(
        `"${table.tableName}","${table.action}",${String(table.rowsBefore)},${String(table.rowsAfter)},${String(affectedRows)},${String(table.depth)},"${severity}"`
      );
    }
    
    // Add summary section
    lines.push('');
    lines.push('Summary');
    lines.push(`Total Tables Affected,${String(this.simulation.affectedTables.length)}`);
    lines.push(`Total Rows Affected,${String(this.simulation.totalAffectedRows)}`);
    lines.push(`Maximum Cascade Depth,${String(this.simulation.maxDepth)}`);
    lines.push(`Total Cascade Paths,${String(this.simulation.cascadePaths.length)}`);
    
    // Add warnings section
    if (this.simulation.warnings.length > 0) {
      lines.push('');
      lines.push('Warnings');
      lines.push('Type,Message,Severity');
      for (const warning of this.simulation.warnings) {
        lines.push(`"${warning.type}","${warning.message}","${warning.severity}"`);
      }
    }
    
    // Add constraints section
    if (this.simulation.constraints.length > 0) {
      lines.push('');
      lines.push('Constraints');
      lines.push('Table,Message');
      for (const constraint of this.simulation.constraints) {
        lines.push(`"${constraint.table}","${constraint.message}"`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Export as JSON format
   * Returns complete simulation graph structure
   */
  public exportAsJSON(): string {
    const stats = this.engine.getStatistics();
    
    const exportData = {
      metadata: {
        targetTable: this.simulation.targetTable,
        whereClause: this.simulation.whereClause || null,
        exportedAt: new Date().toISOString(),
        version: '1.1.1'
      },
      statistics: stats,
      simulation: {
        totalAffectedRows: this.simulation.totalAffectedRows,
        maxDepth: this.simulation.maxDepth,
        cascadePaths: this.simulation.cascadePaths,
        affectedTables: this.simulation.affectedTables,
        warnings: this.simulation.warnings,
        constraints: this.simulation.constraints,
        circularDependencies: this.simulation.circularDependencies
      }
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export as plain text summary
   * Returns human-readable impact report
   */
  public exportAsText(): string {
    const lines: string[] = [];
    const stats = this.engine.getStatistics();
    
    // Header
    lines.push('='.repeat(60));
    lines.push('CASCADE IMPACT SIMULATION REPORT');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Target Table: ${this.simulation.targetTable}`);
    if (this.simulation.whereClause) {
      lines.push(`WHERE Clause: ${this.simulation.whereClause}`);
    }
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push('');
    
    // Summary
    lines.push('SUMMARY');
    lines.push('-'.repeat(60));
    lines.push(`Total Tables Affected: ${String(stats.totalTables)}`);
    lines.push(`Total Rows Affected: ${String(stats.totalRowsAffected)}`);
    lines.push(`Maximum Cascade Depth: ${String(stats.maxDepth)} level(s)`);
    lines.push(`Severity: ${stats.severityLevel.toUpperCase()}`);
    lines.push('');
    
    // Action breakdown
    lines.push('ACTION BREAKDOWN');
    lines.push('-'.repeat(60));
    lines.push(`CASCADE Actions: ${String(stats.cascadeActions)}`);
    lines.push(`SET NULL Actions: ${String(stats.setNullActions)}`);
    lines.push(`RESTRICT Actions: ${String(stats.restrictActions)}`);
    lines.push('');
    
    // Affected tables by depth
    lines.push('AFFECTED TABLES BY DEPTH');
    lines.push('-'.repeat(60));
    const tablesByDepth = this.engine.getTablesByDepth();
    
    for (let depth = 0; depth <= stats.maxDepth; depth++) {
      const tables = tablesByDepth.get(depth) ?? [];
      if (tables.length > 0) {
        lines.push(`\nDepth ${String(depth)}:`);
        for (const table of tables) {
          const affectedRows = table.rowsBefore - table.rowsAfter;
          lines.push(`  - ${table.tableName} (${table.action}): ${String(affectedRows)} row(s) affected`);
        }
      }
    }
    lines.push('');
    
    // Cascade paths
    if (this.simulation.cascadePaths.length > 0) {
      lines.push('CASCADE PATHS');
      lines.push('-'.repeat(60));
      const pathsBySource = this.engine.getPathsBySource();
      
      for (const [source, paths] of pathsBySource.entries()) {
        lines.push(`\nFrom ${source}:`);
        for (const path of paths) {
          lines.push(
            `  -> ${path.targetTable} (${path.action}, ${String(path.affectedRows)} rows, depth ${String(path.depth)})`
          );
        }
      }
      lines.push('');
    }
    
    // Warnings
    if (this.simulation.warnings.length > 0) {
      lines.push('WARNINGS');
      lines.push('-'.repeat(60));
      for (const warning of this.simulation.warnings) {
        const icon = this.getSeverityIcon(warning.severity);
        lines.push(`${icon} [${warning.severity.toUpperCase()}] ${warning.message}`);
      }
      lines.push('');
    }
    
    // Constraints
    if (this.simulation.constraints.length > 0) {
      lines.push('CONSTRAINTS');
      lines.push('-'.repeat(60));
      for (const constraint of this.simulation.constraints) {
        lines.push(`! ${constraint.table}: ${constraint.message}`);
      }
      lines.push('');
    }
    
    // Circular dependencies
    if (this.simulation.circularDependencies.length > 0) {
      lines.push('CIRCULAR DEPENDENCIES');
      lines.push('-'.repeat(60));
      for (const circular of this.simulation.circularDependencies) {
        lines.push(`! ${circular.message}`);
      }
      lines.push('');
    }
    
    // Footer
    lines.push('='.repeat(60));
    lines.push('END OF REPORT');
    lines.push('='.repeat(60));
    
    return lines.join('\n');
  }

  /**
   * Export as PDF format
   * Returns PDF blob with visual graph and summary statistics
   */
  public async exportAsPDF(graphElement: HTMLElement | null): Promise<Blob> {
    // Dynamically import libraries
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    let yPosition = margin;
    
    // Title
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Cascade Impact Simulation Report', margin, yPosition);
    yPosition += 12;
    
    // Metadata
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Target Table: ${this.simulation.targetTable}`, margin, yPosition);
    yPosition += 6;
    if (this.simulation.whereClause) {
      pdf.text(`WHERE Clause: ${this.simulation.whereClause}`, margin, yPosition);
      yPosition += 6;
    }
    pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);
    yPosition += 10;
    
    // Summary statistics
    const stats = this.engine.getStatistics();
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Summary', margin, yPosition);
    yPosition += 8;
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    const summaryLines = [
      `Total Tables Affected: ${String(stats.totalTables)}`,
      `Total Rows Affected: ${String(stats.totalRowsAffected)}`,
      `Maximum Cascade Depth: ${String(stats.maxDepth)} level(s)`,
      `Severity: ${stats.severityLevel.toUpperCase()}`,
      `CASCADE Actions: ${String(stats.cascadeActions)}`,
      `SET NULL Actions: ${String(stats.setNullActions)}`,
      `RESTRICT Actions: ${String(stats.restrictActions)}`
    ];
    
    for (const line of summaryLines) {
      pdf.text(line, margin, yPosition);
      yPosition += 5;
    }
    yPosition += 5;
    
    // Warnings
    if (this.simulation.warnings.length > 0) {
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Warnings', margin, yPosition);
      yPosition += 8;
      
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      for (const warning of this.simulation.warnings) {
        const warningText = `[${warning.severity.toUpperCase()}] ${warning.message}`;
        const splitLines = pdf.splitTextToSize(warningText, contentWidth) as string[];
        pdf.text(splitLines, margin, yPosition);
        yPosition += splitLines.length * 5;
      }
      yPosition += 5;
    }
    
    // Add graph visualization if available
    if (graphElement) {
      try {
        pdf.addPage();
        yPosition = margin;
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Dependency Graph', margin, yPosition);
        yPosition += 10;
        
        // Capture graph as image
        const canvas = await html2canvas(graphElement, {
          scale: 2,
          backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = contentWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Check if we need to split across pages
        const maxHeight = pdf.internal.pageSize.getHeight() - 2 * margin;
        if (imgHeight > maxHeight) {
          // Scale down to fit page
          const scaledHeight = maxHeight;
          const scaledWidth = (canvas.width * scaledHeight) / canvas.height;
          pdf.addImage(imgData, 'PNG', margin, yPosition, scaledWidth, scaledHeight);
        } else {
          pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
        }
      } catch {
        // Failed to add graph to PDF, continue without it
      }
    }
    
    // Affected tables details (new page)
    pdf.addPage();
    yPosition = margin;
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Affected Tables', margin, yPosition);
    yPosition += 10;
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    
    const tablesByDepth = this.engine.getTablesByDepth();
    for (let depth = 0; depth <= stats.maxDepth; depth++) {
      const tables = tablesByDepth.get(depth) ?? [];
      if (tables.length > 0) {
        // Check if we need a new page
        if (yPosition > pdf.internal.pageSize.getHeight() - margin - 20) {
          pdf.addPage();
          yPosition = margin;
        }
        
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Depth ${String(depth)}:`, margin, yPosition);
        yPosition += 6;
        
        pdf.setFont('helvetica', 'normal');
        for (const table of tables) {
          const affectedRows = table.rowsBefore - table.rowsAfter;
          const text = `  ${table.tableName} (${table.action}): ${String(affectedRows)} rows affected`;
          pdf.text(text, margin + 5, yPosition);
          yPosition += 5;
          
          // Check if we need a new page
          if (yPosition > pdf.internal.pageSize.getHeight() - margin - 10) {
            pdf.addPage();
            yPosition = margin;
          }
        }
        yPosition += 3;
      }
    }
    
    return pdf.output('blob');
  }

  /**
   * Download a file with the given content
   */
  public downloadFile(content: string | Blob, filename: string, mimeType: string): void {
    const blob = content instanceof Blob 
      ? content 
      : new Blob([content], { type: mimeType });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Export and download as CSV
   */
  public exportAndDownloadCSV(): void {
    const csv = this.exportAsCSV();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `cascade-impact-${this.simulation.targetTable}-${timestamp}.csv`;
    this.downloadFile(csv, filename, 'text/csv');
  }

  /**
   * Export and download as JSON
   */
  public exportAndDownloadJSON(): void {
    const json = this.exportAsJSON();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `cascade-impact-${this.simulation.targetTable}-${timestamp}.json`;
    this.downloadFile(json, filename, 'application/json');
  }

  /**
   * Export and download as text
   */
  public exportAndDownloadText(): void {
    const text = this.exportAsText();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `cascade-impact-${this.simulation.targetTable}-${timestamp}.txt`;
    this.downloadFile(text, filename, 'text/plain');
  }

  /**
   * Export and download as PDF
   */
  public async exportAndDownloadPDF(graphElement: HTMLElement | null): Promise<void> {
    const pdfBlob = await this.exportAsPDF(graphElement);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `cascade-impact-${this.simulation.targetTable}-${timestamp}.pdf`;
    this.downloadFile(pdfBlob, filename, 'application/pdf');
  }

  /**
   * Helper: Get severity for a table based on action and affected rows
   */
  private getSeverityForTable(action: string, affectedRows: number): string {
    if (action === 'CASCADE' && affectedRows > 50) return 'high';
    if (action === 'CASCADE' && affectedRows > 10) return 'medium';
    if (action === 'RESTRICT') return 'high';
    return 'low';
  }

  /**
   * Helper: Get icon for severity level
   */
  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'high': return '!!!';
      case 'medium': return '!!';
      case 'low': return '!';
      default: return '-';
    }
  }
}

