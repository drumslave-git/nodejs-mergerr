import React from 'react';
import Icon from './Icon.jsx';

const OPTIONS = [
  { value: 'system', label: 'Auto', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' }
];

function ThemePicker({ theme, onChange }) {
  return (
    <div className="segmented" role="group" aria-label="Theme">
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className="segmented__option"
            aria-pressed={active}
            title={`${option.label} theme`}
            onClick={() => onChange(option.value)}
          >
            <Icon name={option.icon} size={14} />
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ThemePicker;
