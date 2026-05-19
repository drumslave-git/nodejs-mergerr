import React from 'react';
import Icon from './Icon.jsx';
import Spinner from './Spinner.jsx';

function RefreshFab({ onClick, disabled, isRefreshing, label = 'Refresh list' }) {
  return (
    <button
      type="button"
      className="fab"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {isRefreshing ? <Spinner size="lg" /> : <Icon name="refresh" size={22} />}
    </button>
  );
}

export default RefreshFab;
