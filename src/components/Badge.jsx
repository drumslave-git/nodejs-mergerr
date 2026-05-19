import React from 'react';

const VARIANTS = new Set(['default', 'success', 'warn', 'danger', 'accent']);

function Badge({ children, variant = 'default', className = '' }) {
  const safeVariant = VARIANTS.has(variant) ? variant : 'default';
  const cls = `badge${safeVariant !== 'default' ? ` badge--${safeVariant}` : ''} ${className}`.trim();
  return <span className={cls}>{children}</span>;
}

export default Badge;
