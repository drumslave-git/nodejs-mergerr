import React from 'react';

const TABS = [
  { id: 'merge', label: 'Multi-part merger' },
  { id: 'remux', label: 'External audio remux' }
];

function Tabs({ activeTab, onTabChange }) {
  return (
    <div className="tabs" role="tablist" aria-label="Operations">
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={`tab${active ? ' active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
