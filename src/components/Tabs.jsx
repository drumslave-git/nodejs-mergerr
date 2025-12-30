import React from 'react';

function Tabs({ activeTab, onTabChange }) {
  return (
    <div className="tabs" role="tablist" aria-label="Merge options">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'merge'}
        className={`tab ${activeTab === 'merge' ? 'active' : ''}`}
        onClick={() => onTabChange('merge')}
      >
        Multi-part files merger
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'remux'}
        className={`tab ${activeTab === 'remux' ? 'active' : ''}`}
        onClick={() => onTabChange('remux')}
      >
        External Audio remux
      </button>
    </div>
  );
}

export default Tabs;
