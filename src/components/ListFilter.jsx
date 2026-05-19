import React from 'react';

function ListFilter({
  search,
  onSearchChange,
  hideUnavailable,
  onHideUnavailableChange,
  hideUnavailableLabel,
  visibleCount,
  totalCount,
  searchAriaLabel
}) {
  const isFiltering = Boolean((search || '').trim()) || hideUnavailable;
  return (
    <div className="list-filter">
      <input
        type="search"
        className="list-filter-search"
        placeholder="Search by name or path..."
        value={search || ''}
        onChange={(event) => onSearchChange(event.target.value)}
        aria-label={searchAriaLabel}
      />
      <label className="list-filter-toggle">
        <input
          type="checkbox"
          checked={Boolean(hideUnavailable)}
          onChange={(event) => onHideUnavailableChange(event.target.checked)}
        />
        {hideUnavailableLabel}
      </label>
      {isFiltering && totalCount > 0 ? (
        <span className="list-filter-count muted">
          {visibleCount} of {totalCount} shown
        </span>
      ) : null}
    </div>
  );
}

export default ListFilter;
