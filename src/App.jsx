import React, { useEffect, useRef, useState } from 'react';
import CategoryControls from './components/CategoryControls.jsx';
import ThemePicker from './components/ThemePicker.jsx';
import Tabs from './components/Tabs.jsx';
import MergePanel from './components/MergePanel.jsx';
import RemuxPanel from './components/RemuxPanel.jsx';
import usePersistantState from './hooks/usePersistantState.js';

function App() {
  const [categories, setCategories] = useState([]);
  const [currentCategory, setCurrentCategory] = usePersistantState('media-merge-category', '');
  const [categoryPath, setCategoryPath] = useState('');
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaMessage, setMediaMessage] = useState('Loading categories...');
  const [remuxItems, setRemuxItems] = useState([]);
  const [remuxMessage, setRemuxMessage] = useState('Loading remux list...');
  const [logText, setLogText] = useState('');
  const [currentChannel, setCurrentChannel] = useState(null);
  const [pendingMergeId, setPendingMergeId] = useState(null);
  const [pendingRemuxId, setPendingRemuxId] = useState(null);
  const [activeTab, setActiveTab] = usePersistantState('media-merge-tab', 'merge');
  const [remuxThreads, setRemuxThreads] = usePersistantState('media-merge-remux-threads', 4);
  const [themePreference, setThemePreference] = usePersistantState('media-merge-theme', 'system');
  const [expandedRemuxGroups, setExpandedRemuxGroups] = useState(() => new Set());
  const currentChannelRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => {
    currentChannelRef.current = currentChannel;
  }, [currentChannel]);

  useEffect(() => {
    const source = new EventSource('/events');
    source.addEventListener('log', (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload.channel && payload.message) {
          if (currentChannelRef.current && payload.channel === currentChannelRef.current) {
            setLogText((prev) => prev + payload.message);
          }
        }
      } catch (err) {
        console.error('Failed to parse log event', err);
      }
    });

    source.onerror = (err) => {
      console.error('EventSource failed:', err);
    };

    return () => source.close();
  }, []);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logText]);

  useEffect(() => {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    if (themePreference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', themePreference);
    }
  }, [themePreference]);

  async function loadCategories() {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      const list = Array.isArray(data?.categories) ? data.categories : [];
      setCategories(list);
      if (list.length === 0) {
        setCurrentCategory('');
        setCategoryPath('');
        setMediaItems([]);
        setMediaMessage('No categories configured.');
        return;
      }
      const hasStored = currentCategory && list.some((category) => category.id === currentCategory);
      const initial = hasStored ? currentCategory : list[0].id;
      setCurrentCategory(initial);
      const selected = list.find((category) => category.id === initial);
      setCategoryPath(selected?.path || '');
      await fetchMedia(initial);
      await fetchRemux(initial);
    } catch (err) {
      console.error('Failed to load categories', err);
      setMediaItems([]);
      setMediaMessage('Failed to load categories.');
      setRemuxItems([]);
      setRemuxMessage('Failed to load categories.');
    }
  }

  async function fetchMedia(categoryId) {
    if (!categoryId) {
      setMediaItems([]);
      setMediaMessage('Select a category to scan.');
      return;
    }
    setMediaItems([]);
    setMediaMessage('Scanning...');
    try {
      const res = await fetch(`/api/media?category=${encodeURIComponent(categoryId)}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setMediaItems(list);
      if (list.length === 0) {
        setMediaMessage('No multi-part folders found.');
      }
    } catch (err) {
      console.error('Failed to load media', err);
      setMediaItems([]);
      setMediaMessage('Failed to load media.');
    }
  }

  async function fetchRemux(categoryId) {
    if (!categoryId) {
      setRemuxItems([]);
      setRemuxMessage('Select a category to scan.');
      return;
    }
    setRemuxItems([]);
    setRemuxMessage('Scanning...');
    try {
      const res = await fetch(`/api/remux?category=${encodeURIComponent(categoryId)}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setRemuxItems(list);
      if (list.length === 0) {
        setRemuxMessage('No remuxable folders found.');
      }
    } catch (err) {
      console.error('Failed to load remux items', err);
      setRemuxItems([]);
      setRemuxMessage('Failed to load remux items.');
    }
  }

  async function handleMerge(media) {
    setLogText('');
    setCurrentChannel(null);
    setPendingMergeId(media.id);
    try {
      const res = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: media.id, category: currentCategory })
      });
      const data = await res.json();
      if (data && data.channel) {
        setCurrentChannel(data.channel);
      } else if (!res.ok) {
        console.error('Merge request failed', data);
      }
    } catch (err) {
      console.error('Failed to start merge', err);
    } finally {
      setTimeout(() => {
        setPendingMergeId((current) => (current === media.id ? null : current));
      }, 5000);
    }
  }

  async function handleRemuxAll(group) {
    const requested = window.prompt('Remux threads (1-16):', String(remuxThreads));
    if (requested === null) {
      return;
    }
    const parsed = parseInt(requested, 10);
    const normalized = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 16) : remuxThreads;
    setRemuxThreads(normalized);
    setLogText('');
    setCurrentChannel(null);
    setPendingRemuxId(group.id);
    try {
      const res = await fetch('/api/remux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: group.id,
          category: currentCategory,
          mode: 'all',
          threads: normalized
        })
      });
      const data = await res.json();
      if (data && data.channel) {
        setCurrentChannel(data.channel);
      } else if (!res.ok) {
        console.error('Remux request failed', data);
      }
    } catch (err) {
      console.error('Failed to start remux', err);
    } finally {
      setTimeout(() => {
        setPendingRemuxId((current) => (current === group.id ? null : current));
      }, 5000);
    }
  }

  function toggleRemuxGroup(groupId) {
    setExpandedRemuxGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <div className="container">
      <h1>Multi-part Media Merger</h1>
        <ThemePicker
            theme={themePreference}
            onThemeChange={(event) => setThemePreference(event.target.value)}
        />
      <CategoryControls
        categories={categories}
        currentCategory={currentCategory}
        categoryPath={categoryPath}
        onCategoryChange={(event) => {
          const next = event.target.value;
          setCurrentCategory(next);
          const selected = categories.find((category) => category.id === next);
          setCategoryPath(selected?.path || '');
          fetchMedia(next);
          fetchRemux(next);
        }}
        onRefresh={() =>
          activeTab === 'merge' ? fetchMedia(currentCategory) : fetchRemux(currentCategory)
        }
      />
      <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="tab-panel">
        {activeTab === 'merge' ? (
          <MergePanel
            mediaItems={mediaItems}
            mediaMessage={mediaMessage}
            pendingMergeId={pendingMergeId}
            isMergeRunning={Boolean(pendingMergeId)}
            onMerge={handleMerge}
            logText={logText}
            logRef={logRef}
          />
        ) : (
          <RemuxPanel
            remuxItems={remuxItems}
            remuxMessage={remuxMessage}
            pendingRemuxId={pendingRemuxId}
            isRemuxRunning={Boolean(pendingRemuxId)}
            expandedRemuxGroups={expandedRemuxGroups}
            onToggleGroup={toggleRemuxGroup}
            onRemuxAll={handleRemuxAll}
            logText={logText}
            logRef={logRef}
          />
        )}
      </div>
    </div>
  );
}

export default App;
