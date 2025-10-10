const API = '/api';

async function fetchTx() {
  const res = await fetch(API + '/transactions');
  return res.json();
}

async function fetchSummary() {
  const res = await fetch(API + '/reports/summary');
  return res.json();
}

function renderTransactions(list) {
  const tbody = document.querySelector('#txTable tbody');
  tbody.innerHTML = '';
  list.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.date}</td><td>${r.type}</td><td>${r.category}</td><td>${r.amount}</td><td>${r.reference || ''}</td>`;
    tbody.appendChild(tr);
  });
}

function renderSummary(s) {
  document.getElementById('summary').innerText = `Income: ${s.income} | Expense: ${s.expense} | Profit: ${s.profit}`;
}

async function loadAll() {
  const [tx, summary] = await Promise.all([fetchTx(), fetchSummary()]);
  renderTransactions(tx);
  renderSummary(summary);
}

document.getElementById('txForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    type: document.getElementById('type').value,
    category: document.getElementById('category').value,
    amount: parseFloat(document.getElementById('amount').value),
    date: document.getElementById('date').value || new Date().toISOString().slice(0,10),
    reference: document.getElementById('reference').value,
    notes: document.getElementById('notes').value
  };
  const res = await fetch(API + '/transactions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  const j = await res.json();
  if (j && j.success) {
    document.getElementById('txForm').reset();
    loadAll();
  } else {
    alert('Error saving: ' + (j && j.error ? j.error : JSON.stringify(j)));
  }
});

loadAll();
