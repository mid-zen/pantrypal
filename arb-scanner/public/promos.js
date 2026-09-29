"use strict";

// Self-contained helpers (prefixed to avoid clashing with app.js globals).
const $p = (id) => document.getElementById(id);
const pMoney = (n) => "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pMoneyShort = (n) => "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
const pNum = (id) => Number($p(id).value);
// American odds string from decimal (uses app.js's shared Odds helper when present).
const amFmt = (d) => (window.Odds ? window.Odds.fmt(d) : (d >= 2 ? "+" + Math.round((d - 1) * 100) : "" + Math.round(-100 / (d - 1))));
function pEl(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = opts.text;
  for (const [k, v] of Object.entries(opts.attrs || {})) node.setAttribute(k, v);
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

const TYPE_LABELS = {
  free_bet: "Free bet (SNR)",
  risk_free: "Risk-free",
  odds_boost: "Profit boost",
  qualifying: "Qualifying",
};

let findMode = "demo";

// --- per-type field visibility --------------------------------------------
function syncFields() {
  const type = $p("pType").value;
  for (const f of document.querySelectorAll(".pf")) f.hidden = f.dataset.for !== type;
  if (type === "risk_free") $p("pRetentionWrap").hidden = $p("pRefundForm").value !== "freebet";
}

// --- build the promo (type + amounts only; odds come from the scan) --------
function buildPromo() {
  const type = $p("pType").value;
  const promo = { type };
  if (type === "free_bet") promo.freeBetAmount = pNum("pFree");
  else if (type === "risk_free") {
    promo.stake = pNum("pStakeRF");
    promo.refundAmount = pNum("pRefund");
    promo.refundIsCash = $p("pRefundForm").value === "cash";
    promo.refundRetentionPct = pNum("pRetention");
  } else if (type === "odds_boost") {
    promo.stake = pNum("pStakeOB");
    promo.boostMode = "profit_pct";
    promo.boostPct = pNum("pBoostPct");
  } else if (type === "qualifying") {
    promo.stake = pNum("pStakeQ");
  }
  return promo;
}

// --- calculate = find the best bets ---------------------------------------
async function runFinder() {
  const out = $p("pFindResults");
  $p("pCalc").disabled = true;
  out.replaceChildren(pEl("p", { class: "meta", text: "Searching for the best bet…" }));
  try {
    const res = await fetch("/api/promo/find", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        promo: buildPromo(),
        promoBookKey: $p("pFindBook").value,
        demo: findMode === "demo",
        sport: $p("pFindSport").value,
        topN: 15,
      }),
    });
    const data = await res.json();
    if (!data.ok) { out.replaceChildren(pEl("div", { class: "co-bad", text: "✗ " + data.error })); return; }
    renderFinder(data, $p("pFindBook").selectedOptions[0]?.textContent || $p("pFindBook").value);
  } catch (err) {
    out.replaceChildren(pEl("div", { class: "co-bad", text: "Could not reach the server. " + err.message }));
  } finally {
    $p("pCalc").disabled = false;
  }
}

function renderFinder(data, bookTitle) {
  const out = $p("pFindResults");
  if (!data.count) {
    out.replaceChildren(pEl("div", { class: "empty" }, [
      pEl("div", { class: "big", text: "No plays found" }),
      pEl("div", { text: `No ${data.mode} games have ${bookTitle} priced against another Ontario book right now. Try another sport or Live mode.` }),
    ]));
    return;
  }
  const header = pEl("p", { class: "meta", text: `Best plays for your promo at ${bookTitle} (${data.mode} odds), most profit first:` });
  out.replaceChildren(header, ...data.results.map((r, i) => finderCard(r, i)));
}

