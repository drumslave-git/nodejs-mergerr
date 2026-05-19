import React from 'react';
import ThemePicker from './ThemePicker.jsx';

function AppHeader({
  title,
  theme,
  onThemeChange,
  categories,
  currentCategory,
  categoryPath,
  onCategoryChange
}) {
  const hasCategories = categories.length > 0;
  return (
    <header className="app-header">
      <div className="app-header__row">
        <h1 className="app-title">{title}</h1>
        <ThemePicker theme={theme} onChange={onThemeChange} />
      </div>
      <div className="app-toolbar">
        <label htmlFor="category-select" className="sr-only">
          Category
        </label>
        <select
          id="category-select"
          className="select"
          value={currentCategory}
          onChange={(event) => onCategoryChange(event.target.value)}
          disabled={!hasCategories}
        >
          {!hasCategories ? <option value="">No categories</option> : null}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {categoryPath ? (
          <span className="app-toolbar__path" title={categoryPath}>
            {categoryPath}
          </span>
        ) : null}
      </div>
    </header>
  );
}

export default AppHeader;
