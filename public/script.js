// --- helpers ---
async function api(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || 'Invalid JSON' }; }
  if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
  return data;
}

function msg(text, type = 'ok') {
  let bar = document.querySelector('#msgbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'msgbar';
    Object.assign(bar.style, {
      position:'fixed', right:'16px', bottom:'16px', padding:'10px 14px',
      borderRadius:'6px', background: type==='ok' ? '#174a2a' : '#5b1a1a',
      color:'#e9eef5', zIndex:9999, maxWidth:'70%', boxShadow:'0 6px 18px rgba(0,0,0,.4)'
    });
    document.body.appendChild(bar);
  }
  bar.style.background = type==='ok' ? '#174a2a' : '#5b1a1a';
  bar.textContent = text;
  clearTimeout(bar._t);
  bar._t = setTimeout(() => bar.remove(), 2500);
}

// --- renderers ---
function rowActions(type, id) {
  return `
    <button class="mini edit" data-type="${type}" data-id="${id}">✏️</button>
    <button class="mini del"  data-type="${type}" data-id="${id}">🗑️</button>
  `;
}

// GROUPS
async function loadGroups() {
  const rows = await api('/groups');
  const tbody = document.querySelector('#groups-table tbody');
  tbody.innerHTML = rows.map(r =>
    `<tr>
      <td>${r.id}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${rowActions('group', r.id)}</td>
    </tr>`
  ).join('');
}
async function createGroup(e) {
  e.preventDefault();
  const name = document.querySelector('#group-name').value.trim();
  if (!name) return;
  try {
    await api('/groups', { method:'POST', body: JSON.stringify({ name }) });
    msg('Group created'); document.querySelector('#group-name').value='';
    loadGroups();
  } catch (e) { msg(e.message, 'err'); }
}

// USERS
async function loadUsers() {
  const rows = await api('/users');
  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = rows.map(r =>
    `<tr>
      <td>${r.id}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.email)}</td>
      <td>${rowActions('user', r.id)}</td>
    </tr>`
  ).join('');
}
async function createUser(e) {
  e.preventDefault();
  const name = document.querySelector('#user-name').value.trim();
  const email = document.querySelector('#user-email').value.trim();
  if (!name || !email) return msg('Name and email required', 'err');
  try {
    await api('/users', { method:'POST', body: JSON.stringify({ name, email }) });
    msg('User created');
    document.querySelector('#user-name').value='';
    document.querySelector('#user-email').value='';
    loadUsers();
  } catch (e) { msg(e.message, 'err'); }
}

// MEMBERSHIPS
async function loadMemberships() {
  const rows = await api('/memberships');
  const tbody = document.querySelector('#memberships-table tbody');
  tbody.innerHTML = rows.map(r =>
    `<tr>
      <td>${r.id}</td>
      <td>${r.user_name} (#${r.user_id})</td>
      <td>${r.group_name} (#${r.group_id})</td>
      <td>${r.role}</td>
      <td>${rowActions('membership', r.id)}</td>
    </tr>`
  ).join('');
}
async function createMembership(e) {
  e.preventDefault();
  const user_id = Number(document.querySelector('#m-user-id').value);
  const group_id = Number(document.querySelector('#m-group-id').value);
  const role = document.querySelector('#m-role').value;
  if (!user_id || !group_id || !role) return msg('user_id, group_id, role required', 'err');

  try {
    await api('/memberships', { method:'POST', body: JSON.stringify({ user_id, group_id, role }) });
    msg('Membership created');
    document.querySelector('#m-user-id').value='';
    document.querySelector('#m-group-id').value='';
    document.querySelector('#m-role').value='';
    loadMemberships();
  } catch (e) { msg(e.message, 'err'); }
}

// --- edit/delete handlers (event delegation) ---
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button.mini');
  if (!btn) return;
  const type = btn.dataset.type;
  const id = Number(btn.dataset.id);
  if (!type || !id) return;

  // DELETE
  if (btn.classList.contains('del')) {
    if (!confirm('Delete this item?')) return;
    try {
      if      (type === 'group')       await api(`/groups/${id}`, { method:'DELETE' });
      else if (type === 'user')        await api(`/users/${id}`, { method:'DELETE' });
      else if (type === 'membership')  await api(`/memberships/${id}`, { method:'DELETE' });
      msg('Deleted');
      refreshAll();
    } catch (e) { msg(e.message, 'err'); }
    return;
  }

  // EDIT
  if (btn.classList.contains('edit')) {
    try {
      if (type === 'group') {
        const name = prompt('New group name:');
        if (!name) return;
        await api(`/groups/${id}`, { method:'PUT', body: JSON.stringify({ name }) });
        msg('Group updated'); loadGroups();
      } else if (type === 'user') {
        const current = getRowValues(btn);
        const name = prompt('User name:', current[1] || '');
        if (name == null) return;
        const email = prompt('User email:', current[2] || '');
        if (email == null) return;
        await api(`/users/${id}`, { method:'PUT', body: JSON.stringify({ name, email }) });
        msg('User updated'); loadUsers();
      } else if (type === 'membership') {
        const role = prompt('Role (viewer, editor, group-admin, dashboard-admin):', 'viewer');
        if (!role) return;
        await api(`/memberships/${id}`, { method:'PUT', body: JSON.stringify({ role }) });
        msg('Membership updated'); loadMemberships();
      }
    } catch (e) { msg(e.message, 'err'); }
  }
});

// helpers
function getRowValues(button) {
  const tr = button.closest('tr');
  return Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function refreshAll(){ loadGroups(); loadUsers(); loadMemberships(); }

// --- wire up forms and initial load ---
window.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#group-form').addEventListener('submit', createGroup);
  document.querySelector('#user-form').addEventListener('submit', createUser);
  document.querySelector('#membership-form').addEventListener('submit', createMembership);
  refreshAll();
});
