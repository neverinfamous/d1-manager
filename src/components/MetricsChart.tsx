import { useMemo } from 'react';

interface DataPoint {
  label: string;
  value: number;
  tooltip?: string;
}

interface MetricsChartProps {
  data: DataPoint[];
  title: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  formatValue?: (value: number) => string;
  ariaLabel?: string;
}

/**
 * Simple SVG-based line/area chart for metrics visualization
 * Lightweight alternative to heavy chart libraries
 */
export function MetricsChart({
  data,
  title,
  color = '#3b82f6',
  height = 200,
  showGrid = true,
  formatValue = (v) => v.toLocaleString(),
  ariaLabel
}: MetricsChartProps): React.JSX.Element {
  const chartData = useMemo(() => {
    if (data.length === 0) return null;

    const values = data.map((d) => d.value);
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    const range = maxValue - minValue || 1;

    const width = 100;
    const chartHeight = height - 40; // Leave room for labels
    const padding = { top: 10, right: 10, bottom: 30, left: 10 };

    const points = data.map((d, i) => ({
      x: padding.left + (i / Math.max(data.length - 1, 1)) * (width - padding.left - padding.right),
      y: padding.top + (1 - (d.value - minValue) / range) * (chartHeight - padding.top),
      ...d
    }));

    // Generate SVG path for line
    const linePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${String(p.x)} ${String(p.y)}`)
      .join(' ');

    // Generate SVG path for area (filled below line)
    const areaPath = `${linePath} L ${String(points[points.length - 1]?.x ?? 0)} ${String(chartHeight)} L ${String(points[0]?.x ?? 0)} ${String(chartHeight)} Z`;

    // Generate grid lines
    const gridLines = showGrid
      ? Array.from({ length: 5 }, (_, i) => ({
          y: padding.top + (i / 4) * (chartHeight - padding.top),
          value: maxValue - (i / 4) * range
        }))
      : [];

    return {
      points,
      linePath,
      areaPath,
      gridLines,
      maxValue,
      minValue,
      chartHeight,
      padding,
      width
    };
  }, [data, height, showGrid]);

  if (!chartData || data.length === 0) {
    return (
      <div 
        className="flex items-center justify-center bg-muted/30 rounded-lg" 
        style={{ height }}
        role="img"
        aria-label={ariaLabel ?? `${title} chart - no data available`}
      >
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    );
  }

  const { points, linePath, areaPath, gridLines, maxValue, chartHeight, padding, width } = chartData;

  // Calculate which x-axis labels to show (max 7 labels)
  const labelInterval = Math.ceil(points.length / 7);
  const xLabels = points.filter((_, i) => i % labelInterval === 0 || i === points.length - 1);

  return (
    <div className="w-full">
      <h4 className="text-sm font-medium mb-2 text-foreground">{title}</h4>
      <div 
        className="relative"
        role="img"
        aria-label={ariaLabel ?? `${title} chart showing ${data.length} data points. Maximum value: ${formatValue(maxValue)}`}
      >
        <svg
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          className="w-full"
          preserveAspectRatio="none"
          style={{ height }}
        >
          {/* Grid lines */}
          {gridLines.map((line, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                y1={line.y}
                x2={width - padding.right}
                y2={line.y}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeDasharray="2,2"
              />
              <text
                x={padding.left - 2}
                y={line.y}
                fontSize="3"
                fill="currentColor"
                fillOpacity={0.5}
                textAnchor="end"
                dominantBaseline="middle"
                className="select-none"
              >
                {formatValue(line.value)}
              </text>
            </g>
          ))}

          {/* Area fill */}
          <path
            d={areaPath}
            fill={color}
            fillOpacity={0.1}
          />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={0.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {points.map((point, i) => (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r={0.8}
              fill={color}
              className="hover:r-[1.2] transition-all"
            >
              <title>{point.tooltip ?? `${point.label}: ${formatValue(point.value)}`}</title>
            </circle>
          ))}

          {/* X-axis labels */}
          {xLabels.map((point, i) => (
            <text
              key={i}
              x={point.x}
              y={chartHeight + 8}
              fontSize="2.5"
              fill="currentColor"
              fillOpacity={0.6}
              textAnchor="middle"
              className="select-none"
            >
              {point.label}
            </text>
          ))}
        </svg>
      </div>
      {/* Screen reader accessible data table */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point, i) => (
            <tr key={i}>
              <td>{point.label}</td>
              <td>{formatValue(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BarChartProps {
  data: {
    label: string;
    value: number;
    color?: string;
  }[];
  title: string;
  height?: number;
  formatValue?: (value: number) => string;
  ariaLabel?: string;
}

/**
 * Simple SVG-based horizontal bar chart
 */
export function MetricsBarChart({
  data,
  title,
  height = 200,
  formatValue = (v) => v.toLocaleString(),
  ariaLabel
}: BarChartProps): React.JSX.Element {
  if (data.length === 0) {
    return (
      <div 
        className="flex items-center justify-center bg-muted/30 rounded-lg" 
        style={{ height }}
        role="img"
        aria-label={ariaLabel ?? `${title} chart - no data available`}
      >
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barHeight = Math.min(30, (height - 40) / data.length);
  const gap = 4;

  return (
    <div className="w-full">
      <h4 className="text-sm font-medium mb-3 text-foreground">{title}</h4>
      <div 
        className="space-y-1"
        role="img"
        aria-label={ariaLabel ?? `${title} bar chart with ${data.length} items`}
      >
        {data.slice(0, 10).map((item, i) => (
          <div key={i} className="flex items-center gap-2" style={{ height: barHeight + gap }}>
            <span 
              className="text-xs text-muted-foreground w-24 truncate" 
              title={item.label}
            >
              {item.label}
            </span>
            <div className="flex-1 h-full bg-muted/30 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-300"
                style={{
                  width: `${(item.value / maxValue) * 100}%`,
                  backgroundColor: item.color ?? '#3b82f6'
                }}
                title={`${item.label}: ${formatValue(item.value)}`}
              />
            </div>
            <span className="text-xs font-medium w-16 text-right">
              {formatValue(item.value)}
            </span>
          </div>
        ))}
        {data.length > 10 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            +{data.length - 10} more databases
          </p>
        )}
      </div>
      {/* Screen reader accessible data table */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Database</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, i) => (
            <tr key={i}>
              <td>{item.label}</td>
              <td>{formatValue(item.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

