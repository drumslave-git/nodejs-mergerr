async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Empty / non-JSON body is allowed.
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  listCategories: () => request('/api/categories'),
  listMedia: (categoryId) => request(`/api/media?category=${encodeURIComponent(categoryId)}`),
  listRemux: (categoryId) => request(`/api/remux?category=${encodeURIComponent(categoryId)}`),
  startMerge: (id, category) =>
    request('/api/merge', { method: 'POST', body: JSON.stringify({ id, category }) }),
  startRemux: (payload) =>
    request('/api/remux', { method: 'POST', body: JSON.stringify(payload) })
};
