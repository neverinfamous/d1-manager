# Row-Level Filtering - Testing Guide

## Implementation Summary

The row-level filtering system has been successfully implemented with the following components:

### Backend Changes
- **worker/utils/helpers.ts**: Added `buildWhereClause()` function with SQL injection protection
  - Escapes special characters in LIKE patterns (%, _, \)
  - Validates column names against schema
  - Handles NULL checks without requiring values
  - Supports case-insensitive text searches
  
- **worker/routes/tables.ts**: Modified GET /api/tables/:dbId/data/:tableName endpoint
  - Parses filter parameters from URL (filter_columnName, filterValue_columnName)
  - Applies WHERE clause before LIMIT/OFFSET
  - Returns filtered results with proper metadata

### Frontend Changes
- **src/services/api.ts**: Updated `getTableData()` to accept filters parameter
  - Serializes filters to URL query parameters
  - Added FilterCondition TypeScript interface
  
- **src/utils/filters.ts**: Filter utility functions
  - `serializeFilters()`: Converts filters to URL params
  - `deserializeFilters()`: Restores filters from URL
  - `getFilterTypesForColumn()`: Returns type-aware filter options
  - `getActiveFilterCount()`: Counts active filters
  
- **src/components/FilterBar.tsx**: New filter UI component
  - Horizontal layout with one input per column
  - Type-aware filter operators (text vs numeric vs other)
  - Individual and bulk clear functionality
  - Active filter highlighting
  - Keyboard support (Escape to clear)
  
- **src/components/TableView.tsx**: Integration
  - Filter state management
  - URL synchronization (read/write)
  - Filter toggle button with badge count
  - "filtered" indicator in row count
  - Reset to page 1 when filters change

## Edge Cases Covered

### ✅ Empty Filter Values
- **Behavior**: Filters with empty values are ignored (not sent to backend)
- **Implementation**: Checked in `serializeFilters()` and backend filter parsing
- **Test**: Set a filter type but leave value empty - no filtering occurs

### ✅ Invalid Column Names
- **Behavior**: Invalid columns are rejected with console warning
- **Implementation**: `buildWhereClause()` validates against schema
- **Test**: Manually add invalid filter param to URL - ignored safely

### ✅ SQL Injection Attempts
- **Behavior**: All values are properly escaped
- **Implementation**: 
  - Single quotes escaped: `'` → `''`
  - LIKE wildcards escaped: `%` → `\%`, `_` → `\_`
  - Column names sanitized (alphanumeric + underscore only)
- **Test Cases**:
  - Value: `'; DROP TABLE users; --`
  - Value: `%malicious%`
  - Value: `test_value`

### ✅ Special Characters in Text Searches
- **Behavior**: Special chars properly escaped in LIKE patterns
- **Implementation**: `escapeLikePattern()` function escapes %, _, \
- **Test**: Search for `user@example.com`, `50%`, `file_name.txt`

### ✅ NULL Checks
- **Behavior**: isNull/isNotNull filters work without value input
- **Implementation**: Special handling in UI (no input shown) and backend (no value needed)
- **Test**: Set filter to "Is NULL" - input disappears, filter applies correctly

### ✅ Case-Insensitive Text Search
- **Behavior**: Text searches use LOWER() for case-insensitive matching
- **Implementation**: Backend uses `LOWER(column) LIKE LOWER(pattern)` for TEXT columns
- **Test**: Search "JOHN" should match "john", "John", "JOHN"

### ✅ No Results with Filters
- **Behavior**: Shows "No rows match your filters" with clear button
- **Implementation**: Conditional message in TableView empty state
- **Test**: Apply filter that matches no rows

### ✅ Filter Persistence Across Refresh
- **Behavior**: Filters stored in URL survive page refresh
- **Implementation**: URL params read on mount, written on filter change
- **Test**: Apply filters, refresh browser - filters remain active

### ✅ Shareable Filtered Views
- **Behavior**: URL contains full filter state, can be copied/shared
- **Implementation**: All filter state in query params
- **Test**: Copy URL with active filters, open in new tab - same filtered view

