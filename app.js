// ============================================================
// BharatQuant — AI Stock Prediction Dashboard
// Complete client-side application with XGBoost inference,
// real-time price tracking, and TradingView charts
// ============================================================

(() => {
  'use strict';

  // ── Stock Configuration ──────────────────────────────────
  const STOCKS = [
    { symbol: 'ADANIENT',   name: 'Adani Enterprises',     sector: 'Conglomerate', seedPrice: 3200 },
    { symbol: 'ASIANPAINT', name: 'Asian Paints',          sector: 'Consumer',     seedPrice: 2400 },
    { symbol: 'AXISBANK',   name: 'Axis Bank',             sector: 'Banking',      seedPrice: 1100 },
    { symbol: 'BAJFINANCE', name: 'Bajaj Finance',         sector: 'Finance',      seedPrice: 6800 },
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel',         sector: 'Telecom',      seedPrice: 1600 },
    { symbol: 'HCLTECH',    name: 'HCL Technologies',      sector: 'IT',           seedPrice: 1600 },
    { symbol: 'HDFCBANK',   name: 'HDFC Bank',             sector: 'Banking',      seedPrice: 1700 },
    { symbol: 'HINDUNILVR', name: 'Hindustan Unilever',    sector: 'FMCG',         seedPrice: 2400 },
    { symbol: 'ICICIBANK',  name: 'ICICI Bank',            sector: 'Banking',      seedPrice: 1200 },
    { symbol: 'INFY',       name: 'Infosys',               sector: 'IT',           seedPrice: 1500 },
    { symbol: 'ITC',        name: 'ITC Limited',           sector: 'FMCG',         seedPrice: 450 },
    { symbol: 'KOTAKBANK',  name: 'Kotak Mahindra Bank',   sector: 'Banking',      seedPrice: 1800 },
    { symbol: 'LT',         name: 'Larsen & Toubro',       sector: 'Infrastructure', seedPrice: 3400 },
    { symbol: 'MARUTI',     name: 'Maruti Suzuki',         sector: 'Auto',         seedPrice: 12000 },
    { symbol: 'RELIANCE',   name: 'Reliance Industries',   sector: 'Conglomerate', seedPrice: 2900 },
    { symbol: 'SBIN',       name: 'State Bank of India',   sector: 'Banking',      seedPrice: 800 },
    { symbol: 'SUNPHARMA',  name: 'Sun Pharma',            sector: 'Pharma',       seedPrice: 1700 },
    { symbol: 'TCS',        name: 'Tata Consultancy Services', sector: 'IT',       seedPrice: 3500 },
    { symbol: 'WIPRO',      name: 'Wipro',                 sector: 'IT',           seedPrice: 450 },
  ];

  const CORS_PROXIES = [
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];

  const FEATURE_NAMES = [
    'return_1d','return_3d','return_5d','return_10d','return_20d',
    'sma_10','sma_20','sma_50','sma_100','sma_200',
    'ema_10','ema_20','ema_50',
    'rsi','macd','macd_signal','macd_hist',
    'adx','adx_pos','adx_neg',
    'bb_high','bb_low','bb_width','bb_position',
    'atr','atr_pct','roc_10','roc_20',
    'volume_change','relative_volume',
    'price_vs_sma20','price_vs_sma50','price_vs_sma200',
    'high_low_range','close_position',
    'volatility_5','volatility_20','volatility_60',
    'nifty_return_1d','nifty_return_5d','nifty_return_20d',
    'nifty_sma20','nifty_sma50','nifty_volatility','nifty_momentum',
    'banknifty_return_1d','banknifty_return_5d','banknifty_return_20d',
    'banknifty_sma20','banknifty_sma50','banknifty_volatility','banknifty_momentum',
    'indiavix_return_1d','indiavix_return_5d','indiavix_return_20d',
    'indiavix_sma20','indiavix_sma50','indiavix_volatility','indiavix_momentum',
  ];

  // ── State ────────────────────────────────────────────────
  const state = {
    stockData: {},        // { symbol: { price, prevClose, change, changePct, history, volume } }
    models: {},           // { symbol: modelJSON }
    predictions: {},      // { symbol: { signal, confidence, probability, updatedAt } }
    features: {},         // { symbol: [59 floats] }
    selectedStock: null,
    filter: 'all',
    chart: null,
    chartSeries: null,
    refreshInterval: null,
    countdownInterval: null,
    countdownSeconds: 30,
    predictionLogCount: 0,
    predLogOpen: false,
    indexData: { nifty: null, banknifty: null, vix: null },
  };

  // ── DOM References ───────────────────────────────────────
  const dom = {
    stockGrid: document.getElementById('stockGrid'),
    detailPanel: document.getElementById('detailPanel'),
    detailClose: document.getElementById('detailClose'),
    searchInput: document.getElementById('searchInput'),
    visibleCount: document.getElementById('visibleCount'),
    marketClock: document.getElementById('marketClock'),
    marketStatus: document.getElementById('marketStatus'),
    chartContainer: document.getElementById('chartContainer'),
    toast: document.getElementById('toast'),
    predLogEntries: document.getElementById('predLogEntries'),
    predLogCount: document.getElementById('predLogCount'),
    predLogBody: document.getElementById('predLogBody'),
    predLogToggle: document.getElementById('predLogToggle'),
    predLogArrow: document.getElementById('predLogArrow'),
    countdownText: document.getElementById('countdownText'),
    refreshTimer: document.getElementById('refreshTimer'),
    updateOverlay: document.getElementById('updateOverlay'),
  };

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

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

  function sigmoid(x) {
    if (x >= 0) return 1 / (1 + Math.exp(-x));
    const ex = Math.exp(x);
    return ex / (1 + ex);
  }

  function showToast(msg, duration = 3000) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('visible');
    setTimeout(() => dom.toast.classList.remove('visible'), duration);
  }

  function getISTTimeString() {
    return new Date().toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });
  }

  // ── Prediction Log ──────────────────────────────────────
  function addPredLog(symbol, signal, probability, setup) {
    const time = getISTTimeString();
    const resultClass = signal.includes('BUY') ? 'log-result-buy' : signal.includes('SELL') ? 'log-result-sell' : 'log-result-hold';
    const grade = setup?.grade ? `[${setup.grade}]` : '';
    const t1Str = setup?.t1 ? ` | T1: ₹${setup.t1.toFixed(2)}` : '';
    const slStr = setup?.sl ? ` | SL: ₹${setup.sl.toFixed(2)}` : '';
    const rrStr = setup?.rr ? ` | R:R: ${setup.rr}` : '';
    const conf = setup?.confidence || Math.min(99, Math.max(10, Math.round(Math.abs(probability - 0.5) * 200)));

    const entry = document.createElement('div');
    entry.className = 'pred-log-entry';
    entry.innerHTML = `<span class="log-time">${time}</span> result = <span class="log-fn">predict_stock</span>(<span class="log-arg">"${symbol}"</span>)  →  <span class="${resultClass}">${signal}</span> <span class="log-grade">${grade}</span> <span class="log-prob">| Conf: ${conf}%${t1Str}${slStr}${rrStr}</span>`;
    dom.predLogEntries.appendChild(entry);
    dom.predLogEntries.scrollTop = dom.predLogEntries.scrollHeight;
    state.predictionLogCount++;
    dom.predLogCount.textContent = state.predictionLogCount;
  }

  function addSystemLog(message) {
    const time = getISTTimeString();
    const entry = document.createElement('div');
    entry.className = 'pred-log-entry system';
    entry.innerHTML = `<span class="log-time">${time}</span> <span class="log-text">${message}</span>`;
    dom.predLogEntries.appendChild(entry);
    dom.predLogEntries.scrollTop = dom.predLogEntries.scrollHeight;
  }

  function isMarketOpen() {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = ist.getDay();
    const h = ist.getHours();
    const m = ist.getMinutes();
    const minutes = h * 60 + m;
    return day >= 1 && day <= 5 && minutes >= 555 && minutes <= 930; // 9:15 AM - 3:30 PM
  }

  // ============================================================
  // DATA SERVICE — Fetch prices from Yahoo Finance
  // ============================================================

  async function fetchYahoo(symbol, range = '1y', interval = '1d') {
    // 1. Try local server backend API first (No CORS issues, 100% real live market data)
    try {
      const localUrl = `/api/stock?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
      const resp = await fetch(localUrl, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const data = await resp.json();
        const res = data?.chart?.result?.[0];
        if (res && res.indicators?.quote?.[0]?.close?.length > 0) {
          return res;
        }
      }
    } catch (e) {
      console.warn('Local API fetch failed, trying fallbacks:', e);
    }

    // 2. Fallback to public CORS Proxies
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`;

    for (const proxyFn of CORS_PROXIES) {
      try {
        const resp = await fetch(proxyFn(url), { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) continue;
        const data = await resp.json();
        return data?.chart?.result?.[0] || null;
      } catch { /* try next proxy */ }
    }

    // 3. Direct attempt
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json();
        return data?.chart?.result?.[0] || null;
      }
    } catch { /* fallback */ }

    return null;
  }

  function generateSimulatedData(seedPrice, days = 250) {
    const data = { timestamps: [], close: [], open: [], high: [], low: [], volume: [] };
    let price = seedPrice;
    const now = Date.now();
    const dayMs = 86400000;
    const volatility = 0.015 + Math.random() * 0.01;

    for (let i = days; i >= 0; i--) {
      const t = Math.floor((now - i * dayMs) / 1000);
      const change = (Math.random() - 0.48) * volatility * price;
      const o = price;
      price = Math.max(price + change, price * 0.5);
      const c = price;
      const h = Math.max(o, c) * (1 + Math.random() * 0.008);
      const l = Math.min(o, c) * (1 - Math.random() * 0.008);
      const v = Math.floor(1e6 + Math.random() * 5e6);
      data.timestamps.push(t);
      data.open.push(+o.toFixed(2));
      data.close.push(+c.toFixed(2));
      data.high.push(+h.toFixed(2));
      data.low.push(+l.toFixed(2));
      data.volume.push(v);
    }
    return data;
  }

  async function loadStockData(stockConfig) {
    const { symbol, seedPrice } = stockConfig;
    const result = await fetchYahoo(`${symbol}.NS`, '1y', '1d');

    if (result) {
      const q = result.indicators.quote[0];
      const ts = result.timestamp;
      const closes = q.close.filter(v => v != null);
      const price = closes[closes.length - 1];
      const prevClose = closes.length > 1 ? closes[closes.length - 2] : price;
      state.stockData[symbol] = {
        price, prevClose,
        change: price - prevClose,
        changePct: ((price - prevClose) / prevClose) * 100,
        history: {
          timestamps: ts,
          close: q.close, open: q.open, high: q.high, low: q.low,
          volume: q.volume,
        },
        live: true,
      };
    } else {
      // Use simulated data
      const sim = generateSimulatedData(seedPrice);
      const closes = sim.close;
      const price = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      state.stockData[symbol] = {
        price, prevClose,
        change: price - prevClose,
        changePct: ((price - prevClose) / prevClose) * 100,
        history: sim,
        live: false,
      };
    }
  }

  async function loadIndexData() {
    const indices = [
      { key: 'nifty', symbol: '^NSEI', name: 'NIFTY 50' },
      { key: 'banknifty', symbol: '^NSEBANK', name: 'BANK NIFTY' },
      { key: 'vix', symbol: '^INDIAVIX', name: 'INDIA VIX' },
    ];

    for (const idx of indices) {
      const result = await fetchYahoo(idx.symbol, '3mo', '1d');
      if (result) {
        const closes = result.indicators.quote[0].close.filter(v => v != null);
        state.indexData[idx.key] = {
          close: closes,
          timestamps: result.timestamp,
          price: closes[closes.length - 1],
          prevClose: closes.length > 1 ? closes[closes.length - 2] : closes[closes.length - 1],
        };
      } else {
        // Simulated
        const base = idx.key === 'nifty' ? 24500 : idx.key === 'banknifty' ? 52000 : 13;
        const sim = generateSimulatedData(base, 60);
        state.indexData[idx.key] = {
          close: sim.close,
          timestamps: sim.timestamps,
          price: sim.close[sim.close.length - 1],
          prevClose: sim.close[sim.close.length - 2],
        };
      }
    }
  }

  // ============================================================
  // TECHNICAL INDICATORS — Calculate all 59 features
  // ============================================================

  function sma(arr, period) {
    if (arr.length < period) return NaN;
    let sum = 0;
    for (let i = arr.length - period; i < arr.length; i++) sum += arr[i];
    return sum / period;
  }

  function ema(arr, period) {
    if (arr.length < period) return NaN;
    const k = 2 / (period + 1);
    let e = sma(arr.slice(0, period), period);
    for (let i = period; i < arr.length; i++) {
      e = arr[i] * k + e * (1 - k);
    }
    return e;
  }

  function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  function calcMACD(closes) {
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macdLine = ema12 - ema26;
    // Approximate signal line
    const macdArr = [];
    const k12 = 2 / 13, k26 = 2 / 27;
    let e12 = sma(closes.slice(0, 12), 12);
    let e26 = sma(closes.slice(0, 26), 26);
    for (let i = 26; i < closes.length; i++) {
      e12 = closes[i] * k12 + e12 * (1 - k12);
      e26 = closes[i] * k26 + e26 * (1 - k26);
      macdArr.push(e12 - e26);
    }
    const signal = macdArr.length >= 9 ? ema(macdArr, 9) : macdLine;
    return { macd: macdLine, signal, hist: macdLine - signal };
  }

  function calcATR(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return 0;
    let atrSum = 0;
    const start = closes.length - period;
    for (let i = start; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      atrSum += tr;
    }
    return atrSum / period;
  }

  function calcADX(highs, lows, closes, period = 14) {
    if (closes.length < period * 2) return { adx: 25, adxPos: 25, adxNeg: 25 };
    const len = closes.length;
    const start = len - period * 2;
    let sumPDM = 0, sumNDM = 0, sumTR = 0;

    for (let i = start + 1; i <= start + period; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];
      sumPDM += (upMove > downMove && upMove > 0) ? upMove : 0;
      sumNDM += (downMove > upMove && downMove > 0) ? downMove : 0;
      sumTR += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    }

    let smoothPDM = sumPDM, smoothNDM = sumNDM, smoothTR = sumTR;
    const dxArr = [];
    for (let i = start + period + 1; i < len; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];
      smoothPDM = smoothPDM - smoothPDM / period + ((upMove > downMove && upMove > 0) ? upMove : 0);
      smoothNDM = smoothNDM - smoothNDM / period + ((downMove > upMove && downMove > 0) ? downMove : 0);
      smoothTR = smoothTR - smoothTR / period + Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
      const pdi = (smoothPDM / smoothTR) * 100;
      const ndi = (smoothNDM / smoothTR) * 100;
      const dx = Math.abs(pdi - ndi) / (pdi + ndi + 1e-10) * 100;
      dxArr.push(dx);
    }
    const adx = dxArr.length > 0 ? dxArr.reduce((a, b) => a + b, 0) / dxArr.length : 25;
    const pdi = (smoothPDM / (smoothTR + 1e-10)) * 100;
    const ndi = (smoothNDM / (smoothTR + 1e-10)) * 100;
    return { adx, adxPos: pdi, adxNeg: ndi };
  }

  function calcBollingerBands(closes, period = 20) {
    const s = sma(closes, period);
    if (isNaN(s)) return { high: 0, low: 0, width: 0, position: 0.5 };
    const slice = closes.slice(-period);
    const std = Math.sqrt(slice.reduce((sum, v) => sum + (v - s) ** 2, 0) / period);
    const upper = s + 2 * std;
    const lower = s - 2 * std;
    const price = closes[closes.length - 1];
    return {
      high: upper,
      low: lower,
      width: (upper - lower) / s,
      position: (upper - lower) > 0 ? (price - lower) / (upper - lower) : 0.5,
    };
  }

  function calcVolatility(closes, period) {
    if (closes.length < period + 1) return 0;
    const returns = [];
    for (let i = closes.length - period; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    return Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length);
  }

  function calculateFeatures(symbol) {
    const sd = state.stockData[symbol];
    if (!sd || !sd.history) return null;

    const h = sd.history;
    const closes = h.close.filter(v => v != null);
    const highs = h.high ? h.high.filter(v => v != null) : closes.map(c => c * 1.005);
    const lows = h.low ? h.low.filter(v => v != null) : closes.map(c => c * 0.995);
    const volumes = h.volume ? h.volume.filter(v => v != null) : closes.map(() => 1e6);

    if (closes.length < 60) return null;

    const price = closes[closes.length - 1];
    const len = closes.length;

    // Returns
    const ret = (n) => closes.length > n ? (closes[len - 1] / closes[len - 1 - n] - 1) : 0;

    // SMAs and EMAs
    const sma10 = sma(closes, 10);
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma100 = closes.length >= 100 ? sma(closes, 100) : sma50;
    const sma200 = closes.length >= 200 ? sma(closes, 200) : sma100;
    const ema10 = ema(closes, 10);
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);

    // RSI
    const rsi = calcRSI(closes);

    // MACD
    const macdResult = calcMACD(closes);

    // ADX
    const adxResult = calcADX(highs, lows, closes);

    // Bollinger Bands
    const bb = calcBollingerBands(closes);

    // ATR
    const atr = calcATR(highs, lows, closes);
    const atrPct = atr / price;

    // ROC
    const roc10 = ret(10);
    const roc20 = ret(20);

    // Volume
    const avgVol20 = sma(volumes, 20);
    const volChange = volumes.length > 1 ? (volumes[volumes.length - 1] / (volumes[volumes.length - 2] || 1) - 1) : 0;
    const relVol = avgVol20 > 0 ? volumes[volumes.length - 1] / avgVol20 : 1;

    // Price vs SMAs
    const priceVsSma20 = sma20 > 0 ? (price / sma20 - 1) : 0;
    const priceVsSma50 = sma50 > 0 ? (price / sma50 - 1) : 0;
    const priceVsSma200 = sma200 > 0 ? (price / sma200 - 1) : 0;

    // High-Low range and close position
    const dayHigh = highs[len - 1];
    const dayLow = lows[len - 1];
    const highLowRange = (dayHigh - dayLow) / price;
    const closePos = (dayHigh - dayLow) > 0 ? (price - dayLow) / (dayHigh - dayLow) : 0.5;

    // Volatility
    const vol5 = calcVolatility(closes, 5);
    const vol20 = calcVolatility(closes, 20);
    const vol60 = calcVolatility(closes, Math.min(60, closes.length - 1));

    // Index features
    function indexFeatures(key) {
      const idx = state.indexData[key];
      if (!idx || !idx.close || idx.close.length < 20) return [0, 0, 0, 0, 0, 0, 0];
      const ic = idx.close.filter(v => v != null);
      const iLen = ic.length;
      const iRet1 = iLen > 1 ? (ic[iLen - 1] / ic[iLen - 2] - 1) : 0;
      const iRet5 = iLen > 5 ? (ic[iLen - 1] / ic[iLen - 6] - 1) : 0;
      const iRet20 = iLen > 20 ? (ic[iLen - 1] / ic[iLen - 21] - 1) : 0;
      const iSma20 = ic.length >= 20 ? sma(ic, 20) : ic[iLen - 1];
      const iSma50 = ic.length >= 50 ? sma(ic, 50) : iSma20;
      const iVol = calcVolatility(ic, Math.min(20, iLen - 1));
      const iMom = iLen > 10 ? (ic[iLen - 1] / ic[iLen - 11] - 1) : 0;
      return [iRet1, iRet5, iRet20, iSma20, iSma50, iVol, iMom];
    }

    const niftyF = indexFeatures('nifty');
    const bniftyF = indexFeatures('banknifty');
    const vixF = indexFeatures('vix');

    const features = [
      ret(1), ret(3), ret(5), ret(10), ret(20),
      sma10, sma20, sma50, sma100, sma200,
      ema10, ema20, ema50,
      rsi,
      macdResult.macd, macdResult.signal, macdResult.hist,
      adxResult.adx, adxResult.adxPos, adxResult.adxNeg,
      bb.high, bb.low, bb.width, bb.position,
      atr, atrPct, roc10, roc20,
      volChange, relVol,
      priceVsSma20, priceVsSma50, priceVsSma200,
      highLowRange, closePos,
      vol5, vol20, vol60,
      ...niftyF, ...bniftyF, ...vixF,
    ];

    // Replace NaN with 0
    const cleaned = features.map(v => (isNaN(v) || v == null) ? 0 : v);
    state.features[symbol] = cleaned;
    return cleaned;
  }

  // ============================================================
  // XGBOOST INFERENCE ENGINE
  // ============================================================

  async function loadModel(symbol) {
    if (state.models[symbol]) return state.models[symbol];

    try {
      const resp = await fetch(`bharatquant_models/${symbol}.json`);
      if (!resp.ok) throw new Error(`Model load failed: ${resp.status}`);
      const model = await resp.json();
      state.models[symbol] = model;
      return model;
    } catch (err) {
      console.error(`Failed to load model for ${symbol}:`, err);
      return null;
    }
  }

  function traverseTree(tree, features) {
    let nodeIdx = 0;
    const leftChildren = tree.left_children;
    const rightChildren = tree.right_children;
    const splitIndices = tree.split_indices;
    const splitConditions = tree.split_conditions;

    // Traverse until leaf (left_children[nodeIdx] === -1)
    while (leftChildren[nodeIdx] !== -1) {
      const featureIdx = splitIndices[nodeIdx];
      const threshold = splitConditions[nodeIdx];
      const featureVal = features[featureIdx] || 0;

      if (featureVal < threshold) {
        nodeIdx = leftChildren[nodeIdx];
      } else {
        nodeIdx = rightChildren[nodeIdx];
      }
    }

    // Leaf value is in base_weights for leaf nodes
    return tree.base_weights[nodeIdx];
  }

  function predictXGBoost(model, features) {
    const trees = model.learner.gradient_booster.model.trees;
    let sumLeafValues = 0;

    for (const tree of trees) {
      sumLeafValues += traverseTree(tree, features);
    }

    // binary:logistic — base_score is already factored into tree training
    // The sum of tree outputs is in logit space, apply sigmoid
    const probability = sigmoid(sumLeafValues);
    return probability;
  }

  function getFeatureImportance(model) {
    const trees = model.learner.gradient_booster.model.trees;
    const importance = new Float64Array(59);

    for (const tree of trees) {
      for (let i = 0; i < tree.left_children.length; i++) {
        if (tree.left_children[i] !== -1) { // internal node
          const featIdx = tree.split_indices[i];
          const gain = tree.loss_changes[i] || 0;
          if (featIdx < 59) importance[featIdx] += gain;
        }
      }
    }

    // Normalize
    const maxImp = Math.max(...importance) || 1;
    const featureList = [];
    for (let i = 0; i < 59; i++) {
      featureList.push({ name: FEATURE_NAMES[i], importance: importance[i] / maxImp });
    }
    featureList.sort((a, b) => b.importance - a.importance);
    return featureList;
  }

  // ── Quantum AI Confluence & Trade Setup Engine ─────────────
  function calculateAdvancedConfluenceAndTradeSetup(symbol, aiProb) {
    const sd = state.stockData[symbol];
    if (!sd) return { signal: 'HOLD', grade: 'B', gradeClass: 'grade-b', confidence: 50, probability: aiProb, sl: 0, t1: 0, t2: 0, rr: '1:2.0' };
    const price = sd.price;
    const features = state.features[symbol];

    let rsi = 50, macd = 0, macdSignal = 0, adx = 25, atr = price * 0.018;
    let sma20 = price, sma50 = price, sma200 = price, ema20 = price;
    let relVol = 1.0;

    if (features && features.length >= 50) {
      sma20 = features[6] || price;
      sma50 = features[7] || price;
      sma200 = features[9] || price;
      ema20 = features[11] || price;
      rsi = features[13] || 50;
      macd = features[14] || 0;
      macdSignal = features[15] || 0;
      adx = features[17] || 25;
      atr = features[24] || (price * 0.018);
      relVol = features[29] || 1.0;
    }

    // 1. Trend Factor (0 to 100)
    let trendScore = 50;
    if (price > ema20) trendScore += 20; else trendScore -= 20;
    if (price > sma50) trendScore += 15; else trendScore -= 15;
    if (price > sma200) trendScore += 15; else trendScore -= 15;
    trendScore = Math.max(0, Math.min(100, trendScore));

    // 2. Momentum Factor (0 to 100)
    let momentumScore = 50;
    if (rsi >= 45 && rsi <= 68) momentumScore += 20; // healthy bullish expansion
    else if (rsi > 68 && rsi <= 76) momentumScore += 10;
    else if (rsi > 76) momentumScore -= 15; // overbought risk
    else if (rsi < 35) momentumScore += 15; // oversold bounce candidate
    else if (rsi < 45) momentumScore -= 15;

    if (macd > macdSignal) momentumScore += 20; else momentumScore -= 20;
    if (adx > 25) momentumScore += 10;
    momentumScore = Math.max(0, Math.min(100, momentumScore));

    // 3. Institutional Volume Factor (0 to 100)
    let volumeScore = 50;
    if (relVol > 1.3) volumeScore += 30;
    else if (relVol > 1.0) volumeScore += 15;
    else volumeScore -= 15;
    if (sd.change >= 0 && relVol > 1.05) volumeScore += 20;
    volumeScore = Math.max(0, Math.min(100, volumeScore));

    // 4. Market Regime Modifier (Nifty & India VIX)
    let regimeModifier = 0;
    let regimeStatus = 'BULLISH CALM';
    const vix = state.indexData.vix?.price || 14;
    const nifty = state.indexData.nifty?.price || 24000;
    const niftyPrev = state.indexData.nifty?.prevClose || 24000;

    if (vix > 16.5) {
      regimeModifier -= 12;
      regimeStatus = 'HIGH VOLATILITY (RISK OFF)';
    } else if (vix < 13.5) {
      regimeModifier += 8;
      regimeStatus = 'BULLISH CALM (ACCUMULATE)';
    }

    if (nifty >= niftyPrev) {
      regimeModifier += 5;
    } else {
      regimeModifier -= 8;
    }

    // Combined Weighted Confluence
    const aiWeight = aiProb * 100;
    let totalConfluence = (aiWeight * 0.40) + (trendScore * 0.25) + (momentumScore * 0.20) + (volumeScore * 0.15) + regimeModifier;
    totalConfluence = Math.max(8, Math.min(98, Math.round(totalConfluence)));

    // Signal & Grade Classification
    let signal = 'HOLD';
    let grade = 'Grade B';
    let gradeClass = 'grade-b';
    let actionPlan = 'Consolidation — Monitor Breakout';

    if (totalConfluence >= 75 && aiProb >= 0.55) {
      signal = 'STRONG BUY';
      grade = 'Grade A+';
      gradeClass = 'grade-aplus';
      actionPlan = 'Institutional Momentum Breakout';
    } else if (totalConfluence >= 62 && aiProb >= 0.50) {
      signal = 'BUY';
      grade = 'Grade A';
      gradeClass = 'grade-a';
      actionPlan = 'Bullish Trend Follower';
    } else if (totalConfluence >= 52 && trendScore >= 55) {
      signal = 'ACCUMULATE';
      grade = 'Grade B+';
      gradeClass = 'grade-bplus';
      actionPlan = 'Buy on Dip / Pullback to Support';
    } else if (totalConfluence <= 28 && aiProb <= 0.45) {
      signal = 'STRONG SELL';
      grade = 'Grade A+';
      gradeClass = 'grade-aplus-sell';
      actionPlan = 'Institutional Breakdown / Exit';
    } else if (totalConfluence <= 38 && aiProb <= 0.49) {
      signal = 'SELL';
      grade = 'Grade A';
      gradeClass = 'grade-a-sell';
      actionPlan = 'Bearish Distribution Pattern';
    } else {
      signal = 'HOLD';
      grade = 'Grade B';
      gradeClass = 'grade-b';
      actionPlan = 'Neutral / Sideways Chop';
    }

    // Dynamic Stop Loss & Targets based on ATR
    const safeAtr = Math.max(price * 0.012, Math.min(price * 0.045, atr));
    let sl = 0, t1 = 0, t2 = 0, rr = '1:2.2';
    let entryMin = +(price * 0.996).toFixed(2);
    let entryMax = +(price * 1.003).toFixed(2);

    if (signal.includes('BUY') || signal === 'ACCUMULATE') {
      sl = +(price - (safeAtr * 1.5)).toFixed(2);
      t1 = +(price + (safeAtr * 2.2)).toFixed(2);
      t2 = +(price + (safeAtr * 3.8)).toFixed(2);
      const risk = price - sl;
      const reward = t1 - price;
      rr = risk > 0 ? `1:${(reward / risk).toFixed(1)}` : '1:2.2';
    } else if (signal.includes('SELL')) {
      sl = +(price + (safeAtr * 1.5)).toFixed(2);
      t1 = +(price - (safeAtr * 2.2)).toFixed(2);
      t2 = +(price - (safeAtr * 3.8)).toFixed(2);
      const risk = sl - price;
      const reward = price - t1;
      rr = risk > 0 ? `1:${(reward / risk).toFixed(1)}` : '1:2.2';
    } else {
      sl = +(price * 0.985).toFixed(2);
      t1 = +(price * 1.025).toFixed(2);
      t2 = +(price * 1.045).toFixed(2);
      rr = '1:1.7';
    }

    return {
      signal,
      grade,
      gradeClass,
      actionPlan,
      confluenceScore: totalConfluence,
      confidence: totalConfluence,
      probability: aiProb,
      sl,
      t1,
      t2,
      rr,
      entryMin,
      entryMax,
      factors: {
        aiScore: Math.round(aiProb * 100),
        trendScore,
        momentumScore,
        volumeScore,
        regimeStatus
      }
    };
  }

  async function runPrediction(symbol) {
    const features = calculateFeatures(symbol);
    if (!features) {
      state.predictions[symbol] = { signal: 'HOLD', confidence: 50, probability: 0.5, grade: 'Grade B', gradeClass: 'grade-b' };
      return;
    }

    const model = await loadModel(symbol);
    if (!model) {
      state.predictions[symbol] = { signal: 'HOLD', confidence: 50, probability: 0.5, grade: 'Grade B', gradeClass: 'grade-b' };
      return;
    }

    const prob = predictXGBoost(model, features);
    const setup = calculateAdvancedConfluenceAndTradeSetup(symbol, prob);

    state.predictions[symbol] = {
      ...setup,
      updatedAt: getISTTimeString()
    };

    // Log to prediction console with trade targets
    addPredLog(symbol, setup.signal, prob, setup);
  }

  // ============================================================
  // CHART SERVICE — TradingView Lightweight Charts
  // ============================================================

  function initChart() {
    if (state.chart) {
      state.chart.remove();
      state.chart = null;
    }

    state.chart = LightweightCharts.createChart(dom.chartContainer, {
      width: dom.chartContainer.clientWidth,
      height: 300,
      layout: {
        background: { color: '#0E1223' },
        textColor: '#94A3B8',
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.5)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.5)' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#3B82F6' },
        horzLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#3B82F6' },
      },
      timeScale: {
        borderColor: '#1E293B',
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      handleScroll: { vertTouchDrag: false },
    });

    state.chartSeries = state.chart.addCandlestickSeries({
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderUpColor: '#22C55E',
      borderDownColor: '#EF4444',
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
    });

    // Resize handler
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (state.chart) {
          state.chart.applyOptions({ width: entry.contentRect.width });
        }
      }
    });
    resizeObserver.observe(dom.chartContainer);
  }

  function updateChart(symbol, range = '1mo') {
    const sd = state.stockData[symbol];
    if (!sd || !sd.history || !state.chart) return;

    const h = sd.history;
    const candleData = [];
    const len = Math.min(h.timestamps.length, h.close.length, h.open.length, h.high.length, h.low.length);

    // Determine slice based on range
    let sliceStart = 0;
    const totalDays = len;
    switch (range) {
      case '5d': sliceStart = Math.max(0, totalDays - 5); break;
      case '1mo': sliceStart = Math.max(0, totalDays - 22); break;
      case '3mo': sliceStart = Math.max(0, totalDays - 66); break;
      case '6mo': sliceStart = Math.max(0, totalDays - 132); break;
      case '1y': sliceStart = 0; break;
    }

    for (let i = sliceStart; i < len; i++) {
      if (h.close[i] == null || h.open[i] == null) continue;
      const date = new Date(h.timestamps[i] * 1000);
      const time = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      candleData.push({
        time,
        open: h.open[i],
        high: h.high[i],
        low: h.low[i],
        close: h.close[i],
      });
    }

    state.chartSeries.setData(candleData);
    state.chart.timeScale().fitContent();
  }

  // ============================================================
  // UI CONTROLLER
  // ============================================================

  function renderStockCards() {
    dom.stockGrid.innerHTML = '';

    STOCKS.forEach((stock, idx) => {
      const card = document.createElement('div');
      card.className = 'stock-card';
      card.id = `card-${stock.symbol}`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.style.animationDelay = `${idx * 30}ms`;

      const sd = state.stockData[stock.symbol];
      const pred = state.predictions[stock.symbol];
      const price = sd ? sd.price : stock.seedPrice;
      const change = sd ? sd.change : 0;
      const changePct = sd ? sd.changePct : 0;
      const isUp = change >= 0;
      const signal = pred ? pred.signal : 'HOLD';
      const confidence = pred ? pred.confidence : 0;

      if (signal === 'BUY') card.classList.add('bullish');
      else if (signal === 'SELL') card.classList.add('bearish');
      else card.classList.add('neutral');

      const signalClass = signal.includes('BUY') ? 'buy' : signal.includes('SELL') ? 'sell' : 'hold';
      const grade = pred?.grade || 'Grade B';
      const gradeClass = pred?.gradeClass || 'grade-b';
      const t1 = pred?.t1;
      const sl = pred?.sl;
      const rr = pred?.rr || '1:2.0';

      card.innerHTML = `
        <div class="card-header">
          <div class="card-stock-info">
            <span class="card-symbol">${stock.symbol}</span>
            <span class="card-name">${stock.name}</span>
          </div>
          <div class="card-badge-group">
            <span class="card-grade ${gradeClass}">${grade}</span>
            <span class="card-signal ${signalClass}">
              <span class="signal-dot"></span>
              ${signal}
            </span>
          </div>
        </div>
        <div class="card-price-row">
          <span class="card-price" id="price-${stock.symbol}">${formatINR(price)}</span>
          <span class="card-change ${isUp ? 'up' : 'down'}">
            ${isUp ? '▲' : '▼'} ${formatPct(changePct)}
          </span>
        </div>
        <div class="card-targets-row">
          <span class="card-target"><span class="lbl">T1</span> ${formatINR(t1)}</span>
          <span class="card-sl"><span class="lbl">SL</span> ${formatINR(sl)}</span>
          <span class="card-rr"><span class="lbl">R:R</span> ${rr}</span>
        </div>
        <div class="card-footer">
          <span class="card-confidence">Confluence: <strong>${confidence}%</strong></span>
          <span class="card-updated" id="updated-${stock.symbol}">${pred?.updatedAt || ''}</span>
        </div>
      `;

      card.addEventListener('click', () => selectStock(stock.symbol));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStock(stock.symbol); }
      });

      dom.stockGrid.appendChild(card);
    });
  }

  function updateCardPrice(symbol) {
    const sd = state.stockData[symbol];
    if (!sd) return;

    const priceEl = document.getElementById(`price-${symbol}`);
    const card = document.getElementById(`card-${symbol}`);
    if (!priceEl || !card) return;

    const oldText = priceEl.textContent;
    const newText = formatINR(sd.price);
    if (oldText !== newText) {
      priceEl.textContent = newText;

      // Flash animation
      const isUp = sd.change >= 0;
      priceEl.classList.remove('flash-up', 'flash-down');
      void priceEl.offsetWidth; // Force reflow
      priceEl.classList.add(isUp ? 'flash-up' : 'flash-down');

      card.classList.remove('flash-green', 'flash-red');
      void card.offsetWidth;
      card.classList.add(isUp ? 'flash-green' : 'flash-red');
    }
  }

  async function selectStock(symbol) {
    state.selectedStock = symbol;
    const stock = STOCKS.find(s => s.symbol === symbol);
    const sd = state.stockData[symbol];

    // Highlight selected card
    document.querySelectorAll('.stock-card').forEach(c => c.classList.remove('selected'));
    const card = document.getElementById(`card-${symbol}`);
    if (card) card.classList.add('selected');

    // Show detail panel
    dom.detailPanel.classList.add('visible');

    // Update header
    document.getElementById('detailSymbol').textContent = symbol;
    document.getElementById('detailName').textContent = stock ? stock.name : symbol;

    if (sd) {
      document.getElementById('detailPrice').textContent = formatINR(sd.price);
      const changeEl = document.getElementById('detailChange');
      const isUp = sd.change >= 0;
      changeEl.textContent = `${isUp ? '+' : ''}${sd.change.toFixed(2)} (${formatPct(sd.changePct)})`;
      changeEl.className = `detail-change ${isUp ? 'up' : 'down'}`;
    }

    // Init and update chart
    initChart();
    updateChart(symbol, '1mo');

    // Run prediction
    document.getElementById('predBadge').textContent = 'Loading...';
    document.getElementById('predBadge').className = 'prediction-badge hold';
    document.getElementById('predConfidence').textContent = '—';
    document.getElementById('predBar').style.width = '0%';
    document.getElementById('predReasoning').textContent = '';

    await runPrediction(symbol);
    updatePredictionUI(symbol);
    updateIndicatorsUI(symbol);
    updateModelInfoUI(symbol);
  }

  function updatePredictionUI(symbol) {
    const pred = state.predictions[symbol];
    if (!pred) return;

    const badge = document.getElementById('predBadge');
    const conf = document.getElementById('predConfidence');
    const bar = document.getElementById('predBar');
    const reasoning = document.getElementById('predReasoning');
    const gradeBadge = document.getElementById('detailGradeBadge');

    badge.textContent = pred.signal;
    const signalClass = pred.signal.includes('BUY') ? 'buy' : pred.signal.includes('SELL') ? 'sell' : 'hold';
    badge.className = `prediction-badge ${signalClass}`;

    if (gradeBadge) {
      gradeBadge.textContent = pred.grade || 'Grade B';
      gradeBadge.className = `detail-grade-badge ${pred.gradeClass || 'grade-b'}`;
    }

    conf.textContent = `${pred.confidence}%`;
    bar.style.width = `${pred.confidence}%`;
    bar.className = `bar-fill ${pred.signal.includes('BUY') ? 'green' : pred.signal.includes('SELL') ? 'red' : 'amber'}`;

    // Populate Trade Setup Box
    const planEl = document.getElementById('setupActionPlan');
    const entryEl = document.getElementById('setupEntry');
    const slEl = document.getElementById('setupSL');
    const t1El = document.getElementById('setupT1');
    const t2El = document.getElementById('setupT2');
    const rrEl = document.getElementById('setupRR');
    const regimeEl = document.getElementById('setupRegime');

    if (planEl && pred.actionPlan) planEl.textContent = pred.actionPlan;
    if (entryEl && pred.entryMin) entryEl.textContent = `₹${pred.entryMin.toFixed(2)} - ₹${pred.entryMax.toFixed(2)}`;
    if (slEl && pred.sl) slEl.textContent = `₹${pred.sl.toFixed(2)}`;
    if (t1El && pred.t1) t1El.textContent = `₹${pred.t1.toFixed(2)}`;
    if (t2El && pred.t2) t2El.textContent = `₹${pred.t2.toFixed(2)}`;
    if (rrEl && pred.rr) rrEl.textContent = pred.rr;
    if (regimeEl && pred.factors?.regimeStatus) regimeEl.textContent = pred.factors.regimeStatus;

    // Generate reasoning
    const features = state.features[symbol];
    if (features) {
      const rsi = features[13];
      const macd = features[14];
      const bbPos = features[23];
      const priceVsSma20 = features[30];
      const reasons = [];
      reasons.push(`AI Conviction: ${pred.factors?.aiScore || 50}%`);
      reasons.push(`Trend Strength: ${pred.factors?.trendScore || 50}%`);
      reasons.push(`Momentum: ${pred.factors?.momentumScore || 50}%`);
      reasons.push(`Inst. Volume: ${pred.factors?.volumeScore || 50}%`);
      if (rsi > 70) reasons.push('RSI overbought (' + rsi.toFixed(1) + ')');
      else if (rsi < 35) reasons.push('RSI oversold bounce (' + rsi.toFixed(1) + ')');
      if (macd > 0) reasons.push('MACD Bullish');
      else reasons.push('MACD Bearish');
      reasoning.textContent = 'Confluence Factors: ' + reasons.join(' • ');
    }
  }

  function updateIndicatorsUI(symbol) {
    const features = state.features[symbol];
    if (!features) return;

    const rsi = features[13];
    const macd = features[14];
    const adx = features[17];
    const atrPct = features[25] * 100;
    const bbPos = features[23];
    const vol20 = features[36] * 100;

    const setInd = (id, val, classify) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      el.className = `ind-value ${classify}`;
    };

    setInd('indRSI', rsi.toFixed(1), rsi > 70 ? 'bearish' : rsi < 30 ? 'bullish' : 'neutral');
    setInd('indMACD', macd.toFixed(2), macd > 0 ? 'bullish' : 'bearish');
    setInd('indADX', adx.toFixed(1), adx > 25 ? 'bullish' : 'neutral');
    setInd('indATR', atrPct.toFixed(2) + '%', atrPct > 3 ? 'bearish' : 'neutral');
    setInd('indBB', bbPos.toFixed(2), bbPos > 0.8 ? 'bearish' : bbPos < 0.2 ? 'bullish' : 'neutral');
    setInd('indVol', vol20.toFixed(2) + '%', vol20 > 3 ? 'bearish' : 'neutral');
  }

  async function updateModelInfoUI(symbol) {
    const model = state.models[symbol];
    if (!model) return;

    const lp = model.learner.learner_model_param;
    document.getElementById('modelTrees').textContent = model.learner.gradient_booster.model.gbtree_model_param.num_trees;
    document.getElementById('modelFeatures').textContent = lp.num_feature;
    document.getElementById('modelObjective').textContent = model.learner.objective.name;
    const bs = lp.base_score;
    document.getElementById('modelBaseScore').textContent = typeof bs === 'string' ? bs.replace(/[\[\]]/g, '') : bs;

    // Feature importance
    const importance = getFeatureImportance(model);
    const barsContainer = document.getElementById('featureBars');
    barsContainer.innerHTML = '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:500">Top Features</div>';

    importance.slice(0, 8).forEach(feat => {
      const item = document.createElement('div');
      item.className = 'feature-bar-item';
      item.innerHTML = `
        <span class="fb-name">${feat.name}</span>
        <div class="fb-track">
          <div class="fb-fill" style="width: ${Math.round(feat.importance * 100)}%"></div>
        </div>
      `;
      barsContainer.appendChild(item);
    });
  }

  // ── Market Clock ──────────────────────────────────────────
  function updateClock() {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    dom.marketClock.textContent = ist.toLocaleTimeString('en-IN', { hour12: false });

    const statusEl = dom.marketStatus;
    const open = isMarketOpen();
    statusEl.className = `market-status ${open ? 'open' : 'closed'}`;
    statusEl.querySelector('.status-text').textContent = open ? 'LIVE' : 'CLOSED';
  }

  // ── Market Ticker ─────────────────────────────────────────
  function updateTicker() {
    ['nifty', 'banknifty', 'vix'].forEach(key => {
      const idx = state.indexData[key];
      if (!idx) return;
      const priceEl = document.getElementById(`${key === 'banknifty' ? 'banknifty' : key}Price`);
      const changeEl = document.getElementById(`${key === 'banknifty' ? 'banknifty' : key}Change`);
      if (!priceEl || !changeEl) return;

      priceEl.textContent = idx.price.toFixed(2);
      const pct = ((idx.price - idx.prevClose) / idx.prevClose * 100);
      const isUp = pct >= 0;
      changeEl.textContent = formatPct(pct);
      changeEl.className = `ticker-change ${isUp ? 'up' : 'down'}`;
    });
  }

  // ── Search & Filter ───────────────────────────────────────
  function applyFilters() {
    const query = dom.searchInput.value.toLowerCase().trim();
    let visibleCount = 0;

    STOCKS.forEach(stock => {
      const card = document.getElementById(`card-${stock.symbol}`);
      if (!card) return;

      const matchesSearch = !query ||
        stock.symbol.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query) ||
        stock.sector.toLowerCase().includes(query);

      const pred = state.predictions[stock.symbol];
      const signal = pred ? pred.signal.toLowerCase() : 'hold';
      const grade = pred ? (pred.grade || '').toLowerCase() : '';

      let matchesFilter = false;
      if (state.filter === 'all') {
        matchesFilter = true;
      } else if (state.filter === 'aplus') {
        matchesFilter = grade.includes('a+');
      } else if (state.filter === 'strongbuy') {
        matchesFilter = signal === 'strong buy';
      } else if (state.filter === 'buy') {
        matchesFilter = signal.includes('buy') || signal === 'accumulate';
      } else if (state.filter === 'sell') {
        matchesFilter = signal.includes('sell');
      } else {
        matchesFilter = signal === state.filter;
      }

      const visible = matchesSearch && matchesFilter;
      card.style.display = visible ? '' : 'none';
      if (visible) visibleCount++;
    });

    dom.visibleCount.textContent = visibleCount;
  }

  // ── Event Listeners ───────────────────────────────────────
  function bindEvents() {
    // Search
    dom.searchInput.addEventListener('input', applyFilters);

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filter = btn.dataset.filter;
        applyFilters();
      });
    });

    // Close detail panel
    dom.detailClose.addEventListener('click', () => {
      dom.detailPanel.classList.remove('visible');
      document.querySelectorAll('.stock-card').forEach(c => c.classList.remove('selected'));
      state.selectedStock = null;
    });

    // Chart timeframe buttons
    document.getElementById('chartTimeframe').addEventListener('click', (e) => {
      const btn = e.target.closest('.tf-btn');
      if (!btn || !state.selectedStock) return;
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateChart(state.selectedStock, btn.dataset.range);
    });

    // Prediction log toggle
    dom.predLogToggle.addEventListener('click', () => {
      state.predLogOpen = !state.predLogOpen;
      dom.predLogBody.classList.toggle('open', state.predLogOpen);
      dom.predLogArrow.style.transform = state.predLogOpen ? 'rotate(180deg)' : '';
    });

    // Keyboard shortcut: Escape to close detail panel
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.detailPanel.classList.contains('visible')) {
        dom.detailClose.click();
      }
    });
  }

  // ── Price Refresh Loop ────────────────────────────────────
  async function refreshPrices() {
    const batchSize = 4;
    for (let i = 0; i < STOCKS.length; i += batchSize) {
      const batch = STOCKS.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(async stock => {
        const result = await fetchYahoo(`${stock.symbol}.NS`, '5d', '1d');
        if (result) {
          const closes = result.indicators.quote[0].close.filter(v => v != null);
          if (closes.length >= 2) {
            const sd = state.stockData[stock.symbol];
            if (sd) {
              sd.price = closes[closes.length - 1];
              sd.prevClose = closes[closes.length - 2];
              sd.change = sd.price - sd.prevClose;
              sd.changePct = (sd.change / sd.prevClose) * 100;
              sd.live = true;
              updateCardPrice(stock.symbol);
            }
          }
        }
      }));
    }

    // Update selected stock detail if open
    if (state.selectedStock) {
      const sd = state.stockData[state.selectedStock];
      if (sd) {
        document.getElementById('detailPrice').textContent = formatINR(sd.price);
        const changeEl = document.getElementById('detailChange');
        const isUp = sd.change >= 0;
        changeEl.textContent = `${isUp ? '+' : ''}${sd.change.toFixed(2)} (${formatPct(sd.changePct)})`;
        changeEl.className = `detail-change ${isUp ? 'up' : 'down'}`;
      }
    }
  }

  // ── Simulated Price Jitter (for demo when API is unavailable) ──
  function simulatePriceJitter() {
    STOCKS.forEach(stock => {
      const sd = state.stockData[stock.symbol];
      if (!sd || sd.live) return; // Skip live-data stocks

      const jitter = (Math.random() - 0.48) * 0.002 * sd.price;
      sd.price += jitter;
      sd.change = sd.price - sd.prevClose;
      sd.changePct = (sd.change / sd.prevClose) * 100;
      updateCardPrice(stock.symbol);
    });

    // Update selected stock detail
    if (state.selectedStock) {
      const sd = state.stockData[state.selectedStock];
      if (sd && !sd.live) {
        document.getElementById('detailPrice').textContent = formatINR(sd.price);
        const changeEl = document.getElementById('detailChange');
        const isUp = sd.change >= 0;
        changeEl.textContent = `${isUp ? '+' : ''}${sd.change.toFixed(2)} (${formatPct(sd.changePct)})`;
        changeEl.className = `detail-change ${isUp ? 'up' : 'down'}`;
      }
    }
  }

  // ============================================================
  // 2-MINUTE AUTO-REFRESH CYCLE
  // ============================================================

  async function refreshAllPredictions() {
    addSystemLog('🔄 Starting prediction refresh cycle...');
    dom.updateOverlay.classList.add('visible');
    dom.refreshTimer.classList.add('refreshing');

    // Refresh price data first
    addSystemLog('📊 Fetching latest price data...');
    const batchSize = 5;
    for (let i = 0; i < STOCKS.length; i += batchSize) {
      const batch = STOCKS.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(async stock => {
        const result = await fetchYahoo(`${stock.symbol}.NS`, '1y', '1d');
        if (result) {
          const q = result.indicators.quote[0];
          const ts = result.timestamp;
          const closes = q.close.filter(v => v != null);
          if (closes.length >= 2) {
            state.stockData[stock.symbol] = {
              price: closes[closes.length - 1],
              prevClose: closes[closes.length - 2],
              change: closes[closes.length - 1] - closes[closes.length - 2],
              changePct: ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100,
              history: { timestamps: ts, close: q.close, open: q.open, high: q.high, low: q.low, volume: q.volume },
              live: true,
            };
          }
        }
      }));
    }

    // Refresh index data
    await loadIndexData();
    updateTicker();

    // Recalculate features and re-run all quantum confluence predictions
    addSystemLog('🧠 Running Quantum Confluence Engine for all 19 stocks...');
    for (const stock of STOCKS) {
      await runPrediction(stock.symbol);
    }

    addSystemLog(`✅ Refresh complete — ${STOCKS.length} predictions updated`);

    // Re-render cards with new data
    renderStockCards();
    applyFilters();

    // Update detail panel if open
    if (state.selectedStock) {
      const sd = state.stockData[state.selectedStock];
      if (sd) {
        document.getElementById('detailPrice').textContent = formatINR(sd.price);
        const changeEl = document.getElementById('detailChange');
        const isUp = sd.change >= 0;
        changeEl.textContent = `${isUp ? '+' : ''}${sd.change.toFixed(2)} (${formatPct(sd.changePct)})`;
        changeEl.className = `detail-change ${isUp ? 'up' : 'down'}`;
      }
      updatePredictionUI(state.selectedStock);
      updateIndicatorsUI(state.selectedStock);
      if (state.chart) updateChart(state.selectedStock, '1mo');
    }

    dom.updateOverlay.classList.remove('visible');
    dom.refreshTimer.classList.remove('refreshing');
    showToast(`✓ Predictions refreshed at ${getISTTimeString()}`, 3000);

    // Reset countdown
    state.countdownSeconds = 120;
  }

  function startCountdownTimer() {
    state.countdownSeconds = 30;
    state.countdownInterval = setInterval(() => {
      state.countdownSeconds--;
      if (state.countdownSeconds <= 0) {
        state.countdownSeconds = 30;
        refreshAllPredictions();
      }
      const mins = Math.floor(state.countdownSeconds / 60);
      const secs = state.countdownSeconds % 60;
      dom.countdownText.textContent = `Next update: ${mins}:${String(secs).padStart(2, '0')}`;
    }, 1000);
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  async function init() {
    console.log('🚀 BharatQuant Dashboard initializing...');

    // Start clock
    updateClock();
    setInterval(updateClock, 1000);

    // Bind events
    bindEvents();

    // Update initial system log time
    const firstLog = dom.predLogEntries.querySelector('.log-time');
    if (firstLog) firstLog.textContent = getISTTimeString();

    // Render skeleton cards first
    dom.stockGrid.innerHTML = STOCKS.map((s, i) => `
      <div class="stock-card" style="animation-delay:${i * 30}ms">
        <div class="card-header">
          <div class="card-stock-info">
            <span class="card-symbol">${s.symbol}</span>
            <span class="card-name">${s.name}</span>
          </div>
          <div class="skeleton skeleton-badge"></div>
        </div>
        <div class="card-price-row">
          <div class="skeleton skeleton-price"></div>
        </div>
        <div class="card-footer">
          <div class="skeleton skeleton-text" style="width:100px"></div>
        </div>
      </div>
    `).join('');

    addSystemLog('📡 Loading market data for 19 stocks...');

    // Load index data (parallel with stock data)
    const indexPromise = loadIndexData();

    // Load stock data in batches
    const batchSize = 5;
    for (let i = 0; i < STOCKS.length; i += batchSize) {
      const batch = STOCKS.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(s => loadStockData(s)));
    }

    await indexPromise;
    addSystemLog('✅ Market data loaded. Running initial predictions...');

    // Run initial predictions for all stocks
    // Open the log console to show predictions
    state.predLogOpen = true;
    dom.predLogBody.classList.add('open');
    dom.predLogArrow.style.transform = 'rotate(180deg)';

    addSystemLog('🧠 Running Quantum Confluence Engine for all 19 stocks...');
    for (const stock of STOCKS) {
      await runPrediction(stock.symbol);
    }

    addSystemLog(`🎯 Initial predictions complete for ${STOCKS.length} stocks`);

    // Render final cards
    renderStockCards();
    updateTicker();

    // Start 2-minute auto-refresh cycle
    startCountdownTimer();
    addSystemLog('⏱ Auto-refresh enabled: predictions update every 30 seconds');

    // Also start price jitter for simulated data
    const hasLive = STOCKS.some(s => state.stockData[s.symbol]?.live);
    if (hasLive) {
      showToast('✓ Connected to live market data — auto-refresh every 30s', 4000);
      setInterval(refreshPrices, 15000);
    } else {
      showToast('⚡ Models loaded — predictions auto-refresh every 30s', 5000);
      setInterval(simulatePriceJitter, 3000);
    }

    console.log('✅ BharatQuant Dashboard ready');
  }

  // Start!
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