function finderCard(r, i) {
  const back = r.legs[0], hedge = r.legs[1];
  const badge = pEl("div", { class: "edge" }, [
    pEl("div", { class: "pct", text: pMoneyShort(r.guaranteedProfit) }),
    pEl("div", { class: "lbl", text: "locked profit" }),
  ]);
  const title = pEl("p", { class: "matchup" }, [
    document.createTextNode(`${r.sportTitle}: ${r.matchup}`),
    i === 0 ? pEl("span", { class: "tag-mini best-tag", text: "BEST" }) : null,
  ]);
  const head = pEl("div", { class: "card-head" }, [
    pEl("div", {}, [title, pEl("p", { class: "meta", text: `${r.marketLabel} · starts ${new Date(r.commenceTime).toLocaleString()}` })]),
    badge,
  ]);

  const row = (stake, side, tag, book, odds) =>
    pEl("tr", {}, [
      pEl("td", { class: "stake", text: pMoney(stake) }),
      pEl("td", {}, tag ? [document.createTextNode(side + " "), pEl("span", { class: "tag-mini", text: tag })] : [document.createTextNode(side)]),
      pEl("td", { class: "book", text: book }),
      pEl("td", { class: "odds", text: amFmt(odds) }),
    ]);
  const table = pEl("table", { class: "bets" }, [
    pEl("thead", {}, [pEl("tr", {}, [pEl("th", { text: "Wager" }), pEl("th", { text: "On" }), pEl("th", { text: "At app" }), pEl("th", { text: "Odds" })])]),
    pEl("tbody", {}, [
      row(back.stake, back.side, back.kind === "free-bet" ? "FREE BET" : "cash", back.book, back.odds),
      row(hedge.stake, hedge.side, null, hedge.book, hedge.odds),
    ]),
  ]);

  const verb = back.kind === "free-bet" ? `Put your ${pMoney(back.stake)} free bet on` : `Bet ${pMoney(back.stake)} on`;
  const plain = pEl("p", { class: "plain" }, [
    pEl("strong", { text: `${verb} ${back.side} at ${back.book} (${amFmt(back.odds)}), ` }),
    document.createTextNode(`then wager `),
    pEl("strong", { text: `${pMoney(hedge.stake)} on ${hedge.side} at ${hedge.book} (${amFmt(hedge.odds)})` }),
    document.createTextNode(`. You keep about ${pMoney(r.guaranteedProfit)} either way.`),
  ]);

  const save = pEl("button", { class: "co-prefill", text: "Save to tracker", attrs: { type: "button" } });
  save.addEventListener("click", async () => {
    await fetch("/api/promos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: r.input, note: `${r.matchup} · ${r.marketLabel}` }) });
    save.textContent = "Saved ✓"; save.disabled = true;
    loadTracker();
  });

  return pEl("div", { class: "card promo-card" }, [head, table, plain, pEl("div", { class: "finder-actions" }, [save])]);
}

// --- tracker ---------------------------------------------------------------
async function loadTracker() {
  let data;
  try { data = await (await fetch("/api/promos")).json(); } catch { return; }
  const t = data.totals;
  $p("pTotals").replaceChildren(
    pEl("span", { class: "tot good" }, [pEl("b", { text: pMoney(t.settled) }), pEl("span", { text: " locked in (settled)" })]),
    pEl("span", { class: "tot" }, [pEl("b", { text: pMoney(t.planned) }), pEl("span", { text: " planned" })]),
    pEl("span", { class: "tot" }, [pEl("b", { text: pMoney(t.atRisk) }), pEl("span", { text: " cash at risk" })]),
  );

  const tracker = $p("pTracker");
  if (!data.promos.length) {
    tracker.replaceChildren(pEl("p", { class: "meta", text: "No saved promos yet. Calculate one above and hit “Save to tracker”." }));
    return;
  }

  const rows = data.promos.map((p) => {
    const sel = pEl("select", { class: "status-sel" });
    for (const s of ["planned", "placed", "settled"]) {
      const opt = pEl("option", { text: s, attrs: { value: s } });
      if (p.status === s) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.dataset.prev = p.status;
    sel.addEventListener("change", async () => {
      if (sel.value === "settled" && sel.dataset.prev !== "settled") { openSettleModal(p, sel); return; }
      await fetch("/api/promos?id=" + encodeURIComponent(p.id), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: sel.value }) });
      loadTracker();
    });

    const del = pEl("button", { class: "co-prefill del", text: "✕", attrs: { title: "Delete" } });
    del.addEventListener("click", async () => {
      await fetch("/api/promos?id=" + encodeURIComponent(p.id), { method: "DELETE" });
      loadTracker();
    });

    return pEl("tr", {}, [
      pEl("td", { class: "meta", text: new Date(p.createdAt).toLocaleDateString() }),
      pEl("td", { text: TYPE_LABELS[p.type] || p.type }),
      pEl("td", { class: "book", text: `${p.bookA} → ${p.bookB}` }),
      pEl("td", { class: "stake", text: pMoney(p.guaranteedProfit) }),
      pEl("td", { class: "odds", text: pMoney(p.cashAtRisk) }),
      pEl("td", {}, [sel]),
      pEl("td", { class: "meta", text: p.note || "" }),
      pEl("td", {}, [del]),
    ]);
  });

  tracker.replaceChildren(
    pEl("table", { class: "bets tracker-table" }, [
      pEl("thead", {}, [pEl("tr", {}, [
        pEl("th", { text: "Date" }), pEl("th", { text: "Type" }), pEl("th", { text: "App → App" }),
        pEl("th", { text: "Guaranteed" }), pEl("th", { text: "At risk" }), pEl("th", { text: "Status" }),
        pEl("th", { text: "Note" }), pEl("th", { text: "" }),
      ])]),
      pEl("tbody", {}, rows),
    ])
  );
}

