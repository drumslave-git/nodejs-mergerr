import React, { useCallback, useState } from 'react';
import AppHeader from './components/AppHeader.jsx';
import RefreshFab from './components/RefreshFab.jsx';
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
  const [hideMergedDone, setHideMergedDone] = usePersistentState(
    'media-merge-hide-processed',
    false
  );
  const [remuxSearch, setRemuxSearch] = usePersistentState('media-merge-search-remux', '');
  const [hideNonRemuxable, setHideNonRemuxable] = usePersistentState(
    'media-merge-hide-nonremuxable',
    false
  );
  const [hideRemuxedDone, setHideRemuxedDone] = usePersistentState(
    'media-merge-hide-remuxed',
    false
  );
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  const { categories, current, currentPath, setCurrent } = useCategories();
  const mergeList = useScanList(current, api.listMedia, MERGE_MESSAGES);
  const remuxList = useScanList(current, api.listRemux, REMUX_MESSAGES);

  const mergeJob = useJob({ onComplete: () => mergeList.reload() });
  const remuxJob = useJob({ onComplete: () => remuxList.reload() });

  const handleMerge = useCallback(
    (media) =>
      mergeJob.start(media.id, () => api.startMerge(media.id, current)).catch((err) => {
        console.error('Failed to start merge', err);
      }),
    [mergeJob, current]
  );

  const handleRemuxAll = useCallback(
    async (group) => {
      try {
        await remuxJob.start(group.id, () =>
          api.startRemux({
            id: group.id,
            category: current,
            mode: 'all',
            threads: remuxThreads
          })
        );
      } catch (err) {
        console.error('Failed to start remux', err);
      }
    },
    [remuxJob, current, remuxThreads]
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

  const isRefreshing = activeTab === 'merge' ? mergeList.loading : remuxList.loading;

  return (
    <div className="app-shell">
      <AppHeader
        title="Multi-part Media Merger"
        theme={theme}
        onThemeChange={setTheme}
        categories={categories}
        currentCategory={current}
        categoryPath={currentPath}
        onCategoryChange={setCurrent}
      />

      <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

      <RefreshFab
        onClick={refreshActive}
        isRefreshing={isRefreshing}
        disabled={isRefreshing || !current}
      />

      <main className="app-content">
        {activeTab === 'merge' ? (
          <MergePanel
            mediaItems={mergeList.items}
            mediaMessage={mergeList.message}
            mediaLoading={mergeList.loading}
            pendingMergeId={mergeJob.pendingId}
            isMergeRunning={mergeJob.isRunning}
            onMerge={handleMerge}
            logText={mergeJob.logText}
            onLogClear={mergeJob.clear}
            search={mergeSearch}
            onSearchChange={setMergeSearch}
            hideUnavailable={hideNonMergeable}
            onHideUnavailableChange={setHideNonMergeable}
            hideProcessed={hideMergedDone}
            onHideProcessedChange={setHideMergedDone}
          />
        ) : (
          <RemuxPanel
            remuxItems={remuxList.items}
            remuxMessage={remuxList.message}
            remuxLoading={remuxList.loading}
            pendingRemuxId={remuxJob.pendingId}
            isRemuxRunning={remuxJob.isRunning}
            expandedGroups={expandedGroups}
            onToggleGroup={toggleGroup}
            onRemuxAll={handleRemuxAll}
            threads={remuxThreads}
            onThreadsChange={setRemuxThreads}
            logText={remuxJob.logText}
            onLogClear={remuxJob.clear}
            search={remuxSearch}
            onSearchChange={setRemuxSearch}
            hideUnavailable={hideNonRemuxable}
            onHideUnavailableChange={setHideNonRemuxable}
            hideProcessed={hideRemuxedDone}
            onHideProcessedChange={setHideRemuxedDone}
          />
        )}
      </main>
    </div>
  );
}

export default App;
