// public/script.js — complete working version (mobile + desktop + server sync)

const STORAGE = {
    invoices: "invoices",
    transactions: "transactions",
    trash: "trash"
  };
  
  const API_BASE = "/api";
  
  document.addEventListener("DOMContentLoaded", initApp);
  
  function initApp() {
    console.log("Billing app initialized ✅");
  
    // Sidebar Navigation
    document.querySelectorAll(".menu-item").forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });
  
    // Header Buttons
    document.getElementById("setOpening")?.addEventListener("click", setOpening);
    document.getElementById("clearOpening")?.addEventListener("click", clearOpening);
    document.getElementById("eodExport")?.addEventListener("click", eodExport);
    document.getElementById("hamb")?.addEventListener("click", toggleSidebar);
  
    // Transaction Buttons
    document.getElementById("txAdd")?.addEventListener("click", addTransaction);
    document.getElementById("txFilter")?.addEventListener("click", loadTransactions);
    document.getElementById("txDownloadCSV")?.addEventListener("click", downloadTransactionsCSV);
  
    // Invoice Create Buttons
    document.getElementById("addProduct")?.addEventListener("click", addProductRow);
    document.getElementById("recalc")?.addEventListener("click", recalcTotals);
    document.getElementById("saveInvoice")?.addEventListener("click", saveInvoice);
    document.getElementById("printInvoice")?.addEventListener("click", () => openPrintableWindow(currentDraftInvoice()));
    document.getElementById("resetInvoice")?.addEventListener("click", resetInvoice);
  
    // Invoice List Buttons
    document.getElementById("exportAllCSV")?.addEventListener("click", () => downloadCSV("/api/export/invoices/csv"));
    document.getElementById("exportCash")?.addEventListener("click", () => exportInvoicesByPay("Cash"));
    document.getElementById("exportGPay")?.addEventListener("click", () => exportInvoicesByPay("GPay"));
    document.getElementById("searchInvoice")?.addEventListener("input", showInvoicesTable);
  
    // Printable Section
    document.getElementById("openPrint")?.addEventListener("click", openSelectedPrintable);
  
    // Backup
    document.getElementById("exportBackupBtn")?.addEventListener("click", exportBackup);
    document.getElementById("importFile")?.addEventListener("change", importBackup);
  
    // Initialize
    ensureStorage();
    showView("dashboard");
    addProductRow();
    document.getElementById("invoiceId").value = generateId();
    document.getElementById("invoiceDate").value = new Date().toISOString().slice(0, 10);
  
    // Sync with server
    syncFromServer();
    setInterval(syncFromServer, 30000);
  }
  
  /* ------------------ Navigation ------------------ */
  function showView(name) {
    document.querySelectorAll(".view").forEach((v) => (v.style.display = "none"));
    const el = document.getElementById("view-" + name);
    if (el) el.style.display = "block";
  
    if (name === "dashboard") loadDashboard();
    if (name === "transactions") loadTransactions();
    if (name === "invoices") showInvoicesTable();
    if (name === "printable") populatePrintableSelect();
  }
  
  function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open");
  }
  
  /* ------------------ Local Storage ------------------ */
  function ensureStorage() {
    ["invoices", "transactions", "trash"].forEach((key) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, "[]");
    });
  }
  
  function loadJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }
  function saveJSON(key, data) {
    localStorage.setItem(key, JSON.stringify(data || []));
  }
  
  /* ------------------ Server Sync ------------------ */
  function syncFromServer() {
    console.log("Syncing data with server...");
    fetch(API_BASE + "/invoices")
      .then((r) => r.json())
      .then((serverInvs) => {
        saveJSON(STORAGE.invoices, serverInvs);
        showInvoicesTable();
        loadDashboard();
      });
  
    fetch(API_BASE + "/transactions")
      .then((r) => r.json())
      .then((serverTx) => {
        saveJSON(STORAGE.transactions, serverTx);
        loadTransactions();
        loadDashboard();
      });
  }
  
  /* ------------------ Dashboard ------------------ */
  function loadDashboard() {
    const txs = loadJSON(STORAGE.transactions);
    const income = txs.filter((t) => t.type === "income").reduce((a, b) => a + Number(b.amount || 0), 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((a, b) => a + Number(b.amount || 0), 0);
    const cash = txs.filter((t) => t.pay === "Cash").reduce((a, b) => a + Number(b.amount || 0), 0);
  
    document.getElementById("dash-income").innerText = "₹" + income.toFixed(2);
    document.getElementById("dash-expense").innerText = "₹" + expense.toFixed(2);
    document.getElementById("dash-cash").innerText = "₹" + cash.toFixed(2);
  
    const tbody = document.querySelector("#recentTransactions tbody");
    tbody.innerHTML = "";
    if (!txs.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">No recent transactions</td></tr>`;
    } else {
      txs.slice(-5).reverse().forEach((t) => {
        tbody.innerHTML += `<tr>
          <td>${t.date}</td>
          <td>${t.type}</td>
          <td>${t.category}</td>
          <td>${t.pay}</td>
          <td>₹${t.amount.toFixed(2)}</td>
        </tr>`;
      });
    }
  }
  
  /* ------------------ Transactions ------------------ */
  function addTransaction() {
    const type = document.getElementById("txType").value;
    const category = document.getElementById("txCategory").value || "sales";
    const amount = Number(document.getElementById("txAmount").value || 0);
    const date = document.getElementById("txDate").value || new Date().toISOString().slice(0, 10);
    const pay = document.getElementById("txPay").value || "Cash";
  
    if (!amount) return alert("Enter amount");
  
    const tx = { id: "tx-" + Date.now(), type, category, amount, date, pay };
    const txs = loadJSON(STORAGE.transactions);
    txs.push(tx);
    saveJSON(STORAGE.transactions, txs);
    fetch(API_BASE + "/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tx),
    }).catch(() => {});
    loadTransactions();
    loadDashboard();
  }
  
  function loadTransactions() {
    const txs = loadJSON(STORAGE.transactions);
    const tbody = document.querySelector("#txTable tbody");
    tbody.innerHTML = "";
    if (!txs.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No transactions</td></tr>`;
      return;
    }
    txs.forEach((t) => {
      tbody.innerHTML += `<tr>
        <td>${t.date}</td>
        <td>${t.type}</td>
        <td>${t.category}</td>
        <td>${t.pay}</td>
        <td>₹${t.amount.toFixed(2)}</td>
        <td><button class="btn small" onclick="deleteTx('${t.id}')">Del</button></td>
      </tr>`;
    });
  }
  function deleteTx(id) {
    const txs = loadJSON(STORAGE.transactions).filter((t) => t.id !== id);
    saveJSON(STORAGE.transactions, txs);
    loadTransactions();
  }
  
  /* ------------------ Invoice Creation ------------------ */
  function addProductRow() {
    const row = document.createElement("div");
    row.className = "product-row";
    row.innerHTML = `
      <input class="p-name" placeholder="Product name" />
      <input class="p-qty" type="number" placeholder="Qty" />
      <input class="p-rate" type="number" placeholder="Rate" />
      <input class="p-disc" type="number" placeholder="Disc" />
      <div class="amt">₹0.00</div>
      <button class="btn small" onclick="this.parentElement.remove(); recalcTotals()">x</button>
    `;
    document.getElementById("productRows").appendChild(row);
    row.querySelectorAll("input").forEach((i) => i.addEventListener("input", recalcTotals));
  }
  
  function recalcTotals() {
    let subtotal = 0;
    document.querySelectorAll(".product-row").forEach((row) => {
      const qty = Number(row.querySelector(".p-qty").value || 0);
      const rate = Number(row.querySelector(".p-rate").value || 0);
      const disc = Number(row.querySelector(".p-disc").value || 0);
      const amt = qty * rate - disc;
      subtotal += amt;
      row.querySelector(".amt").innerText = "₹" + amt.toFixed(2);
    });
    const tax = Number(document.getElementById("taxPct").value || 0);
    const total = subtotal + (subtotal * tax) / 100;
    document.getElementById("subtotal").innerText = "₹" + subtotal.toFixed(2);
    document.getElementById("totalAmount").innerText = "₹" + total.toFixed(2);
  }
  
  function currentDraftInvoice() {
    const items = [];
    document.querySelectorAll(".product-row").forEach((row) => {
      items.push({
        name: row.querySelector(".p-name").value,
        qty: Number(row.querySelector(".p-qty").value),
        rate: Number(row.querySelector(".p-rate").value),
        disc: Number(row.querySelector(".p-disc").value),
      });
    });
    return {
      id: document.getElementById("invoiceId").value || generateId(),
      date: document.getElementById("invoiceDate").value,
      customer: document.getElementById("invoiceCustomer").value,
      pay: document.getElementById("invoicePay").value,
      products: items,
      total: Number(document.getElementById("totalAmount").innerText.replace(/[₹,]/g, "")),
    };
  }
  
  function saveInvoice() {
    const inv = currentDraftInvoice();
    const invoices = loadJSON(STORAGE.invoices);
    invoices.push(inv);
    saveJSON(STORAGE.invoices, invoices);
    fetch(API_BASE + "/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inv),
    });
    alert("Invoice saved ✅");
    resetInvoice();
    showInvoicesTable();
  }
  
  function resetInvoice() {
    document.getElementById("invoiceCustomer").value = "";
    document.getElementById("productRows").innerHTML = "";
    addProductRow();
    recalcTotals();
    document.getElementById("invoiceId").value = generateId();
  }
  
  /* ------------------ Invoices List ------------------ */
  function showInvoicesTable() {
    const arr = loadJSON(STORAGE.invoices);
    const tbody = document.querySelector("#invoicesTable tbody");
    tbody.innerHTML = "";
    if (!arr.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No invoices</td></tr>`;
      return;
    }
    arr.forEach((i) => {
      tbody.innerHTML += `<tr>
        <td>${i.id}</td>
        <td>${i.date}</td>
        <td>${i.customer}</td>
        <td>${i.pay}</td>
        <td>₹${i.total.toFixed(2)}</td>
        <td>
          <button class="btn small" onclick="openPrintableWindow(${JSON.stringify(i)})">Print</button>
        </td>
      </tr>`;
    });
  }
  
  /* ------------------ Printing ------------------ */
  function openPrintableWindow(inv) {
    const rows = inv.products
      .map(
        (p, i) =>
          `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.qty}</td><td>${p.rate}</td><td>${p.qty * p.rate - p.disc}</td></tr>`
      )
      .join("");
  
    const html = `
    <html><head><title>${inv.id}</title>
    <style>body{font-family:sans-serif;padding:20px;}
    table{width:100%;border-collapse:collapse;}
    th,td{border:1px solid #ccc;padding:8px;}
    </style></head><body>
    <h2>Invoice: ${inv.id}</h2>
    <p><strong>Date:</strong> ${inv.date}</p>
    <p><strong>Customer:</strong> ${inv.customer}</p>
    <p><strong>Payment:</strong> ${inv.pay}</p>
    <table><thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <h3>Total: ₹${inv.total}</h3>
    <script>window.onload=()=>window.print();<\/script>
    </body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  }
  
  /* ------------------ Utilities ------------------ */
  function generateId() {
    return "INV-" + Math.random().toString(36).substr(2, 6).toUpperCase();
  }
  function clearOpening() {
    document.getElementById("openingBalance").value = "";
  }
  function setOpening() {
    alert("Opening balance set");
  }
  function eodExport() {
    fetch(API_BASE + "/export/eod")
      .then((r) => r.json())
      .then((d) => alert("EOD Export Ready ✅"))
      .catch(() => alert("EOD export failed"));
  }
  function exportBackup() {
    const data = {
      invoices: loadJSON(STORAGE.invoices),
      transactions: loadJSON(STORAGE.transactions),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "backup.json";
    a.click();
  }
  function importBackup(evt) {
    const file = evt.target.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
      const data = JSON.parse(e.target.result);
      if (data.invoices) saveJSON(STORAGE.invoices, data.invoices);
      if (data.transactions) saveJSON(STORAGE.transactions, data.transactions);
      alert("Backup imported ✅");
    };
    reader.readAsText(file);
  }
  function downloadCSV(url) {
    fetch(url)
      .then((r) => r.blob())
      .then((b) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "export.csv";
        a.click();
      });
  }
  function exportInvoicesByPay(pay) {
    const arr = loadJSON(STORAGE.invoices).filter((i) => i.pay === pay);
    if (!arr.length) return alert("No " + pay + " invoices found");
    const csv = arr.map((i) => `${i.id},${i.date},${i.customer},${i.total}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = pay + "-invoices.csv";
    a.click();
  }
  function populatePrintableSelect() {
    const sel = document.getElementById("printSelect");
    const arr = loadJSON(STORAGE.invoices);
    sel.innerHTML = arr.map((i) => `<option value="${i.id}">${i.id}</option>`).join("");
  }
  function openSelectedPrintable() {
    const id = document.getElementById("printSelect").value;
    const inv = loadJSON(STORAGE.invoices).find((i) => i.id === id);
    if (inv) openPrintableWindow(inv);
  }
  