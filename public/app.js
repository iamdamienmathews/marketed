// public/app.js — shared helpers loaded on every app page (not the marketing landing page).

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data;
  try { data = await res.json(); } catch { data = { ok: res.ok }; }
  if (!res.ok || data.ok === false) {
    const message = (data.errors && data.errors.join(' ')) || 'Something went wrong.';
    throw new Error(message);
  }
  return data;
}

// Every protected page calls this first. Redirects to login if there's
// no session, and to the right dashboard if role doesn't match the page.
async function requireSession({ role } = {}) {
  const { user } = await api('/api/auth/me');
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }
  if (role && user.role !== role) {
    window.location.href = user.role === 'admin' ? '/admin/index.html' : '/dashboard.html';
    return null;
  }
  return user;
}

function badge(text) {
  return `<span class="badge badge-${text}">${text.replace('_', ' ')}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/index.html';
}

// --- Skeleton loader helpers ---
// Used as the initial content of any container while its real data is
// being fetched. aria-hidden + a visually-hidden "Loading" label keeps
// screen readers from reading out placeholder shapes while still
// announcing that content is on its way.
function skeletonRows(count = 3) {
  return `
    <div aria-hidden="true">
      ${Array.from({ length: count }).map(() => `
        <div class="skeleton-row">
          <div class="skeleton" style="width:28%"></div>
          <div class="skeleton" style="width:18%"></div>
          <div class="skeleton" style="width:22%"></div>
          <div class="skeleton" style="width:14%"></div>
        </div>
      `).join('')}
    </div>
    <span class="visually-hidden" role="status">Loading…</span>
  `;
}

function skeletonCards(count = 3) {
  return `
    <div class="card-grid" aria-hidden="true">
      ${Array.from({ length: count }).map(() => `
        <div class="skeleton-card">
          <div class="skeleton skeleton-line w-60"></div>
          <div class="skeleton skeleton-line w-80"></div>
          <div class="skeleton skeleton-line w-40"></div>
        </div>
      `).join('')}
    </div>
    <span class="visually-hidden" role="status">Loading…</span>
  `;
}
