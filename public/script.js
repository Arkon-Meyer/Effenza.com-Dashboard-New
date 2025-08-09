async function fetchData(endpoint, tableId) {
  const res = await fetch(endpoint);
  const data = await res.json();
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = '';
  data.forEach(row => {
    const tr = document.createElement('tr');
    Object.values(row).forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// Groups
document.getElementById('groupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('groupName').value;
  await fetch('/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  fetchData('/groups', 'groupsTable');
});

// Users
document.getElementById('userForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('userName').value;
  const email = document.getElementById('userEmail').value;
  await fetch('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email })
  });
  fetchData('/users', 'usersTable');
});

// Memberships
document.getElementById('membershipForm').addEventListener('submit', async e => {
  e.preventDefault();
  const user_id = parseInt(document.getElementById('membershipUserId').value);
  const group_id = parseInt(document.getElementById('membershipGroupId').value);
  const role = document.getElementById('membershipRole').value;
  await fetch('/memberships', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, group_id, role })
  });
  fetchData('/memberships', 'membershipsTable');
});

// Initial fetch
fetchData('/groups', 'groupsTable');
fetchData('/users', 'usersTable');
fetchData('/memberships', 'membershipsTable');
