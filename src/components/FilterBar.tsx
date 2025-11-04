import { X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ColumnInfo, FilterCondition } from '@/services/api';
import { 
  getFilterTypesForColumn, 
  filterRequiresValue, 
  filterRequiresTwoValues,
  filterRequiresMultipleValues,
  getDefaultFilterType,
  getActiveFilterCount
} from '@/utils/filters';

interface FilterBarProps {
  columns: ColumnInfo[];
  filters: Record<string, FilterCondition>;
  onFiltersChange: (filters: Record<string, FilterCondition>) => void;
}

export function FilterBar({ columns, filters, onFiltersChange }: FilterBarProps) {
  const activeCount = getActiveFilterCount(filters);
  
  const handleFilterTypeChange = (columnName: string, type: FilterCondition['type']) => {
    const newFilters = { ...filters };
    
    if (!newFilters[columnName]) {
      newFilters[columnName] = { type, value: '' };
    } else {
      newFilters[columnName] = { ...newFilters[columnName], type };
    }
    
    onFiltersChange(newFilters);
  };
  
  const handleFilterValueChange = (columnName: string, value: string) => {
    const newFilters = { ...filters };
    
    if (!newFilters[columnName]) {
      const column = columns.find(col => col.name === columnName);
      const defaultType = column ? getDefaultFilterType(column.type || '') : 'contains';
      newFilters[columnName] = { type: defaultType, value };
    } else {
      newFilters[columnName] = { ...newFilters[columnName], value };
    }
    
    onFiltersChange(newFilters);
  };
  
  const handleFilterValue2Change = (columnName: string, value2: string) => {
    const newFilters = { ...filters };
    
    if (newFilters[columnName]) {
      newFilters[columnName] = { ...newFilters[columnName], value2 };
    }
    
    onFiltersChange(newFilters);
  };
  
  const handleFilterValuesChange = (columnName: string, valuesStr: string) => {
    const newFilters = { ...filters };
    
    if (newFilters[columnName]) {
      // Parse comma-separated values
      const values = valuesStr.split(',').map(v => v.trim()).filter(v => v !== '');
      const column = columns.find(col => col.name === columnName);
      const isNumeric = column?.type?.toUpperCase().includes('INT') || column?.type?.toUpperCase().includes('REAL');
      
      newFilters[columnName] = { 
        ...newFilters[columnName], 
        values: isNumeric ? values.map(v => Number(v)).filter(n => !isNaN(n)) : values
      };
    }
    
    onFiltersChange(newFilters);
  };
  
  const handleLogicOperatorChange = (columnName: string, operator: 'AND' | 'OR') => {
    const newFilters = { ...filters };
    
    if (newFilters[columnName]) {
      newFilters[columnName] = { ...newFilters[columnName], logicOperator: operator };
    }
    
    onFiltersChange(newFilters);
  };
  
  const handleClearFilter = (columnName: string) => {
    const newFilters = { ...filters };
    delete newFilters[columnName];
    onFiltersChange(newFilters);
  };
  
  const handleClearAllFilters = () => {
    onFiltersChange({});
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, columnName: string) => {
    if (e.key === 'Escape') {
      handleClearFilter(columnName);
    }
  };
  
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Filters</h3>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                {activeCount}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearAllFilters}
              className="h-8"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>
        
        <div className="overflow-x-auto">
          <div className="flex gap-4 min-w-max pb-2">
            {columns.map((column, index) => {
              const filter = filters[column.name];
              const filterTypes = getFilterTypesForColumn(column.type || '');
              const requiresValue = filter && filterRequiresValue(filter.type);
              const requiresTwoValues = filter && filterRequiresTwoValues(filter.type);
              const requiresMultipleValues = filter && filterRequiresMultipleValues(filter.type);
              const isNumeric = column.type?.toUpperCase().includes('INT') || column.type?.toUpperCase().includes('REAL');
              
              const hasValue = filter && (
                filter.type === 'isNull' || 
                filter.type === 'isNotNull' || 
                (requiresTwoValues && filter.value !== undefined && filter.value !== null && filter.value !== '' &&
                 filter.value2 !== undefined && filter.value2 !== null && filter.value2 !== '') ||
                (requiresMultipleValues && filter.values && filter.values.length > 0) ||
                (requiresValue && filter.value !== undefined && filter.value !== null && filter.value !== '')
              );
              
              return (
                <div key={column.name} className="flex flex-col gap-2 min-w-[280px]">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium flex items-center gap-1">
                      {column.name}
                      {column.pk > 0 && (
                        <span className="px-1 py-0.5 text-[10px] bg-primary/10 text-primary rounded">
                          PK
                        </span>
                      )}
                    </Label>
                    {filter && index < columns.length - 1 && (
                      <div className="flex gap-1">
                        <Button
                          variant={filter.logicOperator === 'AND' || !filter.logicOperator ? 'default' : 'outline'}
                          size="sm"
                          className="h-5 px-2 text-[10px]"
                          onClick={() => handleLogicOperatorChange(column.name, 'AND')}
                        >
                          AND
                        </Button>
                        <Button
                          variant={filter.logicOperator === 'OR' ? 'default' : 'outline'}
                          size="sm"
                          className="h-5 px-2 text-[10px]"
                          onClick={() => handleLogicOperatorChange(column.name, 'OR')}
                        >
                          OR
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <Select
                      value={filter?.type || getDefaultFilterType(column.type || '')}
                      onValueChange={(value) => handleFilterTypeChange(column.name, value as FilterCondition['type'])}
                    >
                      <SelectTrigger className="w-full h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {filterTypes.map((ft) => (
                          <SelectItem key={ft.value} value={ft.value} className="text-xs">
                            {ft.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {requiresTwoValues && (
                      <div className="flex gap-1 items-center">
                        <Input
                          type={isNumeric ? 'number' : 'text'}
                          placeholder="Min..."
                          value={filter?.value || ''}
                          onChange={(e) => handleFilterValueChange(column.name, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, column.name)}
                          className="h-9 text-xs flex-1"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input
                          type={isNumeric ? 'number' : 'text'}
                          placeholder="Max..."
                          value={filter?.value2 || ''}
                          onChange={(e) => handleFilterValue2Change(column.name, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, column.name)}
                          className="h-9 text-xs flex-1"
                        />
                      </div>
                    )}
                    
                    {requiresMultipleValues && (
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="value1, value2, value3..."
                          value={filter?.values?.join(', ') || ''}
                          onChange={(e) => handleFilterValuesChange(column.name, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, column.name)}
                          className="h-9 text-xs pr-8"
                        />
                        <span className="absolute right-2 top-2 text-[10px] text-muted-foreground">
                          {filter?.values?.length || 0}/100
                        </span>
                      </div>
                    )}
                    
                    {requiresValue && !requiresTwoValues && !requiresMultipleValues && (
                      <div className="relative">
                        <Input
                          type={isNumeric ? 'number' : 'text'}
                          placeholder="Value..."
                          value={filter?.value || ''}
                          onChange={(e) => handleFilterValueChange(column.name, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, column.name)}
                          className={`h-9 text-xs pr-8 ${hasValue ? 'ring-2 ring-primary' : ''}`}
                        />
                        {hasValue && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-9 w-8 hover:bg-transparent"
                            onClick={() => handleClearFilter(column.name)}
                            title="Clear filter"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                    
                    {!requiresValue && !requiresTwoValues && !requiresMultipleValues && hasValue && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => handleClearFilter(column.name)}
                        title="Clear filter"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                    )}
                    
                    {(requiresTwoValues || requiresMultipleValues) && hasValue && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleClearFilter(column.name)}
                        title="Clear filter"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {activeCount === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            No active filters. Select a filter type and enter a value to filter rows.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

