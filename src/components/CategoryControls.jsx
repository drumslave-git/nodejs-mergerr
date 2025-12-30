import React from 'react';

function CategoryControls({
  categories,
  currentCategory,
  categoryPath,
  onCategoryChange,
  onRefresh
}) {
  return (
    <div className="controls">
      <label htmlFor="category">Category</label>
      <select
        id="category"
        value={currentCategory}
        onChange={onCategoryChange}
        disabled={categories.length === 0}
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={onRefresh}>
        Refresh
      </button>
      {categoryPath ? <span className="muted">Path: {categoryPath}</span> : null}
    </div>
  );
}

export default CategoryControls;
