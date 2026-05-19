import React from 'react';

function Spinner({ size = 'sm', label }) {
  const className = size === 'lg' ? 'spinner spinner--lg' : 'spinner';
  return (
    <span
      className={className}
      role="status"
      aria-label={label || 'Loading'}
    />
  );
}

export default Spinner;
