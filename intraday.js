// ============================================================
// BharatQuant — ⚡ Intraday Scalper AI Engine
// Real-time 5-Minute Intraday Quantitative Execution Engine
// Computes VWAP, EMA 9/21, SuperTrend, ORB Breakouts, & Scalp Targets
// ============================================================

(() => {
  'use strict';

  const STOCKS = [
    { symbol: 'ADANIENT',   name: 'Adani Enterprises',     sector: 'Conglomerate' },
    { symbol: 'ASIANPAINT', name: 'Asian Paints',          sector: 'Consumer' },
    { symbol: 'AXISBANK',   name: 'Axis Bank',             sector: 'Banking' },
    { symbol: 'BAJFINANCE', name: 'Bajaj Finance',         sector: 'Finance' },
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel',         sector: 'Telecom' },
    { symbol: 'HCLTECH',    name: 'HCL Technologies',      sector: 'IT' },
    { symbol: 'HDFCBANK',   name: 'HDFC Bank',             sector: 'Banking' },
    { symbol: 'HINDUNILVR', name: 'Hindustan Unilever',    sector: 'FMCG' },
    { symbol: 'ICICIBANK',  name: 'ICICI Bank',            sector: 'Banking' },
    { symbol: 'INFY',       name: 'Infosys',               sector: 'IT' },
    { symbol: 'ITC',        name: 'ITC Limited',           sector: 'FMCG' },
    { symbol: 'KOTAKBANK',  name: 'Kotak Mahindra Bank',   sector: 'Banking' },
    { symbol: 'LT',         name: 'Larsen & Toubro',       sector: 'Infrastructure' },
    { symbol: 'MARUTI',     name: 'Maruti Suzuki',         sector: 'Auto' },
    { symbol: 'RELIANCE',   name: 'Reliance Industries',   sector: 'Conglomerate' },
    { symbol: 'SBIN',       name: 'State Bank of India',   sector: 'Banking' },
    { symbol: 'SUNPHARMA',  name: 'Sun Pharma',            sector: 'Pharma' },
    { symbol: 'TCS',        name: 'Tata Consultancy Services', sector: 'IT' },
    { symbol: 'WIPRO',      name: 'Wipro',                 sector: 'IT' },
  ];

  const state = {
    intradayData: {}, // { symbol: { price, change, changePct, candles: [], vwap, ema9, ema21, orbHigh, orbLow, supertrend, rvol, signals } }
    indices: { nifty: null, banknifty: null, vix: null },
    selectedSymbol: 'TCS',
    selectedTf: '5m',
    filter: 'all',
    searchQuery: '',
    countdown: 15,
    chart: null,
    candleSeries: null,
    vwapSeries: null,
    alertCount: 0,
  };

  // ── Helper Math Functions ─────────────────────────────────
  function formatINR(val) {
    if (val == null || isNaN(val)) return '—';
    if (val >= 10000) return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '₹' + val.toFixed(2);
  }

  function formatPct(val) {
    if (val == null || isNaN(val)) return '—';
    const sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(2) + '%';
  }

  function getISTTime() {
    return new Date().toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });
  }

  // ── Calculate EMA ─────────────────────────────────────────
  function calculateEMA(closes, period) {
    if (closes.length < period) return closes[closes.length - 1] || 0;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
  }

  // ── Calculate VWAP ─────────────────────────────────────────
  function calculateVWAP(candles) {
    let cumVol = 0;
    let cumPriceVol = 0;
    const vwapPoints = [];

    for (const c of candles) {
      const typicalPrice = (c.high + c.low + c.close) / 3;
      cumVol += c.volume || 1;
      cumPriceVol += typicalPrice * (c.volume || 1);
      const curVwap = cumPriceVol / (cumVol || 1);
      vwapPoints.push({ time: c.time, value: curVwap });
    }
    return {
      currentVwap: vwapPoints.length > 0 ? vwapPoints[vwapPoints.length - 1].value : 0,
      series: vwapPoints
    };
  }

  // ── Calculate SuperTrend (10, 3) ───────────────────────────
  function calculateSuperTrend(candles, period = 10, multiplier = 3) {
    if (candles.length < period + 1) return { direction: 'BULLISH', value: 0 };
    
    // ATR calculation
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      const h = candles[i].high;
      const l = candles[i].low;
      const prevC = candles[i - 1].close;
      const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
      trs.push(tr);
    }

    const atr = trs.slice(-period).reduce((a, b) => a + b, 0) / period;
    const last = candles[candles.length - 1];
    const hl2 = (last.high + last.low) / 2;
    const basicUpper = hl2 + (multiplier * atr);
    const basicLower = hl2 - (multiplier * atr);

    const isBullish = last.close > basicLower;
    return {
      direction: isBullish ? 'BULLISH' : 'BEARISH',
      value: isBullish ? basicLower : basicUpper,
      atr: atr
    };
  }

  // ── Opening Range Breakout (ORB 15M) ──────────────────────
  function calculateORB(candles) {
    // Take first 3 candles (each 5 min = 15 min ORB)
    const orbCandles = candles.slice(0, 3);
    if (orbCandles.length === 0) return { high: 0, low: 0 };
    let high = Math.max(...orbCandles.map(c => c.high));
    let low = Math.min(...orbCandles.map(c => c.low));
    return { high, low };
  }

  // ── Fetch Intraday Candlestick Data ────────────────────────
  async function fetchIntradayCandles(symbol, range = '5d', interval = '5m') {
    const url = `/api/stock?symbol=${encodeURIComponent(symbol + '.NS')}&range=${range}&interval=${interval}`;
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return null;
      const data = await resp.json();
      const res = data?.chart?.result?.[0];
      if (!res) return null;

      const q = res.indicators.quote[0];
      const ts = res.timestamp || [];
      const candles = [];

      for (let i = 0; i < ts.length; i++) {
        if (q.close[i] == null || q.open[i] == null) continue;
        candles.push({
          time: ts[i], // UNIX timestamp in seconds
          open: +q.open[i].toFixed(2),
          high: +q.high[i].toFixed(2),
          low: +q.low[i].toFixed(2),
          close: +q.close[i].toFixed(2),
          volume: q.volume[i] || 0,
        });
      }
      return candles;
    } catch (e) {
      console.warn(`[WARN] Failed to fetch intraday for ${symbol}:`, e);
      return null;
    }
  }

  // ── Process Intraday Signals for a Stock ───────────────────
  function analyzeIntradayStock(symbol, candles) {
    if (!candles || candles.length < 5) return null;

    const closes = candles.map(c => c.close);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const currentPrice = last.close;
    const prevClose = candles[0].open; // Day open or start
    const change = currentPrice - prevClose;
    const changePct = (change / prevClose) * 100;

    // Technical calculations
    const vwapObj = calculateVWAP(candles);
    const vwap = vwapObj.currentVwap;
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const supertrend = calculateSuperTrend(candles, 10, 3);
    const orb = calculateORB(candles);

    // Relative Volume (current 5m volume vs average 5m volume)
    const recentVolumes = candles.slice(-10).map(c => c.volume);
    const avgVol = recentVolumes.reduce((a, b) => a + b, 0) / (recentVolumes.length || 1);
    const rvol = avgVol > 0 ? (last.volume / avgVol) : 1.0;

    // Signal Synthesis
    let signal = 'WAIT';
    let strategy = 'Consolidation / Chop';
    let badgeClass = 'wait';
    let score = 50;

    const aboveVwap = currentPrice > vwap;
    const bullishEma = ema9 > ema21;
    const supertrendBull = supertrend.direction === 'BULLISH';
    const orbBreakout = orb.high > 0 && currentPrice > orb.high;
    const orbBreakdown = orb.low > 0 && currentPrice < orb.low;

    if (aboveVwap && bullishEma && supertrendBull && (rvol > 1.1 || orbBreakout)) {
      if (orbBreakout) {
        signal = 'ORB BREAKOUT';
        strategy = '15M Opening Range Breakout';
        badgeClass = 'breakout';
        score = 92;
      } else {
        signal = 'SCALP BUY';
        strategy = '9/21 EMA + VWAP Momentum Scalp';
        badgeClass = 'buy';
        score = 85;
      }
    } else if (!aboveVwap && !bullishEma && !supertrendBull && (rvol > 1.1 || orbBreakdown)) {
      if (orbBreakdown) {
        signal = 'ORB BREAKDOWN';
        strategy = '15M Opening Range Breakdown';
        badgeClass = 'sell';
        score = 88;
      } else {
        signal = 'SCALP SHORT';
        strategy = 'VWAP Rejection & 9 EMA Short';
        badgeClass = 'sell';
        score = 82;
      }
    } else if (aboveVwap && currentPrice > ema9) {
      signal = 'PULLBACK BUY';
      strategy = 'VWAP Support Bounce';
      badgeClass = 'buy';
      score = 72;
    } else {
      signal = 'WAIT / CHOP';
      strategy = 'Rangebound — Awaiting Breakout';
      badgeClass = 'wait';
      score = 48;
    }

    // Strict Short-Term Risk & Targets (Tighter than swing!)
    // Stop Loss: 0.4% to 0.6%
    // Target 1: 0.8% to 1.2%
    // Target 2: 1.8% to 2.4%
    const riskPct = 0.005; // 0.5% risk
    const rewardT1Pct = 0.010; // 1.0% reward (1:2 RR)
    const rewardT2Pct = 0.020; // 2.0% reward (1:4 RR)

    let entryMin, entryMax, sl, t1, t2, rr, trailingSL;

    if (signal.includes('BUY') || signal.includes('BREAKOUT')) {
      entryMin = +(currentPrice * 0.998).toFixed(2);
      entryMax = +(currentPrice * 1.002).toFixed(2);
      sl = +(currentPrice * (1 - riskPct)).toFixed(2);
      t1 = +(currentPrice * (1 + rewardT1Pct)).toFixed(2);
      t2 = +(currentPrice * (1 + rewardT2Pct)).toFixed(2);
      trailingSL = +(currentPrice * 1.002).toFixed(2); // Breakeven + small buffer
      rr = '1:2.0';
    } else if (signal.includes('SHORT') || signal.includes('BREAKDOWN')) {
      entryMin = +(currentPrice * 1.002).toFixed(2);
      entryMax = +(currentPrice * 0.998).toFixed(2);
      sl = +(currentPrice * (1 + riskPct)).toFixed(2);
      t1 = +(currentPrice * (1 - rewardT1Pct)).toFixed(2);
      t2 = +(currentPrice * (1 - rewardT2Pct)).toFixed(2);
      trailingSL = +(currentPrice * 0.998).toFixed(2);
      rr = '1:2.0';
    } else {
      entryMin = +(currentPrice * 0.999).toFixed(2);
      entryMax = +(currentPrice * 1.001).toFixed(2);
      sl = +(currentPrice * 0.995).toFixed(2);
      t1 = +(currentPrice * 1.008).toFixed(2);
      t2 = +(currentPrice * 1.015).toFixed(2);
      trailingSL = sl;
      rr = '1:1.6';
    }

    return {
      price: currentPrice,
      change: change,
      changePct: changePct,
      candles: candles,
      vwap: vwap,
      vwapSeries: vwapObj.series,
      ema9: ema9,
      ema21: ema21,
      supertrend: supertrend,
      orb: orb,
      rvol: rvol,
      signal: signal,
      strategy: strategy,
      badgeClass: badgeClass,
      score: score,
      entryMin: entryMin,
      entryMax: entryMax,
      sl: sl,
      t1: t1,
      t2: t2,
      rr: rr,
      trailingSL: trailingSL,
    };
  }

  // ── Render Stock Card ─────────────────────────────────────
  function renderScalpCard(stock, data) {
    const isUp = data ? data.change >= 0 : true;
    const priceStr = data ? formatINR(data.price) : '—';
    const chgStr = data ? `${isUp ? '+' : ''}${data.change.toFixed(2)} (${formatPct(data.changePct)})` : '—';
    const signal = data ? data.signal : 'ANALYZING...';
    const badgeClass = data ? data.badgeClass : 'wait';
    
    const vwapText = data ? (data.price >= data.vwap ? 'Above VWAP' : 'Below VWAP') : '—';
    const vwapClass = data ? (data.price >= data.vwap ? 'bullish' : 'bearish') : 'neutral';
    
    const emaText = data ? (data.ema9 >= data.ema21 ? '9 > 21 Bull' : '9 < 21 Bear') : '—';
    const emaClass = data ? (data.ema9 >= data.ema21 ? 'bullish' : 'bearish') : 'neutral';

    const stText = data ? data.supertrend.direction : '—';
    const stClass = data ? (data.supertrend.direction === 'BULLISH' ? 'bullish' : 'bearish') : 'neutral';

    const t1Str = data ? formatINR(data.t1) : '—';
    const slStr = data ? formatINR(data.sl) : '—';
    const rrStr = data ? data.rr : '1:2.0';

    return `
      <div class="scalp-card ${state.selectedSymbol === stock.symbol ? 'selected' : ''}" id="card-${stock.symbol}" onclick="selectIntradayStock('${stock.symbol}')">
        <div class="scalp-card-top">
          <div class="symbol-name-group">
            <span class="scalp-symbol">${stock.symbol}</span>
            <span class="scalp-company">${stock.name}</span>
          </div>
          <span class="scalp-badge ${badgeClass}">${signal}</span>
        </div>

        <div class="scalp-price-row">
          <span class="scalp-price">${priceStr}</span>
          <span class="scalp-chg ${isUp ? 'up' : 'down'}">${chgStr}</span>
        </div>

        <div class="intraday-matrix">
          <div class="matrix-item">
            <span class="matrix-lbl">VWAP</span>
            <span class="matrix-val ${vwapClass}">${vwapText}</span>
          </div>
          <div class="matrix-item">
            <span class="matrix-lbl">EMA 9/21</span>
            <span class="matrix-val ${emaClass}">${emaText}</span>
          </div>
          <div class="matrix-item">
            <span class="matrix-lbl">SuperTrend</span>
            <span class="matrix-val ${stClass}">${stText}</span>
          </div>
        </div>

        <div class="scalp-targets-row">
          <div class="target-col t1">
            <span class="lbl">T1 Scalp</span>
            <strong>${t1Str}</strong>
          </div>
          <div class="target-col sl">
            <span class="lbl">Strict SL</span>
            <strong>${slStr}</strong>
          </div>
          <div class="target-col rr">
            <span class="lbl">R : R</span>
            <strong>${rrStr}</strong>
          </div>
        </div>

        <div class="card-paper-actions">
          <button class="card-btn-buy" onclick="event.stopPropagation(); executeQuickCardTrade('${stock.symbol}', 'BUY')">⚡ BUY (T1)</button>
          <button class="card-btn-short" onclick="event.stopPropagation(); executeQuickCardTrade('${stock.symbol}', 'SHORT')">⚡ SHORT</button>
        </div>

        <div class="scalp-footer">
          <span>RVOL: <strong>${data ? data.rvol.toFixed(1) + 'x' : '1.0x'}</strong></span>
          <span>Score: <strong>${data ? data.score : 50}/100</strong></span>
        </div>
      </div>
    `;
  }

  // ── Render All Cards ──────────────────────────────────────
  function renderAllCards() {
    const grid = document.getElementById('scalpGrid');
    if (!grid) return;

    const q = state.searchQuery.toLowerCase();
    const filter = state.filter;

    const filtered = STOCKS.filter(stock => {
      const matchSearch = stock.symbol.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q);
      if (!matchSearch) return false;

      const data = state.intradayData[stock.symbol];
      if (!data) return true;

      if (filter === 'all') return true;
      if (filter === 'buy') return data.signal.includes('BUY');
      if (filter === 'sell') return data.signal.includes('SHORT') || data.signal.includes('BREAKDOWN');
      if (filter === 'orb') return data.signal.includes('ORB');
      if (filter === 'vwap') return data.price >= data.vwap;
      return true;
    });

    grid.innerHTML = filtered.map(s => renderScalpCard(s, state.intradayData[s.symbol])).join('');
  }

  // ── Select and Load Stock in Terminal ─────────────────────
  window.selectIntradayStock = function(symbol) {
    state.selectedSymbol = symbol;
    const stock = STOCKS.find(s => s.symbol === symbol);
    const data = state.intradayData[symbol];
    if (!stock || !data) return;

    // Highlight card
    document.querySelectorAll('.scalp-card').forEach(c => c.classList.remove('selected'));
    const card = document.getElementById(`card-${symbol}`);
    if (card) card.classList.add('selected');

    // Update Terminal Header
    document.getElementById('termSymbol').textContent = stock.symbol;
    document.getElementById('termName').textContent = stock.name;
    document.getElementById('termPrice').textContent = formatINR(data.price);
    
    const chgEl = document.getElementById('termChange');
    const isUp = data.change >= 0;
    chgEl.textContent = `${isUp ? '+' : ''}${data.change.toFixed(2)} (${formatPct(data.changePct)})`;
    chgEl.className = `terminal-chg ${isUp ? 'up' : 'down'}`;

    // Update Trade Ticket
    document.getElementById('ticketStrategy').textContent = `⚡ ${data.strategy}`;
    const badge = document.getElementById('ticketBadge');
    badge.textContent = data.signal;
    badge.className = `ticket-signal-badge scalp-badge ${data.badgeClass}`;

    document.getElementById('ticketEntry').textContent = `₹${data.entryMin} - ₹${data.entryMax}`;
    document.getElementById('ticketSL').textContent = `₹${data.sl}`;
    document.getElementById('ticketT1').textContent = `₹${data.t1}`;
    document.getElementById('ticketT2').textContent = `₹${data.t2}`;
    document.getElementById('ticketRR').textContent = data.rr;
    document.getElementById('ticketTrailingSL').textContent = `₹${data.trailingSL}`;

    // Update 1-Click Execution Button Subtitles
    const buySub = document.getElementById('intradayBuySub');
    const shortSub = document.getElementById('intradayShortSub');
    if (buySub) buySub.textContent = `T1: ₹${data.t1} | SL: ₹${data.sl}`;
    if (shortSub) shortSub.textContent = `T1: ₹${data.t1} | SL: ₹${data.sl}`;

    // Technical Checklist
    const vwapPct = (((data.price - data.vwap) / data.vwap) * 100).toFixed(2);
    const vwapEl = document.getElementById('chkVWAP');
    if (data.price >= data.vwap) {
      vwapEl.textContent = `ABOVE VWAP (+${vwapPct}%)`;
      vwapEl.className = 'check-status bullish';
    } else {
      vwapEl.textContent = `BELOW VWAP (${vwapPct}%)`;
      vwapEl.className = 'check-status bearish';
    }

    const emaEl = document.getElementById('chkEMA');
    if (data.ema9 >= data.ema21) {
      emaEl.textContent = 'BULLISH (9 > 21 EMA)';
      emaEl.className = 'check-status bullish';
    } else {
      emaEl.textContent = 'BEARISH (9 < 21 EMA)';
      emaEl.className = 'check-status bearish';
    }

    const stEl = document.getElementById('chkSuperTrend');
    stEl.textContent = `${data.supertrend.direction} (₹${data.supertrend.value.toFixed(2)})`;
    stEl.className = `check-status ${data.supertrend.direction === 'BULLISH' ? 'bullish' : 'bearish'}`;

    const orbEl = document.getElementById('chkORB');
    if (data.price > data.orb.high && data.orb.high > 0) {
      orbEl.textContent = `BREAKOUT ABOVE HIGH (₹${data.orb.high.toFixed(2)})`;
      orbEl.className = 'check-status bullish';
    } else if (data.price < data.orb.low && data.orb.low > 0) {
      orbEl.textContent = `BREAKDOWN BELOW LOW (₹${data.orb.low.toFixed(2)})`;
      orbEl.className = 'check-status bearish';
    } else {
      orbEl.textContent = `INSIDE RANGE (₹${data.orb.low} - ₹${data.orb.high})`;
      orbEl.className = 'check-status neutral';
    }

    const rvolEl = document.getElementById('chkRVOL');
    rvolEl.textContent = `${data.rvol.toFixed(2)}x ${data.rvol > 1.2 ? '(SURGE)' : '(NORMAL)'}`;
    rvolEl.className = `check-status ${data.rvol > 1.2 ? 'bullish' : 'neutral'}`;

    // Update Chart
    updateIntradayChart(data.candles, data.vwapSeries);
  };

  // ── TradingView Chart for Intraday ────────────────────────
  function initIntradayChart() {
    const container = document.getElementById('intradayChart');
    if (!container) return;
    container.innerHTML = '';

    state.chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 250,
      layout: {
        background: { color: '#090D16' },
        textColor: '#94A3B8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    state.candleSeries = state.chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#F43F5E',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#F43F5E',
    });

    // VWAP Line (Cyan)
    state.vwapSeries = state.chart.addLineSeries({
      color: '#06B6D4',
      lineWidth: 2,
      lineStyle: LightweightCharts.LineStyle.Solid,
      title: 'VWAP',
    });

    window.addEventListener('resize', () => {
      if (state.chart && container) {
        state.chart.applyOptions({ width: container.clientWidth });
      }
    });
  }

  function updateIntradayChart(candles, vwapPoints) {
    if (!state.candleSeries || !candles || candles.length === 0) return;
    
    // Sort candles chronologically
    const sorted = [...candles].sort((a, b) => a.time - b.time);
    state.candleSeries.setData(sorted);

    if (state.vwapSeries && vwapPoints && vwapPoints.length > 0) {
      const sortedVwap = [...vwapPoints].sort((a, b) => a.time - b.time);
      state.vwapSeries.setData(sortedVwap);
    }

    state.chart.timeScale().fitContent();
  }

  // ── Fetch Market Indices ──────────────────────────────────
  async function loadMarketIndices() {
    const list = [
      { key: 'nifty', sym: '^NSEI' },
      { key: 'banknifty', sym: '^NSEBANK' },
      { key: 'vix', sym: '^INDIAVIX' },
    ];

    for (const item of list) {
      try {
        const resp = await fetch(`/api/stock?symbol=${encodeURIComponent(item.sym)}&range=1d&interval=5m`);
        if (!resp.ok) continue;
        const data = await resp.json();
        const res = data?.chart?.result?.[0];
        if (res) {
          const q = res.indicators.quote[0];
          const closes = q.close.filter(v => v != null);
          const cur = closes[closes.length - 1];
          const prev = res.meta?.chartPreviousClose || closes[0] || cur;
          const pct = ((cur - prev) / prev) * 100;

          const priceEl = document.getElementById(`${item.key}Price`);
          const chgEl = document.getElementById(`${item.key}Change`);
          if (priceEl && chgEl) {
            priceEl.textContent = cur.toFixed(2);
            chgEl.textContent = formatPct(pct);
            chgEl.className = `ticker-chg ${pct >= 0 ? 'up' : 'down'}`;
          }
        }
      } catch (e) {}
    }
  }

  // ── Main Scan Loop ────────────────────────────────────────
  async function runIntradayScan() {
    const alertMsgEl = document.getElementById('alertStreamMsg');
    if (alertMsgEl) alertMsgEl.textContent = `⚡ Scanning 19 NSE stocks on 5-minute candles (${getISTTime()})...`;

    const batchSize = 4;
    for (let i = 0; i < STOCKS.length; i += batchSize) {
      const batch = STOCKS.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(async stock => {
        const candles = await fetchIntradayCandles(stock.symbol, '5d', state.selectedTf);
        if (candles && candles.length > 0) {
          const analysis = analyzeIntradayStock(stock.symbol, candles);
          if (analysis) {
            state.intradayData[stock.symbol] = analysis;
            // If high conviction breakout, push to alert ticker
            if (analysis.score >= 85 && alertMsgEl) {
              alertMsgEl.innerHTML = `<span style="color:#10B981;font-weight:700;">[HIGH CONVICTION ALERT]</span> <strong>${stock.symbol}</strong> triggered <strong>${analysis.signal}</strong> at ₹${analysis.price} | T1: ₹${analysis.t1} (R:R: ${analysis.rr})`;
            }
          }
        }
      }));
    }

    // Feed real-time live prices to Paper Trading Engine
    if (window.PaperTrading) {
      const priceMap = {};
      Object.keys(state.intradayData).forEach(sym => {
        if (state.intradayData[sym] && state.intradayData[sym].price) {
          priceMap[sym] = state.intradayData[sym].price;
        }
      });
      window.PaperTrading.updateLivePrices(priceMap);
    }

    renderAllCards();
    if (state.selectedSymbol) {
      selectIntradayStock(state.selectedSymbol);
    }
  }

  // ── Setup Timer & Countdown ───────────────────────────────
  function startCountdown() {
    setInterval(() => {
      state.countdown--;
      const el = document.getElementById('countdownSec');
      if (el) el.textContent = `${state.countdown}s`;

      const clockEl = document.getElementById('marketClock');
      if (clockEl) clockEl.textContent = getISTTime();

      if (state.countdown <= 0) {
        state.countdown = 15;
        runIntradayScan();
      }
    }, 1000);
  }

  // ── Bind UI Events ────────────────────────────────────────
  function bindUI() {
    // Search
    const searchInput = document.getElementById('scalpSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderAllCards();
      });
    }

    // Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filter = btn.dataset.filter;
        renderAllCards();
      });
    });

    // Timeframe selector
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedTf = btn.dataset.tf;
        
        // Refresh selected stock with new timeframe
        if (state.selectedSymbol) {
          const candles = await fetchIntradayCandles(state.selectedSymbol, '5d', state.selectedTf);
          if (candles) {
            const analysis = analyzeIntradayStock(state.selectedSymbol, candles);
            if (analysis) {
              state.intradayData[state.selectedSymbol] = analysis;
              selectIntradayStock(state.selectedSymbol);
            }
          }
        }
      });
    });
  }

  // ── Initialization ────────────────────────────────────────
  async function init() {
    console.log('⚡ BharatQuant Intraday Scalper AI Initializing...');
    bindUI();
    initIntradayChart();

    // Initial render of empty cards
    renderAllCards();

    // Load Indices
    loadMarketIndices();

    // Start Live Intraday Scan
    await runIntradayScan();

    // Start 15-second loop
    startCountdown();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Global Handlers for HTML OnClick ──────────────────────
  window.executeCurrentPaperTrade = function(side) {
    if (!window.PaperTrading) {
      alert('Paper Trading Engine is initializing, please wait 1 second.');
      return;
    }
    const sym = state.selectedSymbol || 'TCS';
    const data = state.intradayData[sym];
    const price = data && data.price ? data.price : 2105.00;
    const sl = data && data.sl ? data.sl : (side === 'BUY' ? +(price * 0.995).toFixed(2) : +(price * 1.005).toFixed(2));
    const t1 = data && data.t1 ? data.t1 : (side === 'BUY' ? +(price * 1.01).toFixed(2) : +(price * 0.99).toFixed(2));
    const t2 = data && data.t2 ? data.t2 : (side === 'BUY' ? +(price * 1.02).toFixed(2) : +(price * 0.98).toFixed(2));

    window.PaperTrading.openPosition(
      sym,
      side,
      price,
      sl,
      t1,
      t2
    );
  };

  window.executeQuickCardTrade = function(sym, side) {
    if (!window.PaperTrading) return;
    const data = state.intradayData[sym];
    const price = data && data.price ? data.price : 1000;
    const sl = data && data.sl ? data.sl : (side === 'BUY' ? +(price * 0.995).toFixed(2) : +(price * 1.005).toFixed(2));
    const t1 = data && data.t1 ? data.t1 : (side === 'BUY' ? +(price * 1.01).toFixed(2) : +(price * 0.99).toFixed(2));
    const t2 = data && data.t2 ? data.t2 : (side === 'BUY' ? +(price * 1.02).toFixed(2) : +(price * 0.98).toFixed(2));

    window.PaperTrading.openPosition(
      sym,
      side,
      price,
      sl,
      t1,
      t2
    );
  };

  window.switchPaperTab = function(tabName) {
    document.querySelectorAll('.paper-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.paper-tab-content').forEach(c => c.classList.remove('active'));
    
    if (tabName === 'open') {
      const btn = document.querySelector('.paper-tab-btn:nth-child(1)');
      if (btn) btn.classList.add('active');
      const tab = document.getElementById('tabOpenPositions');
      if (tab) tab.classList.add('active');
    } else {
      const btn = document.querySelector('.paper-tab-btn:nth-child(2)');
      if (btn) btn.classList.add('active');
      const tab = document.getElementById('tabTradeHistory');
      if (tab) tab.classList.add('active');
    }
  };

})();
