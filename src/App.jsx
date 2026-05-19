import React, { useCallback, useState } from 'react';
import CategoryControls from './components/CategoryControls.jsx';
import ThemePicker from './components/ThemePicker.jsx';
import Tabs from './components/Tabs.jsx';
import MergePanel from './components/MergePanel.jsx';
import RemuxPanel from './components/RemuxPanel.jsx';
import usePersistentState from './hooks/usePersistentState.js';
import useTheme from './hooks/useTheme.js';
import useCategories from './hooks/useCategories.js';
import useScanList from './hooks/useScanList.js';
import useJob from './hooks/useJob.js';
import { api } from './api/client.js';

const MERGE_MESSAGES = {
  initial: 'Loading categories...',
  prompt: 'Select a category to scan.',
  scanning: 'Scanning...',
  empty: 'No multi-part folders found.',
  failed: 'Failed to load media.'
};

const REMUX_MESSAGES = {
  initial: 'Loading remux list...',
  prompt: 'Select a category to scan.',
  scanning: 'Scanning...',
  empty: 'No remuxable folders found.',
  failed: 'Failed to load remux items.'
};

function App() {
  const [theme, setTheme] = useTheme();
  const [activeTab, setActiveTab] = usePersistentState('media-merge-tab', 'merge');
  const [remuxThreads, setRemuxThreads] = usePersistentState('media-merge-remux-threads', 4);

  const [mergeSearch, setMergeSearch] = usePersistentState('media-merge-search-merge', '');
  const [hideNonMergeable, setHideNonMergeable] = usePersistentState(
    'media-merge-hide-nonmergeable',
    false
  );
  const [remuxSearch, setRemuxSearch] = usePersistentState('media-merge-search-remux', '');
  const [hideNonRemuxable, setHideNonRemuxable] = usePersistentState(
    'media-merge-hide-nonremuxable',
    false
  );
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  const { categories, current, currentPath, setCurrent } = useCategories();
  const mergeList = useScanList(current, api.listMedia, MERGE_MESSAGES);
  const remuxList = useScanList(current, api.listRemux, REMUX_MESSAGES);

  const mergeJob = useJob();
  const remuxJob = useJob();

  const handleMerge = useCallback(
    (media) =>
      mergeJob.start(media.id, () => api.startMerge(media.id, current)).catch((err) => {
        console.error('Failed to start merge', err);
      }),
    [mergeJob, current]
  );

  const handleRemuxAll = useCallback(
    async (group) => {
      const requested = window.prompt('Remux threads (1-16):', String(remuxThreads));
      if (requested === null) return;
      const parsed = Number.parseInt(requested, 10);
      const threads = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 16) : remuxThreads;
      setRemuxThreads(threads);
      try {
        await remuxJob.start(group.id, () =>
          api.startRemux({ id: group.id, category: current, mode: 'all', threads })
        );
      } catch (err) {
        console.error('Failed to start remux', err);
      }
    },
    [remuxJob, current, remuxThreads, setRemuxThreads]
  );

  const toggleGroup = useCallback((groupId) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const refreshActive = useCallback(() => {
    if (activeTab === 'merge') mergeList.reload();
    else remuxList.reload();
  }, [activeTab, mergeList, remuxList]);

  return (
    <div className="container">
      <h1>Multi-part Media Merger</h1>
      <ThemePicker theme={theme} onThemeChange={(event) => setTheme(event.target.value)} />
      <CategoryControls
        categories={categories}
        currentCategory={current}
        categoryPath={currentPath}
        onCategoryChange={(event) => setCurrent(event.target.value)}
        onRefresh={refreshActive}
      />
      <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="tab-panel">
        {activeTab === 'merge' ? (
          <MergePanel
            mediaItems={mergeList.items}
            mediaMessage={mergeList.message}
            pendingMergeId={mergeJob.pendingId}
            isMergeRunning={mergeJob.isRunning}
            onMerge={handleMerge}
            logText={mergeJob.logText}
            search={mergeSearch}
            onSearchChange={setMergeSearch}
            hideUnavailable={hideNonMergeable}
            onHideUnavailableChange={setHideNonMergeable}
          />
        ) : (
          <RemuxPanel
            remuxItems={remuxList.items}
            remuxMessage={remuxList.message}
            pendingRemuxId={remuxJob.pendingId}
            isRemuxRunning={remuxJob.isRunning}
            expandedGroups={expandedGroups}
            onToggleGroup={toggleGroup}
            onRemuxAll={handleRemuxAll}
            logText={remuxJob.logText}
            search={remuxSearch}
            onSearchChange={setRemuxSearch}
            hideUnavailable={hideNonRemuxable}
            onHideUnavailableChange={setHideNonRemuxable}
          />
        )}
      </div>
    </div>
  );
}

export default App;
