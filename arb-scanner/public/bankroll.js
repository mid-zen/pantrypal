"use strict";

// Self-contained helpers (scripts don't share scope).
const $b = (id) => document.getElementById(id);
const bMoney = (n) => "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bSigned = (n) => (n >= 0 ? "+" : "−") + "$" + Math.abs(Number(n)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function bEl(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = opts.text;
  for (const [k, v] of Object.entries(opts.attrs || {})) node.setAttribute(k, v);
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

const TXN_OPTIONS = [
  ["deposit", "Deposit"],
  ["withdraw", "Withdraw"],
  ["win", "Bet won"],
  ["loss", "Bet lost"],
  ["bonus", "Bonus"],
  ["set", "Set balance"],
];

let lastApps = [];

// --- generic modal (also used by the promo settle flow) -------------------
function openModal(node) {
  const host = $b("modalHost");
  host.replaceChildren(bEl("div", { class: "modal-backdrop" }, [node]));
  host.hidden = false;
  host.querySelector(".modal-backdrop").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) closeModal();
  });
}
function closeModal() {
  $b("modalHost").hidden = true;
  $b("modalHost").replaceChildren();
}
window.Modal = { open: openModal, close: closeModal, el: bEl, money: bMoney };

// --- KPIs ------------------------------------------------------------------
function kpi(label, value, cls) {
  return bEl("div", { class: "kpi" }, [
    bEl("div", { class: "kpi-val " + (cls || ""), text: value }),
    bEl("div", { class: "kpi-lbl", text: label }),
  ]);
}

function renderKpis(t) {
  $b("bkKpis").replaceChildren(
    kpi("Total balance", bMoney(t.balance)),
    kpi("Net profit / loss", bSigned(t.pnl), t.pnl >= 0 ? "pos" : "neg"),
    kpi("Deposited", bMoney(t.deposited)),
    kpi("Withdrawn", bMoney(t.withdrawn)),
  );
}

// --- app cards -------------------------------------------------------------
function txnForm(app) {
  const type = bEl("select", { class: "txn-type" });
  for (const [val, label] of TXN_OPTIONS) type.appendChild(bEl("option", { text: label, attrs: { value: val } }));
  const amount = bEl("input", { class: "txn-amt", attrs: { type: "number", step: "1", placeholder: "$ amount" } });
  const note = bEl("input", { class: "txn-note", attrs: { placeholder: "note (optional)" } });
  const add = bEl("button", { class: "co-prefill", text: "Add", attrs: { type: "submit" } });

  const form = bEl("form", { class: "txn-form" }, [type, amount, note, add]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amt = Number(amount.value);
    if (!Number.isFinite(amt)) return;
    await fetch("/api/bankroll/txn?id=" + encodeURIComponent(app.id), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: type.value, amount: amt, note: note.value }),
    });
    amount.value = ""; note.value = "";
    loadBankroll();
  });
  return form;
}

function txnHistory(app) {
  if (!app.txns.length) return null;
  const rows = app.txns.slice().reverse().map((tx) => {
    const del = bEl("button", { class: "co-prefill del", text: "✕", attrs: { title: "Remove entry" } });
    del.addEventListener("click", async () => {
      await fetch(`/api/bankroll/txn?id=${encodeURIComponent(app.id)}&txn=${encodeURIComponent(tx.id)}`, { method: "DELETE" });
      loadBankroll();
    });
    const label = { deposit: "Deposit", withdraw: "Withdraw", win: "Won", loss: "Lost", bonus: "Bonus", adjust: "Adjust" }[tx.type] || tx.type;
    const signed = ["withdraw", "loss"].includes(tx.type) ? -tx.amount : tx.amount;
    return bEl("tr", {}, [
      bEl("td", { class: "meta", text: new Date(tx.date).toLocaleDateString() }),
      bEl("td", { text: label }),
      bEl("td", { class: "stake " + (signed >= 0 ? "pos" : "neg"), text: bSigned(signed) }),
      bEl("td", { class: "meta", text: tx.note || "" }),
      bEl("td", {}, [del]),
    ]);
  });
  return bEl("details", { class: "txns" }, [
    bEl("summary", { text: `${app.txns.length} transaction${app.txns.length === 1 ? "" : "s"}` }),
    bEl("table", { class: "bets" }, [bEl("tbody", {}, rows)]),
  ]);
}

function appCard(app) {
  const del = bEl("button", { class: "icon-btn", text: "✕", attrs: { title: "Delete app" } });
  del.addEventListener("click", async () => {
    if (!confirm(`Delete "${app.name}" and all its transactions? This can't be undone.`)) return;
    await fetch("/api/bankroll/app?id=" + encodeURIComponent(app.id), { method: "DELETE" });
    loadBankroll();
  });

  const reset = bEl("button", { class: "co-prefill", text: "Reset to $0", attrs: { title: "Wipe this app's transactions and balance" } });
  reset.addEventListener("click", async () => {
    if (!confirm(`Reset "${app.name}" to zero? This clears its transactions and balance (fresh start).`)) return;
    await fetch("/api/bankroll/reset?id=" + encodeURIComponent(app.id), { method: "POST" });
    loadBankroll();
  });

  const pnlCls = app.pnl >= 0 ? "pos" : "neg";
  return bEl("div", { class: "app-card" }, [
    bEl("div", { class: "app-head" }, [
      bEl("h3", { text: app.name }),
      del,
    ]),
    bEl("div", { class: "app-balance", text: bMoney(app.balance) }),
    bEl("div", { class: "pnl " + pnlCls, text: bSigned(app.pnl) + " P/L" }),
    bEl("div", { class: "app-sub", text: `Deposited ${bMoney(app.deposited)} · Withdrawn ${bMoney(app.withdrawn)}` }),
    txnForm(app),
    txnHistory(app),
    bEl("div", { class: "app-foot" }, [reset]),
  ]);
}

// --- load ------------------------------------------------------------------
async function loadBankroll() {
  let data;
  try {
    data = await (await fetch("/api/bankroll")).json();
  } catch {
    return;
  }
  lastApps = data.apps || [];
  renderKpis(data.totals);
  const apps = $b("bkApps");
  if (!lastApps.length) {
    apps.replaceChildren(bEl("div", { class: "empty" }, [
      bEl("div", { class: "big", text: "No apps yet" }),
      bEl("div", { text: "Add a sportsbook above with its current balance to start tracking." }),
    ]));
    return;
  }
  apps.replaceChildren(...lastApps.map(appCard));
}

$b("addAppForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $b("bkName").value.trim();
  if (!name) return;
  const res = await fetch("/api/bankroll/app", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, startingBalance: Number($b("bkStart").value) || 0 }),
  });
  const data = await res.json();
  if (!data.ok) { alert(data.error || "Could not add app."); return; }
  $b("bkName").value = ""; $b("bkStart").value = "0";
  loadBankroll();
});

// Exposed for the promo settle flow.
window.Bankroll = {
  reload: loadBankroll,
  appNames: () => lastApps.map((a) => a.name),
};

loadBankroll();
