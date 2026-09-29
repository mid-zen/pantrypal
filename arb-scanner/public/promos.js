"use strict";

// Self-contained (app.js helpers aren't shared across <script> tags).
const $p = (id) => document.getElementById(id);
const pMoney = (n) => "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function pEl(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = opts.text;
  for (const [k, v] of Object.entries(opts.attrs || {})) node.setAttribute(k, v);
  for (const c of children) if (c) node.appendChild(c);
  return node;
}
const pNum = (id) => Number($p(id).value);

const TYPE_LABELS = {
  free_bet: "Free bet (SNR)",
  risk_free: "Risk-free",
  odds_boost: "Odds boost",
  qualifying: "Qualifying",
};

let lastInput = null;

// --- dynamic field visibility --------------------------------------------
function syncFields() {
  const type = $p("pType").value;
  for (const f of document.querySelectorAll(".pf")) {
    f.hidden = f.dataset.for !== type;
  }
  // Back-odds label hint for boosts (it's the pre-boost base price there).
  $p("pBackOddsLabel").textContent = type === "odds_boost" ? "Base odds @ A (pre-boost)" : "Back odds @ A";
  if (type === "risk_free") {
    $p("pRetentionWrap").hidden = $p("pRefundForm").value !== "freebet";
  }
  if (type === "odds_boost") {
    const mode = $p("pBoostMode").value;
    $p("pBoostPctWrap").hidden = mode !== "profit_pct";
    $p("pBoostedOddsWrap").hidden = mode !== "to_odds";
  }
}

$p("pType").addEventListener("change", syncFields);
$p("pRefundForm").addEventListener("change", syncFields);
$p("pBoostMode").addEventListener("change", syncFields);

// --- build input & calculate ----------------------------------------------
function buildInput() {
  const type = $p("pType").value;
  const input = {
    type,
    backOdds: pNum("pBackOdds"),
    hedgeOdds: pNum("pHedgeOdds"),
    bookA: $p("pBookA").value,
    bookB: $p("pBookB").value,
    outcomeX: $p("pSideX").value,
    outcomeY: $p("pSideY").value,
  };
  if (type === "free_bet") input.freeBetAmount = pNum("pFree");
  else if (type === "risk_free") {
    input.stake = pNum("pStakeRF");
    input.refundAmount = pNum("pRefund");
    input.refundIsCash = $p("pRefundForm").value === "cash";
    input.refundRetentionPct = pNum("pRetention");
  } else if (type === "odds_boost") {
    input.stake = pNum("pStakeOB");
    input.boostMode = $p("pBoostMode").value;
    if (input.boostMode === "profit_pct") input.boostPct = pNum("pBoostPct");
    else input.boostedOdds = pNum("pBoostedOdds");
  } else if (type === "qualifying") {
    input.stake = pNum("pStakeQ");
  }
  return input;
}

async function calculate() {
  const input = buildInput();
  $p("pCalc").disabled = true;
  try {
    const res = await fetch("/api/promo/calc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const data = await res.json();
    if (!data.ok) {
      $p("pResult").replaceChildren(pEl("div", { class: "co-bad", text: "✗ " + data.error }));
      $p("pSave").disabled = true;
      lastInput = null;
      return;
    }
    lastInput = input;
    $p("pSave").disabled = false;
    renderResult(data.result);
  } catch (err) {
    $p("pResult").replaceChildren(pEl("div", { class: "co-bad", text: "Could not reach the server. " + err.message }));
  } finally {
    $p("pCalc").disabled = false;
  }
}

function renderResult(r) {
  const positive = r.guaranteedProfit >= -0.005;

  const profit = pEl("div", { class: "profit" }, [
    pEl("span", { text: positive ? "Guaranteed profit " : "Guaranteed result " }),
    pEl("b", { class: positive ? "" : "neg", text: pMoney(r.guaranteedProfit) }),
    pEl("span", {
      text:
        ` either way · real cash at risk now ${pMoney(r.cashAtRisk)}` +
        (r.conversionPct != null ? ` · ${r.conversionPct.toFixed(1)}% of the free bet kept` : ""),
    }),
  ]);

  const rows = r.legs.map((l) =>
    pEl("tr", {}, [
      pEl("td", { class: "stake", text: pMoney(l.stake) }),
      pEl("td", {}, [
        document.createTextNode(l.side + " "),
        pEl("span", { class: "tag-mini", text: l.kind === "free-bet" ? "FREE BET" : "cash" }),
      ]),
      pEl("td", { class: "book", text: l.book }),
      pEl("td", { class: "odds", text: l.odds.toFixed(2) }),
      pEl("td", { class: "meta", text: l.note || "" }),
    ])
  );
  const table = pEl("table", { class: "bets" }, [
    pEl("thead", {}, [pEl("tr", {}, [
      pEl("th", { text: "Place" }), pEl("th", { text: "On" }), pEl("th", { text: "At book" }),
      pEl("th", { text: "Odds" }), pEl("th", { text: "Note" }),
    ])]),
    pEl("tbody", {}, rows),
  ]);

  const plain = pEl("p", { class: "plain" }, [pEl("strong", { text: "In plain terms: " }), document.createTextNode(r.summary)]);
  const warns = (r.warnings || []).map((w) => pEl("p", { class: "warn", text: "⚠ " + w }));

  $p("pResult").replaceChildren(pEl("div", { class: "card promo-card" }, [profit, table, plain, ...warns]));
}

$p("pCalc").addEventListener("click", calculate);

// --- save + tracker --------------------------------------------------------
$p("pSave").addEventListener("click", async () => {
  if (!lastInput) return;
  $p("pSave").disabled = true;
  try {
    const res = await fetch("/api/promos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: lastInput, note: $p("pNote").value }),
    });
    const data = await res.json();
    if (data.ok) {
      $p("pNote").value = "";
      await loadTracker();
    }
  } finally {
    $p("pSave").disabled = false;
  }
});

async function loadTracker() {
  let data;
  try {
    data = await (await fetch("/api/promos")).json();
  } catch {
    return;
  }
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
    sel.addEventListener("change", async () => {
      await fetch("/api/promos?id=" + encodeURIComponent(p.id), {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: sel.value }),
      });
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
        pEl("th", { text: "Date" }), pEl("th", { text: "Type" }), pEl("th", { text: "A → B" }),
        pEl("th", { text: "Guaranteed" }), pEl("th", { text: "At risk" }), pEl("th", { text: "Status" }),
        pEl("th", { text: "Note" }), pEl("th", { text: "" }),
      ])]),
      pEl("tbody", {}, rows),
    ])
  );
}

// --- init ------------------------------------------------------------------
async function initPromos() {
  syncFields();
  // Populate the Ontario book datalist from the server meta (full brand list,
  // including books usable here for manual entry even if not scannable live).
  try {
    const meta = await (await fetch("/api/meta")).json();
    const names = meta.brands || (meta.ontario || []).map((b) => b.title);
    if (names.length) {
      $p("obooks").replaceChildren(...names.map((n) => pEl("option", { attrs: { value: n } })));
    }
  } catch { /* datalist is a convenience; fine without it */ }
  loadTracker();
}
initPromos();
