// Helper to handle fetch errors neatly
async function api(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json().catch(() => ({}));
}

// ------- Groups -------
async function loadGroups() {
  const rows = await api('/groups');
  const tbody = document.querySelector('#groups-table tbody');
  tbody.innerHTML = rows.map(r => `<tr><td>${r.id}</td><td>${r.name}</td></tr>`).join('');
}
async function createGroup(e) {
  e.preventDefault();
  const name = document.querySelector('#group-name').value.trim();
  if (!name) return;
  await api('/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  document.querySelector('#group-name').value = '';
  await loadGroups();
}

// ------- Users -------
async function loadUsers() {
  const rows = await api('/users');
  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = rows.map(r => `<tr><td>${r.id}</td><td>${r.name}</td><td>${r.email}</td></tr>`).join('');
}
async function createUser(e) {
  e.preventDefault();
  const name = document.querySelector('#user-name').value.trim();
  const email = document.querySelector('#user-email').value.trim();
  if (!name || !email) return;
  await api('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email })
  });
  document.querySelector('#user-name').value = '';
  document.querySelector('#user-email').value = '';
  await loadUsers();
}

// ------- Memberships -------
async function loadMemberships() {
  const rows = await api('/memberships');
  const tbody = document.querySelector('#memberships-table tbody');
  tbody.innerHTML = rows.map(r =>
    `<tr><td>${r.id}</td><td>${r.user_name} (#${r.user_id})</td><td>${r.group_name} (#${r.group_id})</td><td>${r.role}</td></tr>`
  ).join('');
}
async function createMembership(e) {
  e.preventDefault();
  const user_id = Number(document.querySelector('#m-user-id').value);
  const group_id = Number(document.querySelector('#m-group-id').value);
  const role = document.querySelector('#m-role').value;
  if (!user_id || !group_id || !role) return;
  await api('/memberships', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, group_id, role })
  });
  document.querySelector('#m-user-id').value = '';
  document.querySelector('#m-group-id').value = '';
  document.querySelector('#m-role').value = '';
  await loadMemberships();
}

// Wire up events
window.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#group-form').addEventListener('submit', createGroup);
  document.querySelector('#refresh-groups').addEventListener('click', loadGroups);

  document.querySelector('#user-form').addEventListener('submit', createUser);
  document.querySelector('#refresh-users').addEventListener('click', loadUsers);

  document.querySelector('#membership-form').addEventListener('submit', createMembership);
  document.querySelector('#refresh-memberships').addEventListener('click', loadMemberships);

  // initial load
  loadGroups();
  loadUsers();
  loadMemberships();
});
