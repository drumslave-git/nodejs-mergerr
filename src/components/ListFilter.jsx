import React from 'react';
import Icon from './Icon.jsx';

function ListFilter({
  search,
  onSearchChange,
  hideUnavailable,
  onHideUnavailableChange,
  hideUnavailableLabel,
  hideProcessed,
  onHideProcessedChange,
  visibleCount,
  totalCount,
  searchAriaLabel,
  trailing
}) {
  const trimmed = (search || '').trim();
  const isFiltering = Boolean(trimmed) || hideUnavailable || hideProcessed;

  return (
    <div className="filter-bar">
      <div className="search">
        <span className="search__icon">
          <Icon name="search" size={14} />
        </span>
        <input
          type="search"
          className="input"
          placeholder="Search by name or path..."
          value={search || ''}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label={searchAriaLabel}
        />
        {search ? (
          <button
            type="button"
            className="search__clear"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
          >
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={Boolean(hideUnavailable)}
          onChange={(event) => onHideUnavailableChange(event.target.checked)}
        />
        {hideUnavailableLabel}
      </label>
      {onHideProcessedChange ? (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={Boolean(hideProcessed)}
            onChange={(event) => onHideProcessedChange(event.target.checked)}
          />
          Hide processed
        </label>
      ) : null}
      {trailing}
      {isFiltering && totalCount > 0 ? (
        <span className="filter-bar__count">
          {visibleCount} of {totalCount} shown
        </span>
      ) : null}
    </div>
  );
}

export default ListFilter;
