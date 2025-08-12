// Tiny helpers
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

function msg(text, kind = 'ok') {
  const t = document.createElement('div');
  t.textContent = text;
  t.style.cssText = `
    position:fixed; right:16px; bottom:16px; padding:10px 12px;
    border-radius:8px; background:${kind==='ok'?'#1f6feb':'#a61b1b'}; color:white; z-index:9999;
  `;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 2200);
}

function rowActions(type, id) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex'; wrap.style.gap = '6px';

  const edit = document.createElement('button');
  edit.title = 'Edit'; edit.textContent = '✏️';
  edit.onclick = () => beginEdit(type, id);

  const del = document.createElement('button');
  del.title = 'Delete'; del.textContent = '🗑️';
  del.onclick = () => removeItem(type, id);

  wrap.append(edit, del);
  return wrap;
}

// ---------- LOADERS ----------
async function loadGroups() {
  const data = await api('/groups');
  const tbody = $('#groups-table tbody'); tbody.innerHTML = '';
  data.forEach(({id, name}) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${id}</td><td>${name}</td><td></td>`;
    tr.lastChild.appendChild(rowActions('groups', id));
    tbody.appendChild(tr);
  });
  return data;
}

async function loadUsers() {
  const data = await api('/users');
  const tbody = $('#users-table tbody'); tbody.innerHTML = '';
  data.forEach(({id, name, email}) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${id}</td><td>${name}</td><td>${email}</td><td></td>`;
    tr.lastChild.appendChild(rowActions('users', id));
    tbody.appendChild(tr);
  });
  return data;
}

async function loadMemberships() {
  const data = await api('/memberships');
  const tbody = $('#memberships-table tbody'); tbody.innerHTML = '';
  data.forEach(({id, user_name, group_name, role}) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${id}</td><td>${user_name}</td><td>${group_name}</td><td>${role}</td><td></td>`;
    tr.lastChild.appendChild(rowActions('memberships', id));
    tbody.appendChild(tr);
  });
  return data;
}

// ---------- MEMBERSHIP SELECTS ----------
async function populateMembershipSelects() {
  const [users, groups] = await Promise.all([ api('/users'), api('/groups') ]);
  const uSel = $('#m-user-select'); const gSel = $('#m-group-select');
  uSel.length = 1; gSel.length = 1; // keep placeholder
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = String(u.id);
    opt.textContent = `${u.name} (${u.email})`;
    uSel.appendChild(opt);
  });
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = String(g.id);
    opt.textContent = g.name;
    gSel.appendChild(opt);
  });
}

// ---------- CREATE ----------
async function createGroup(e){
  e.preventDefault();
  const name = $('#group-name').value.trim();
  if (!name) return msg('Group name is required','err');
  try { await api('/groups', { method:'POST', body: JSON.stringify({ name }) }); msg('Group created'); $('#group-name').value=''; refreshAll(); }
  catch(e){ msg(e.message,'err'); }
}

async function createUser(e){
  e.preventDefault();
  const name  = $('#user-name').value.trim();
  const email = $('#user-email').value.trim();
  if (!name || !email) return msg('Name & email required','err');
  try { await api('/users', { method:'POST', body: JSON.stringify({ name, email }) }); msg('User created'); $('#user-name').value=''; $('#user-email').value=''; refreshAll(); }
  catch(e){ msg(e.message,'err'); }
}

async function createMembership(e){
  e.preventDefault();
  const user_id  = Number($('#m-user-select').value);
  const group_id = Number($('#m-group-select').value);
  const role     = $('#m-role').value;
  if (!user_id || !group_id || !role) return msg('Select user, group & role','err');
  try {
    await api('/memberships', { method:'POST', body: JSON.stringify({ user_id, group_id, role }) });
    msg('Membership created'); $('#m-user-select').value=''; $('#m-group-select').value=''; $('#m-role').value='';
    loadMemberships();
  } catch(e){ msg(e.message,'err'); }
}

// ---------- EDIT / DELETE ----------
function beginEdit(type, id) {
  let newVal;
  if (type === 'groups') {
    newVal = prompt('New group name:');
    if (!newVal) return;
    api(`/groups/${id}`, { method:'PUT', body: JSON.stringify({ name:newVal.trim() }) })
      .then(()=>{ msg('Group updated'); refreshAll(); })
      .catch(err=>msg(err.message,'err'));
  } else if (type === 'users') {
    const name  = prompt('New user name:');
    const email = prompt('New email:');
    if (!name || !email) return;
    api(`/users/${id}`, { method:'PUT', body: JSON.stringify({ name:name.trim(), email:email.trim() }) })
      .then(()=>{ msg('User updated'); refreshAll(); })
      .catch(err=>msg(err.message,'err'));
  } else {
    const role = prompt("New role (viewer, editor, group-admin, dashboard-admin):");
    if (!role) return;
    api(`/memberships/${id}`, { method:'PUT', body: JSON.stringify({ role: role.trim() }) })
      .then(()=>{ msg('Membership updated'); loadMemberships(); })
      .catch(err=>msg(err.message,'err'));
  }
}

function removeItem(type, id) {
  if (!confirm('Are you sure?')) return;
  api(`/${type}/${id}`, { method:'DELETE' })
    .then(()=>{ msg('Deleted'); refreshAll(); })
    .catch(err=>msg(err.message,'err'));
}

// ---------- WIRE UP ----------
$('#group-form')?.addEventListener('submit', createGroup);
$('#user-form')?.addEventListener('submit', createUser);
$('#membership-form')?.addEventListener('submit', createMembership);

function refreshAll(){
  // after groups/users load, repopulate selects for memberships
  loadGroups().then(populateMembershipSelects);
  loadUsers().then(populateMembershipSelects);
  loadMemberships();
}

refreshAll();