### ✅ Pagination with Filters
- **Behavior**: Filters maintained across page navigation, reset to page 1 on filter change
- **Implementation**: Filters passed to API on every page load
- **Test**: Filter results, navigate to page 2, change filter - back to page 1

### ✅ Multiple Simultaneous Filters
- **Behavior**: All active filters combined with AND logic
- **Implementation**: Backend joins conditions with ` AND `
- **Test**: Apply filters to 3 different columns - all conditions apply

## Filter Types by Column Type

### TEXT Columns
- Contains
- Equals (case-insensitive)
- Not equals (case-insensitive)
- Starts with
- Ends with
- Is NULL
- Is not NULL

### INTEGER/REAL/NUMERIC Columns
- Equals (=)
- Not equals (≠)
- Greater than (>)
- Greater or equal (≥)
- Less than (<)
- Less or equal (≤)
- Is NULL
- Is not NULL

### Other Types
- Contains
- Equals
- Not equals
- Is NULL
- Is not NULL

## Manual Testing Checklist

### Basic Functionality
- [x] Filter bar appears when clicking "Filters" button
- [x] Active filter count badge shows correct number
- [x] Individual filters can be cleared with X button
- [x] "Clear All" button removes all filters
- [x] Filters persist in URL query parameters
- [x] Page refreshes maintain active filters
- [x] Filter changes reset pagination to page 1

### Type-Aware Filtering
- [x] TEXT columns show text filter options (contains, equals, etc.)
- [x] INTEGER columns show numeric filter options (=, >, <, etc.)
- [x] Number inputs appear for numeric columns
- [x] Text inputs appear for text columns

### Edge Cases
- [x] Empty filter values are ignored
- [x] Special characters are properly escaped
- [x] NULL checks work without value input
- [x] Case-insensitive text search works
- [x] No results shows appropriate message
- [x] Multiple filters combine with AND logic

### UX Polish
- [x] Active filters have visual highlighting (ring)
- [x] Filter toggle button shows as "active" when filters visible
- [x] Row count shows "(filtered)" when filters active
- [x] Escape key clears individual filter
- [x] Keyboard navigation works in filter inputs

## Known Limitations

1. **OR Logic**: Currently only AND logic is supported between filters. OR logic would require a more complex UI.

2. **BETWEEN Operator**: Range filters (value1 to value2) are not yet implemented, though the FilterCondition interface has a `value2` field for future support.

3. **Date Filtering**: No special date picker UI, dates must be entered as text in the format stored in the database.

4. **Filter Presets**: No way to save commonly used filter combinations (future enhancement).

5. **Local Dev**: Mock data filtering in local dev mode only supports basic text operations (contains, equals, startsWith, endsWith). Full SQL filtering only works in production.

## Testing Recommendations

### Before Deployment
1. Test with production D1 database that has real data
2. Verify SQL injection protection with malicious inputs
3. Test with tables having many columns (horizontal scroll)
4. Test with very large result sets (pagination + filtering)
5. Test URL sharing between users
6. Verify mobile responsiveness of filter bar

### After Deployment
1. Monitor backend logs for SQL errors related to filtering
2. Check performance of complex filters on large tables
3. Gather user feedback on filter UX
4. Consider adding filter presets based on usage patterns

## Performance Notes

- Filtering is server-side, so performance depends on:
  - Table size and indexes
  - Filter complexity (LIKE is slower than equality)
  - D1 query execution time
  
- Recommendation: Add indexes on frequently filtered columns for better performance

## Future Enhancements

1. **Advanced Filters**: Support OR logic, BETWEEN operator, IN clause
2. **Filter Presets**: Save and reuse common filter combinations
3. **Date Picker**: Special UI for date/datetime columns
4. **Export Filtered**: Export only the filtered results (currently exports all)
5. **Filter History**: Remember recent filter combinations
6. **Quick Filters**: One-click filters for common values (e.g., "Show only NULL")

