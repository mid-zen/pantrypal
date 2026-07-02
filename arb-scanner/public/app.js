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
    includeOdds: $("showOdds").checked ? "1" : "0",
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
  } else {
    results.replaceChildren(...data.opportunities.map((o) => card(o)));
  }
  renderOddsBoard(data.events);
}

// --- odds board (raw prices pulled in the scan) ---------------------------
function renderOddsBoard(events) {
  const board = $("oddsBoard");
  if (!$("showOdds").checked || !events || events.length === 0) {
    board.hidden = true;
    return;
  }
  board.hidden = false;
  $("oddsGames").replaceChildren(...events.map(oddsGame));
}

const MARKET_NAMES = { h2h: "Moneyline", spreads: "Spread", totals: "Total" };

function oddsGame(ev) {
  // Best price per outcome (market + name + line) across books, for highlighting.
  const bestOf = new Map();
  for (const b of ev.books) {
    for (const o of b.outcomes) {
      const k = `${b.marketKey}|${o.name}|${o.point ?? ""}`;
      if (!bestOf.has(k) || o.price > bestOf.get(k)) bestOf.set(k, o.price);
    }
  }

  const rows = ev.books.map((b) => {
    const cells = [
      el("td", { class: "book", text: b.bookmaker }),
      el("td", { text: MARKET_NAMES[b.marketKey] || b.marketKey }),
    ];
    const prices = el("td", { class: "prices" });
    b.outcomes.forEach((o, i) => {
      if (i > 0) prices.appendChild(document.createTextNode("  ·  "));
      const pt = o.point != null ? ` ${o.point > 0 && b.marketKey === "spreads" ? "+" : ""}${o.point}` : "";
      prices.appendChild(document.createTextNode(`${o.name}${pt} `));
      const k = `${b.marketKey}|${o.name}|${o.point ?? ""}`;
      const isBest = o.price === bestOf.get(k);
      prices.appendChild(el(isBest ? "b" : "span", { class: isBest ? "best" : "", text: o.price.toFixed(2) }));
    });
    cells.push(prices);
    return el("tr", {}, cells);
  });

  const started = new Date(ev.commenceTime) <= new Date();
  return el("details", { class: "odds-game" }, [
    el("summary", {}, [
      el("strong", { text: `${ev.sportTitle}: ${ev.awayTeam} @ ${ev.homeTeam}` }),
      el("span", { class: "meta", text: `  ${started ? "· STARTED (excluded from arb math)" : "· starts " + new Date(ev.commenceTime).toLocaleString()} · ${ev.books.length} book-markets` }),
    ]),
    el("table", { class: "bets" }, [
      el("thead", {}, [el("tr", {}, [el("th", { text: "Book" }), el("th", { text: "Market" }), el("th", { text: "Prices (decimal)" })])]),
      el("tbody", {}, rows),
    ]),
  ]);
}

// --- cash-out helper -------------------------------------------------------
function cashoutCompute() {
  const sA = Number($("coStakeA").value) || 0;
  const dA = Number($("coOddsA").value) || 0;
  const sB = Number($("coStakeB").value) || 0;
  const dB = Number($("coOddsB").value) || 0;
  const offer = Number($("coOffer").value) || 0;
  const which = $("coWhich").value;
  const out = $("coVerdict");

  if (sA <= 0 || sB <= 0 || dA <= 1 || dB <= 1) {
    out.replaceChildren(el("p", { class: "meta", text: "Enter both legs (stake and decimal odds) to see the math." }));
    return;
  }

  const T = sA + sB;
  const payA = sA * dA;
  const payB = sB * dB;
  const holdProfit = Math.min(payA, payB) - T;

  const lines = [
    el("p", {}, [
      el("span", { text: "Hold both legs to the end: " }),
      el("b", { text: money(holdProfit) + (holdProfit >= 0 ? " profit" : " LOSS") }),
      el("span", { text: ` guaranteed (payouts ${money(payA)} / ${money(payB)} on ${money(T)} staked).` }),
    ]),
  ];

  if (offer > 0) {
    // Cash out the chosen leg at `offer`, other leg rides.
    const ridePay = which === "A" ? payB : payA;
    const cashedPay = which === "A" ? payA : payB;
    const ifRideWins = offer + ridePay - T;
    const ifRideLoses = offer - T; // the cashed leg's outcome happens; you gave its payout up
    const worst = Math.min(ifRideWins, ifRideLoses);
    const breakEven = Math.min(payA, payB);

    lines.push(
      el("p", {}, [
        el("span", { text: `Take ${money(offer)} for leg ${which} now: ` }),
        el("b", { text: `${money(ifRideLoses)}` }),
        el("span", { text: ` if leg ${which}'s side ends up winning (you gave up its ${money(cashedPay)} payout), ` }),
        el("b", { text: `${money(ifRideWins)}` }),
        el("span", { text: ` if the other side wins. Worst case ${money(worst)} vs ${money(holdProfit)} holding.` }),
      ]),
      worst > holdProfit
        ? el("p", { class: "co-good", text: `✓ Take it — this offer guarantees more than holding, no matter the result.` })
        : el("p", { class: "co-bad" }, [
            el("span", {
              text:
                `✗ Not a sure upgrade: this is a gamble that pays off only if the other side wins. ` +
                `The offer must exceed ${money(breakEven)} (your smaller payout) to beat holding in every outcome` +
                (offer <= T ? `, and it must exceed ${money(T)} (your total stake) just to rule out an overall loss` : "") +
                `. Cash-out prices include the book's margin, so offers that good are rare.`,
            }),
          ]),
    );
  } else {
    lines.push(
      el("p", { class: "meta", text: "Enter the app's cash-out offer to compare taking it vs holding. Rule of thumb: an offer only beats holding if it exceeds your smaller leg payout." }),
    );
  }
  out.replaceChildren(...lines);
}

for (const id of ["coStakeA", "coOddsA", "coStakeB", "coOddsB", "coOffer", "coWhich"]) {
  $(id).addEventListener("input", cashoutCompute);
}
$("showOdds").addEventListener("change", scan);
cashoutCompute();

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

  const extras = [];
  if (o.legs.length === 2) {
    const btn = el("button", { class: "co-prefill", text: "Plan a cash-out with these legs ↓", attrs: { type: "button" } });
    btn.addEventListener("click", () => {
      $("coStakeA").value = o.legs[0].roundedStake;
      $("coOddsA").value = o.legs[0].decimal.toFixed(2);
      $("coStakeB").value = o.legs[1].roundedStake;
      $("coOddsB").value = o.legs[1].decimal.toFixed(2);
      $("coOffer").value = 0;
      cashoutCompute();
      document.querySelector(".cashout").scrollIntoView({ behavior: "smooth" });
    });
    extras.push(btn);
  }

  return el("div", { class: "card" }, [head, profit, table, plain, ...warns, ...extras]);
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
