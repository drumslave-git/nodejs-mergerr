import React from 'react';

function ThemePicker({ theme, onThemeChange }) {
  return (
    <div className="controls">
      <label htmlFor="theme">Theme</label>
      <select id="theme" value={theme} onChange={onThemeChange}>
        <option value="system">System</option>
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>
    </div>
  );
}

export default ThemePicker;