// --- init ------------------------------------------------------------------
$p("pType").addEventListener("change", syncFields);
$p("pRefundForm").addEventListener("change", syncFields);
$p("pFindMode").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-fmode]");
  if (!btn) return;
  findMode = btn.dataset.fmode;
  for (const b of $p("pFindMode").children) b.classList.toggle("active", b === btn);
});
$p("pCalc").addEventListener("click", runFinder);

async function initPromos() {
  syncFields();
  try {
    const meta = await (await fetch("/api/meta")).json();
    const names = meta.brands || (meta.ontario || []).map((b) => b.title);
    if (names.length) $p("obooks").replaceChildren(...names.map((n) => pEl("option", { attrs: { value: n } })));
    // Promo-app dropdown = only books the live feed covers.
    if (meta.ontario) $p("pFindBook").replaceChildren(...meta.ontario.map((b) => pEl("option", { text: b.title, attrs: { value: b.key } })));
  } catch { /* fine without suggestions */ }
  loadTracker();
}
initPromos();

// --- settle → post to bankroll (editable confirmation) --------------------
function openSettleModal(p, sel) {
  const M = window.Modal;
  const settle = () =>
    fetch("/api/promos?id=" + encodeURIComponent(p.id), {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "settled" }),
    }).then(loadTracker);

  if (!M) { settle(); return; }

  const gp = Number(p.guaranteedProfit) || 0;
  const rows = [];
  const list = pEl("div", {});
  const netEl = pEl("div", { class: "net" });
  const signed = (t, a) => (["loss", "withdraw"].includes(t) ? -a : a);

  function recompute() {
    let net = 0;
    for (const r of rows) net += signed(r.type.value, Number(r.amt.value) || 0);
    netEl.replaceChildren(
      pEl("span", { text: "Net posted to bankroll: " }),
      pEl("b", { class: net >= 0 ? "pos" : "neg", text: (net >= 0 ? "+$" : "−$") + Math.abs(net).toFixed(2) }),
      pEl("span", { text: `   (locked profit was ${gp >= 0 ? "+$" : "−$"}${Math.abs(gp).toFixed(2)})` }),
    );
  }

  function addRow(entry) {
    const app = pEl("input", { attrs: { list: "obooks", placeholder: "app", value: entry.app || "" } });
    const type = pEl("select", {});
    for (const [v, l] of [["win", "Bet won"], ["loss", "Bet lost"], ["deposit", "Deposit"], ["withdraw", "Withdraw"], ["bonus", "Bonus"]]) {
      const o = pEl("option", { text: l, attrs: { value: v } });
      if (entry.type === v) o.selected = true;
      type.appendChild(o);
    }
    const amt = pEl("input", { attrs: { type: "number", step: "0.01", value: entry.amount != null ? entry.amount : "" } });
    const rm = pEl("button", { class: "icon-btn", text: "✕", attrs: { type: "button", title: "Remove" } });
    const row = { app, type, amt };
    rows.push(row);
    const rowEl = pEl("div", { class: "entry" }, [app, type, amt, rm]);
    rm.addEventListener("click", () => { const i = rows.indexOf(row); if (i >= 0) rows.splice(i, 1); rowEl.remove(); recompute(); });
    type.addEventListener("input", recompute);
    amt.addEventListener("input", recompute);
    list.appendChild(rowEl);
  }

  addRow({ app: p.bookA, type: "win", amount: gp });
  addRow({ app: p.bookB, type: "loss", amount: 0 });
  recompute();

  const addBtn = pEl("button", { class: "co-prefill", text: "+ Add entry", attrs: { type: "button" } });
  addBtn.addEventListener("click", () => { addRow({ app: "", type: "win", amount: 0 }); recompute(); });
  const cancel = pEl("button", { class: "btn-ghost", text: "Cancel", attrs: { type: "button" } });
  cancel.addEventListener("click", () => { sel.value = sel.dataset.prev || "planned"; M.close(); });
  const confirm = pEl("button", { class: "primary", text: "Post & mark settled", attrs: { type: "button" } });
  confirm.addEventListener("click", async () => {
    const entries = rows.map((r) => ({ app: r.app.value.trim(), type: r.type.value, amount: Number(r.amt.value) || 0, note: `Promo settle: ${TYPE_LABELS[p.type] || p.type}` })).filter((e) => e.app && e.amount !== 0);
    if (entries.length) await fetch("/api/bankroll/post", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entries }) });
    await settle();
    M.close();
    if (window.Bankroll) window.Bankroll.reload();
  });

  M.open(pEl("div", { class: "modal" }, [
    pEl("h3", { text: "Settle promo → post to bankroll" }),
    pEl("p", { class: "meta", text: `${TYPE_LABELS[p.type] || p.type}: ${p.bookA} → ${p.bookB}. Edit what actually hit each app (whichever side won). Any app not tracked yet is created automatically.` }),
    list, addBtn, netEl,
    pEl("div", { class: "modal-actions" }, [cancel, confirm]),
  ]));
}
