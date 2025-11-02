import type { FilterCondition } from '@/services/api';

/**
 * Serialize filters to URL query parameters
 */
export function serializeFilters(filters: Record<string, FilterCondition>): URLSearchParams {
  const params = new URLSearchParams();
  
  for (const [columnName, filter] of Object.entries(filters)) {
    // Skip empty filters
    if (!filter.type) continue;
    
    params.set(`filter_${columnName}`, filter.type);
    
    if (filter.value !== undefined && filter.value !== null && filter.value !== '') {
      params.set(`filterValue_${columnName}`, String(filter.value));
    }
    
    if (filter.value2 !== undefined && filter.value2 !== null && filter.value2 !== '') {
      params.set(`filterValue2_${columnName}`, String(filter.value2));
    }
  }
  
  return params;
}

/**
 * Deserialize URL query parameters to filters
 */
export function deserializeFilters(searchParams: URLSearchParams): Record<string, FilterCondition> {
  const filters: Record<string, FilterCondition> = {};
  
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('filter_')) {
      const columnName = key.substring(7); // Remove 'filter_' prefix
      const filterValue = searchParams.get(`filterValue_${columnName}`);
      const filterValue2 = searchParams.get(`filterValue2_${columnName}`);
      
      filters[columnName] = {
        type: value as FilterCondition['type'],
        value: filterValue || undefined,
        value2: filterValue2 || undefined
      };
    }
  }
  
  return filters;
}

/**
 * Get suggested filter types based on column type
 */
export function getFilterTypesForColumn(columnType: string): Array<{
  value: FilterCondition['type'];
  label: string;
}> {
  const upperType = (columnType || '').toUpperCase();
  
  // Numeric types
  if (upperType.includes('INT') || upperType.includes('REAL') || upperType.includes('NUMERIC')) {
    return [
      { value: 'equals', label: 'Equals (=)' },
      { value: 'notEquals', label: 'Not equals (≠)' },
      { value: 'gt', label: 'Greater than (>)' },
      { value: 'gte', label: 'Greater or equal (≥)' },
      { value: 'lt', label: 'Less than (<)' },
      { value: 'lte', label: 'Less or equal (≤)' },
      { value: 'isNull', label: 'Is NULL' },
      { value: 'isNotNull', label: 'Is not NULL' }
    ];
  }
  
  // Text types
  if (upperType.includes('TEXT') || upperType.includes('CHAR') || upperType.includes('VARCHAR')) {
    return [
      { value: 'contains', label: 'Contains' },
      { value: 'equals', label: 'Equals' },
      { value: 'notEquals', label: 'Not equals' },
      { value: 'startsWith', label: 'Starts with' },
      { value: 'endsWith', label: 'Ends with' },
      { value: 'isNull', label: 'Is NULL' },
      { value: 'isNotNull', label: 'Is not NULL' }
    ];
  }
  
  // Default for other types
  return [
    { value: 'contains', label: 'Contains' },
    { value: 'equals', label: 'Equals' },
    { value: 'notEquals', label: 'Not equals' },
    { value: 'isNull', label: 'Is NULL' },
    { value: 'isNotNull', label: 'Is not NULL' }
  ];
}

/**
 * Format filter display label for UI
 */
export function formatFilterLabel(columnName: string, filter: FilterCondition): string {
  const typeLabels: Record<FilterCondition['type'], string> = {
    contains: 'contains',
    equals: '=',
    notEquals: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    isNull: 'is NULL',
    isNotNull: 'is not NULL',
    startsWith: 'starts with',
    endsWith: 'ends with'
  };
  
  const typeLabel = typeLabels[filter.type] || filter.type;
  
  if (filter.type === 'isNull' || filter.type === 'isNotNull') {
    return `${columnName} ${typeLabel}`;
  }
  
  return `${columnName} ${typeLabel} "${filter.value}"`;
}

/**
 * Check if a filter requires a value input
 */
export function filterRequiresValue(filterType: FilterCondition['type']): boolean {
  return filterType !== 'isNull' && filterType !== 'isNotNull';
}

/**
 * Get count of active filters (non-empty)
 */
export function getActiveFilterCount(filters: Record<string, FilterCondition>): number {
  return Object.values(filters).filter(filter => {
    if (filter.type === 'isNull' || filter.type === 'isNotNull') {
      return true; // These don't need values
    }
    return filter.value !== undefined && filter.value !== null && filter.value !== '';
  }).length;
}

/**
 * Get default filter type for a column type
 */
export function getDefaultFilterType(columnType: string): FilterCondition['type'] {
  const upperType = (columnType || '').toUpperCase();
  
  if (upperType.includes('INT') || upperType.includes('REAL') || upperType.includes('NUMERIC')) {
    return 'equals';
  }
  
  return 'contains'; // Default for text and other types
}

