"use strict";

// --- tiny helpers --------------------------------------------------------
const $ = (id) => document.getElementById(id);
const money = (n) => "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyShort = (n) => "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

/** Build a DOM element safely (text only, no HTML injection). */
function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = opts.text;
  for (const [k, v] of Object.entries(opts.attrs || {})) node.setAttribute(k, v);
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

// --- state ---------------------------------------------------------------
let mode = "demo";
let timer = null;

// --- mode toggle ---------------------------------------------------------
$("modeToggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-mode]");
  if (!btn) return;
  mode = btn.dataset.mode;
  for (const b of $("modeToggle").children) b.classList.toggle("active", b === btn);
  scan();
});

$("scanBtn").addEventListener("click", scan);

$("autoRefresh").addEventListener("change", setupAutoRefresh);
$("interval").addEventListener("change", setupAutoRefresh);

function setupAutoRefresh() {
  if (timer) { clearInterval(timer); timer = null; }
  if ($("autoRefresh").checked) {
    const secs = Number($("interval").value) || 60;
    timer = setInterval(scan, secs * 1000);
  }
}

// --- scan ----------------------------------------------------------------
async function scan() {
  const params = new URLSearchParams({
    demo: mode === "demo" ? "1" : "0",
    sport: $("sport").value,
    stake: $("stake").value || "1000",
    minMargin: $("minMargin").value || "0",
    books: $("books").value,
  });

  $("scanBtn").disabled = true;
  setStatus([el("span", { class: "spinner" }), el("span", { text: " Scanning…" })], false);

  const t0 = Date.now();
  try {
    const res = await fetch("/api/scan?" + params.toString());
    const data = await res.json();
    // Demo scans answer instantly and often with identical results; hold the
    // spinner briefly so the click visibly did something.
    await new Promise((r) => setTimeout(r, Math.max(0, 400 - (Date.now() - t0))));
    if (!data.ok) { renderError(data.error); return; }
    render(data);
  } catch (err) {
    renderError("Could not reach the server. Is `npm run web` still running? (" + err.message + ")");
  } finally {
    $("scanBtn").disabled = false;
  }
}

function setStatus(children, isError) {
  const s = $("status");
  s.className = "status" + (isError ? " error" : "");
  s.replaceChildren(...children);
}

function renderError(msg) {
  setStatus([el("span", { text: "⚠︎ " + msg })], true);
  $("results").replaceChildren(
    el("div", { class: "empty" }, [el("div", { class: "big", text: "Couldn’t scan" }), el("div", { text: msg })])
  );
}

// --- render --------------------------------------------------------------
function render(data) {
  // Status line with book chips.
  const time = new Date(data.generatedAt).toLocaleTimeString();
  const modeLabel = data.mode === "demo" ? "SAMPLE DATA (built-in example games, not real odds)" : "LIVE";
  let head = `${modeLabel} · ${data.count} ${data.count === 1 ? "opportunity" : "opportunities"} · ${data.gamesScanned} games · ${time}`;
  if (data.cached) head += " · cached";
  if (data.quotaRemaining != null) head += ` · API quota left: ${data.quotaRemaining}`;
  const bits = [el("span", { text: head + "  " })];
  if (data.books) {
    bits.push(el("span", { text: data.booksLabel + ": " }));
    for (const b of data.books) bits.push(el("span", { class: "chip", text: b }));
  } else {
    bits.push(el("span", { class: "chip", text: "ALL BOOKS — not Ontario-filtered" }));
  }
  setStatus(bits, false);

  const results = $("results");
  if (data.count === 0) {
    results.replaceChildren(
      el("div", { class: "empty" }, [
        el("div", { class: "big", text: "No arbitrage right now" }),
        el("div", { text: "That’s normal — true arbs are rare and short-lived. Try Live mode, more sports, or a lower min edge." }),
      ])
    );
    return;
  }
  results.replaceChildren(...data.opportunities.map((o) => card(o)));
}

function card(o) {
  // Header: matchup + market + edge badge
  const head = el("div", { class: "card-head" }, [
    el("div", {}, [
      el("p", { class: "matchup", text: `${o.sportTitle}: ${o.matchup}` }),
      el("p", { class: "meta", text: `${o.marketLabel} · starts ${new Date(o.commenceTime).toLocaleString()}` }),
    ]),
    el("div", { class: "edge" }, [
      el("div", { class: "pct", text: o.marginPct.toFixed(2) + "%" }),
      el("div", { class: "lbl", text: "edge" }),
    ]),
  ]);

  // Profit highlight
  const profit = el("div", { class: "profit" }, [
    el("span", { text: "Guaranteed profit " }),
    el("b", { text: money(o.worstCaseProfit) }),
    el("span", { text: ` on ${money(o.totalStake)} staked — you win this no matter the result.` }),
  ]);

  // Bets table
  const thead = el("tr", {}, [
    el("th", { text: "Bet" }),
    el("th", { text: "On" }),
    el("th", { text: "At book" }),
    el("th", { text: "Odds" }),
    el("th", { text: "Returns" }),
  ]);
  const rows = o.legs.map((l) =>
    el("tr", {}, [
      el("td", { class: "stake", text: money(l.roundedStake) }),
      el("td", { text: l.outcomeName + (l.point != null ? " " + l.point : "") }),
      el("td", { class: "book", text: l.bookmaker }),
      el("td", { class: "odds", text: l.decimal.toFixed(2) }),
      el("td", { class: "ret", text: money(l.payout) }),
    ])
  );
  const table = el("table", { class: "bets" }, [el("thead", {}, [thead]), el("tbody", {}, rows)]);

  // Plain-English summary
  const plain = el("p", { class: "plain" }, plainSummary(o));

  // Safety warnings (stale price, too-good-to-be-true edge, …)
  const warns = (o.warnings || []).map((w) => el("p", { class: "warn", text: "⚠ " + w }));

  return el("div", { class: "card" }, [head, profit, table, plain, ...warns]);
}

function plainSummary(o) {
  const parts = [document.createTextNode("In plain terms: ")];
  o.legs.forEach((l, i) => {
    parts.push(el("strong", { text: `bet ${moneyShort(l.roundedStake)} on ${l.outcomeName} at ${l.bookmaker}` }));
    if (i < o.legs.length - 1) parts.push(document.createTextNode(o.legs.length > 2 ? ", " : " and "));
  });
  parts.push(document.createTextNode(`. Either way you collect about ${moneyShort(o.legs[0].payout)} back.`));
  return parts;
}

// --- go ------------------------------------------------------------------
scan();
