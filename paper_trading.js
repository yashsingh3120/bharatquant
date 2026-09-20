// ============================================================
// BharatQuant — Paper Trading Simulator Engine 🎮
// Real-Time Virtual Capital Trading, Automated Target/SL Triggers,
// Live P&L Calculation, and Trade Book Analytics
// ============================================================

window.PaperTrading = (() => {
  'use strict';

  const STORAGE_KEYS = {
    WALLET: 'bq_paper_wallet',
    POSITIONS: 'bq_paper_positions',
    HISTORY: 'bq_paper_history',
  };

  const DEFAULT_CAPITAL = 100000; // ₹1,00,000

  // ── State Initialization ─────────────────────────────────
  let wallet = loadFromStorage(STORAGE_KEYS.WALLET, {
    balance: DEFAULT_CAPITAL,
    startingBalance: DEFAULT_CAPITAL,
    realizedPnL: 0,
    wins: 0,
    losses: 0,
  });

  let positions = loadFromStorage(STORAGE_KEYS.POSITIONS, []);
  let history = loadFromStorage(STORAGE_KEYS.HISTORY, []);

  // ── Indian Stock Market (NSE/BSE) Holidays & Session Engine ─
  const NSE_HOLIDAYS_LIST = [
    // Annual Fixed National Holidays (MM-DD)
    '01-26', // Republic Day
    '05-01', // Maharashtra Day
    '08-15', // Independence Day
    '10-02', // Mahatma Gandhi Jayanti
    '12-25', // Christmas

    // 2024 Holidays
    '2024-01-22', '2024-03-08', '2024-03-25', '2024-03-29', '2024-04-11',
    '2024-04-17', '2024-04-21', '2024-06-17', '2024-07-17', '2024-11-01',
    '2024-11-15', '2024-11-20',

    // 2025 Holidays
    '2025-02-26', '2025-03-14', '2025-03-31', '2025-04-10', '2025-04-14',
    '2025-04-18', '2025-05-01', '2025-06-07', '2025-08-27', '2025-10-21',
    '2025-10-22', '2025-11-05',

    // 2026 Holidays
    '2026-02-15', '2026-03-04', '2026-03-20', '2026-04-03', '2026-04-14',
    '2026-05-27', '2026-09-15', '2026-10-20', '2026-11-08', '2026-11-24',

    // 2027 Holidays
    '2027-03-23', '2027-03-26', '2027-04-07', '2027-04-14', '2027-10-20',
    '2027-11-10', '2027-11-28',
  ];

  let enforceHolidays = loadFromStorage('bq_paper_enforce_holidays', true);

  function getMarketStatus() {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

    const day = ist.getDay(); // 0 = Sun, 6 = Sat
    const year = ist.getFullYear();
    const month = String(ist.getMonth() + 1).padStart(2, '0');
    const date = String(ist.getDate()).padStart(2, '0');
    const ymd = `${year}-${month}-${date}`;
    const md = `${month}-${date}`;

    // 1. Weekend Check
    if (day === 0) {
      return { isOpen: false, isHoliday: true, reason: 'Sunday (Weekend Market Holiday)' };
    }
    if (day === 6) {
      return { isOpen: false, isHoliday: true, reason: 'Saturday (Weekend Market Holiday)' };
    }

    // 2. Official NSE Exchange Holiday Check
    if (NSE_HOLIDAYS_LIST.includes(ymd) || NSE_HOLIDAYS_LIST.includes(md)) {
      return { isOpen: false, isHoliday: true, reason: 'Official NSE Stock Market Holiday' };
    }

    // 3. Regular Market Trading Hours: 09:15 AM to 03:30 PM IST
    const minutes = ist.getHours() * 60 + ist.getMinutes();
    if (minutes < 555) {
      return { isOpen: false, isHoliday: false, reason: 'Pre-Market (Opens at 09:15 AM IST)' };
    }
    if (minutes > 930) {
      return { isOpen: false, isHoliday: false, reason: 'Post-Market (Closed at 03:30 PM IST)' };
    }

    return { isOpen: true, isHoliday: false, reason: 'Live Market Open' };
  }

  function toggleHolidayEnforcement(enabled) {
    enforceHolidays = !!enabled;
    try {
      localStorage.setItem('bq_paper_enforce_holidays', JSON.stringify(enforceHolidays));
    } catch (e) {}
    showNotification(enforceHolidays 
      ? '🛡️ Market Holiday Rules: STRICTLY ENFORCED (Buy/sell blocked on holidays & weekends)' 
      : '⚠️ Market Holiday Rules: DISABLED (Weekend Practice Mode Enabled)', 
      enforceHolidays ? 'info' : 'warning');
    renderUI();
  }

  function loadFromStorage(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.WALLET, JSON.stringify(wallet));
      localStorage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify(positions));
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    } catch (e) {
      console.warn('[PaperTrading] Failed to save state:', e);
    }
  }

  function formatINR(val) {
    if (val == null || isNaN(val)) return '₹0.00';
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 100000) {
      return sign + '₹' + abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return sign + '₹' + abs.toFixed(2);
  }

  function formatPct(val) {
    if (val == null || isNaN(val)) return '0.00%';
    const sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(2) + '%';
  }

  function getISTTime() {
    return new Date().toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });
  }

  function showNotification(msg, type = 'info') {
    const toast = document.getElementById('paperToast') || createToastElement();
    toast.textContent = msg;
    toast.className = `paper-toast visible ${type}`;
    setTimeout(() => toast.classList.remove('visible'), 4000);
  }

  function createToastElement() {
    const el = document.createElement('div');
    el.id = 'paperToast';
    el.className = 'paper-toast';
    document.body.appendChild(el);
    return el;
  }

  // ── 1-Click Order Execution ──────────────────────────────
  function getAvailableCash() {
    const activeMarginUsed = positions.reduce((sum, p) => sum + (p.entryPrice * p.qty), 0);
    return Math.max(0, wallet.balance - activeMarginUsed);
  }

  // ── 1-Click Order Execution with User-Custom Quantity ────
  function openPosition(symbol, side, currentPrice, sl, t1, t2, userCustomQty = null) {
    // ── Check Stock Market Holiday & Market Hours ────────────
    if (enforceHolidays) {
      const mkt = getMarketStatus();
      if (mkt.isHoliday) {
        showNotification(`🚫 Market Holiday! Today is ${mkt.reason}. Stock buy/sell is disabled on exchange holidays.`, 'error');
        return false;
      }
      if (!mkt.isOpen) {
        showNotification(`🚫 Market Closed! ${mkt.reason}. Trading hours: Mon-Fri, 9:15 AM - 3:30 PM IST.`, 'error');
        return false;
      }
    }

    currentPrice = parseFloat(currentPrice);
    if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
      showNotification('❌ Waiting for live stock price before order execution...', 'error');
      return false;
    }

    // Check available cash
    const availableCash = getAvailableCash();

    let qty = 1;
    if (userCustomQty && parseInt(userCustomQty) > 0) {
      qty = parseInt(userCustomQty);
    } else {
      qty = Math.max(1, Math.min(10, Math.floor(availableCash / currentPrice)));
    }

    const requiredCapital = qty * currentPrice;

    if (availableCash < requiredCapital) {
      const maxPossible = Math.floor(availableCash / currentPrice);
      showNotification(`⚠️ Insufficient cash! Required for ${qty} shares: ${formatINR(requiredCapital)}, Available: ${formatINR(availableCash)}${maxPossible > 0 ? ` (Max possible: ${maxPossible} shares)` : ''}`, 'error');
      return false;
    }

    const tradeId = 'pt_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    let numSl = parseFloat(sl);
    let numT1 = parseFloat(t1);
    let numT2 = parseFloat(t2);

    if (side === 'BUY') {
      if (!numSl || numSl >= currentPrice) numSl = +(currentPrice * 0.985).toFixed(2);
      if (!numT1 || numT1 <= currentPrice) numT1 = +(currentPrice * 1.035).toFixed(2);
      if (!numT2 || numT2 <= numT1) numT2 = +(currentPrice * 1.065).toFixed(2);
    } else {
      if (!numSl || numSl <= currentPrice) numSl = +(currentPrice * 1.015).toFixed(2);
      if (!numT1 || numT1 >= currentPrice) numT1 = +(currentPrice * 0.965).toFixed(2);
      if (!numT2 || numT2 >= numT1) numT2 = +(currentPrice * 0.935).toFixed(2);
    }

    const position = {
      id: tradeId,
      symbol: symbol,
      side: side, // 'BUY' or 'SHORT'
      qty: qty,
      entryPrice: currentPrice,
      currentPrice: currentPrice,
      sl: numSl,
      t1: numT1,
      t2: numT2,
      time: getISTTime(),
      unrealizedPnL: 0,
      unrealizedPnLPct: 0,
    };

    positions.push(position);
    saveToStorage();
    renderUI();

    showNotification(`⚡ [PAPER ${side}] ${qty} shares of ${symbol} @ ${formatINR(currentPrice)} | Target: ${formatINR(position.t1)}`, 'success');
    return true;
  }

  // ── Close Position ───────────────────────────────────────
  function closePosition(id, exitPrice, reason = 'MANUAL') {
    const idx = positions.findIndex(p => p.id === id);
    if (idx === -1) return;

    const p = positions[idx];
    const finalPrice = exitPrice || p.currentPrice;
    let pnl = 0;

    if (p.side === 'BUY') {
      pnl = (finalPrice - p.entryPrice) * p.qty;
    } else {
      pnl = (p.entryPrice - finalPrice) * p.qty;
    }

    const pnlPct = ((pnl) / (p.entryPrice * p.qty)) * 100;
    const isWin = pnl > 0.01;

    wallet.realizedPnL += pnl;
    wallet.balance += pnl;
    if (isWin) wallet.wins++;
    else if (pnl < -0.01) wallet.losses++;

    const closedRecord = {
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      qty: p.qty,
      entryPrice: p.entryPrice,
      exitPrice: finalPrice,
      pnl: pnl,
      pnlPct: pnlPct,
      reason: reason,
      entryTime: p.time,
      exitTime: getISTTime(),
      isWin: isWin,
    };

    history.unshift(closedRecord);
    positions.splice(idx, 1);

    saveToStorage();
    renderUI();

    let signStr = '';
    let toastType = 'info';
    if (pnl > 0.01) {
      signStr = '🎯 [PROFIT]';
      toastType = 'success';
    } else if (pnl < -0.01) {
      signStr = '🛡️ [LOSS]';
      toastType = 'error';
    } else {
      signStr = '⚖️ [BREAK-EVEN]';
      toastType = 'info';
    }
    showNotification(`${signStr} ${p.symbol} closed @ ${formatINR(finalPrice)} (${reason}) -> P&L: ${formatINR(pnl)} (${formatPct(pnlPct)})`, toastType);
  }

  // ── High-Frequency Live Market Tick & P&L Engine ──────────
  let tickInterval = null;
  let lastTotalPnL = 0;

  function startLiveTickEngine() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(() => {
      if (!positions || positions.length === 0) return;

      // When holidays are enforced, freeze price ticks and P&L on market holidays or when market is closed
      if (enforceHolidays) {
        const mkt = getMarketStatus();
        if (mkt.isHoliday || !mkt.isOpen) {
          return; // Strictly frozen - no price movement when exchange is closed!
        }
      }

      const toClose = [];
      let updated = false;

      positions.forEach(p => {
        // Micro-tick simulation between real market polling intervals
        // Realistic step: ±0.04% to ±0.16% per tick
        const tickPct = (Math.random() - 0.485) * 0.0024;
        const tickVal = +(p.currentPrice * tickPct).toFixed(2);
        
        // Ensure price stays within realistic bounds
        const newPrice = +(p.currentPrice + tickVal).toFixed(2);
        if (newPrice > p.entryPrice * 0.90 && newPrice < p.entryPrice * 1.10) {
          p.lastTickDir = tickVal >= 0 ? 'up' : 'down';
          p.currentPrice = newPrice;
        }

        // Recalculate Unrealized P&L
        let pnl = 0;
        if (p.side === 'BUY') {
          pnl = +((p.currentPrice - p.entryPrice) * p.qty).toFixed(2);
        } else {
          pnl = +((p.entryPrice - p.currentPrice) * p.qty).toFixed(2);
        }
        p.unrealizedPnL = pnl;
        p.unrealizedPnLPct = +((pnl / (p.entryPrice * p.qty)) * 100).toFixed(2);
        updated = true;

        // Automated Triggers Check (Strict Validation: only fire if price moved and crossed valid thresholds)
        if (p.currentPrice !== p.entryPrice) {
          if (p.side === 'BUY') {
            if (p.t1 > p.entryPrice && p.currentPrice >= p.t1) {
              toClose.push({ id: p.id, price: p.currentPrice, reason: 'TARGET 1 HIT 🎯' });
            } else if (p.sl < p.entryPrice && p.currentPrice <= p.sl) {
              toClose.push({ id: p.id, price: p.currentPrice, reason: 'STOP LOSS HIT 🛡️' });
            }
          } else {
            if (p.t1 < p.entryPrice && p.currentPrice <= p.t1) {
              toClose.push({ id: p.id, price: p.currentPrice, reason: 'TARGET 1 HIT 🎯' });
            } else if (p.sl > p.entryPrice && p.currentPrice >= p.sl) {
              toClose.push({ id: p.id, price: p.currentPrice, reason: 'STOP LOSS HIT 🛡️' });
            }
          }
        }

        // Update selected stock price on active terminal/dashboard
        updateOnscreenStockPrice(p.symbol, p.currentPrice, p.lastTickDir);
      });

      if (updated) {
        saveToStorage();
        renderUI(true);
      }

      toClose.forEach(tc => closePosition(tc.id, tc.price, tc.reason));
    }, 1200); // 1.2 second live tick
  }

  function updateOnscreenStockPrice(symbol, price, tickDir) {
    // Check Intraday Terminal
    const termSymEl = document.getElementById('termSymbol');
    if (termSymEl && termSymEl.textContent.trim() === symbol) {
      const termPriceEl = document.getElementById('termPrice');
      if (termPriceEl) {
        termPriceEl.textContent = formatINR(price);
        termPriceEl.classList.remove('price-flash-up', 'price-flash-down');
        void termPriceEl.offsetWidth;
        termPriceEl.classList.add(tickDir === 'up' ? 'price-flash-up' : 'price-flash-down');
      }
    }
    // Check Swing Detail Panel
    const detailSymEl = document.getElementById('detailSymbol');
    if (detailSymEl && detailSymEl.textContent.trim() === symbol) {
      const detailPriceEl = document.getElementById('detailPrice');
      if (detailPriceEl) {
        detailPriceEl.textContent = formatINR(price);
        detailPriceEl.classList.remove('price-flash-up', 'price-flash-down');
        void detailPriceEl.offsetWidth;
        detailPriceEl.classList.add(tickDir === 'up' ? 'price-flash-up' : 'price-flash-down');
      }
    }
  }

  // ── Live Price Updates from API & Automated Triggers ─────
  function updateLivePrices(priceMap) {
    if (!positions || positions.length === 0) {
      renderUI();
      return;
    }

    let updatedAny = false;
    const toClose = [];

    positions.forEach(p => {
      const curPrice = priceMap[p.symbol];
      if (curPrice != null && !isNaN(curPrice)) {
        p.currentPrice = curPrice;
        
        let pnl = 0;
        if (p.side === 'BUY') {
          pnl = (p.currentPrice - p.entryPrice) * p.qty;
        } else {
          pnl = (p.entryPrice - p.currentPrice) * p.qty;
        }

        p.unrealizedPnL = pnl;
        p.unrealizedPnLPct = (pnl / (p.entryPrice * p.qty)) * 100;
        updatedAny = true;

        // Automated Triggers Check (Strict Validation)
        if (p.currentPrice !== p.entryPrice) {
          if (p.side === 'BUY') {
            if (p.t1 > p.entryPrice && p.currentPrice >= p.t1) {
              toClose.push({ id: p.id, price: p.currentPrice, reason: 'TARGET 1 HIT 🎯' });
            } else if (p.sl < p.entryPrice && p.currentPrice <= p.sl) {
              toClose.push({ id: p.id, price: p.currentPrice, reason: 'STOP LOSS HIT 🛡️' });
            }
          } else {
            if (p.t1 < p.entryPrice && p.currentPrice <= p.t1) {
              toClose.push({ id: p.id, price: p.currentPrice, reason: 'TARGET 1 HIT 🎯' });
            } else if (p.sl > p.entryPrice && p.currentPrice >= p.sl) {
              toClose.push({ id: p.id, price: p.currentPrice, reason: 'STOP LOSS HIT 🛡️' });
            }
          }
        }
      }
    });

    if (updatedAny) {
      saveToStorage();
      renderUI(true);
    }

    // Execute triggers after loop
    toClose.forEach(tc => closePosition(tc.id, tc.price, tc.reason));
  }

  // ── Reset Simulator ──────────────────────────────────────
  function resetWallet() {
    if (!confirm('Are you sure you want to reset your Paper Trading Simulator wallet to ₹1,00,000?')) return;
    wallet = {
      balance: DEFAULT_CAPITAL,
      startingBalance: DEFAULT_CAPITAL,
      realizedPnL: 0,
      wins: 0,
      losses: 0,
    };
    positions = [];
    history = [];
    saveToStorage();
    renderUI();
    showNotification('🔄 Paper Trading Wallet reset to ₹1,00,000', 'info');
  }

  // ── Render UI Components ─────────────────────────────────
  function renderUI(isLiveTick = false) {
    // 1. Update Header Wallet Bar
    const balanceEl = document.getElementById('paperWalletBalance');
    const pnlEl = document.getElementById('paperTotalPnL');
    const winRateEl = document.getElementById('paperWinRate');
    const openCountEl = document.getElementById('paperOpenCount');

    const totalUnrealized = positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    const totalPnL = wallet.realizedPnL + totalUnrealized;
    const totalTrades = wallet.wins + wallet.losses;
    const winRate = totalTrades > 0 ? ((wallet.wins / totalTrades) * 100).toFixed(1) : '—';

    const activeMarginUsed = positions.reduce((sum, p) => sum + (p.entryPrice * p.qty), 0);
    const availableCash = Math.max(0, wallet.balance - activeMarginUsed);

    if (balanceEl) balanceEl.textContent = formatINR(availableCash);
    if (pnlEl) {
      const isUp = totalPnL >= 0;
      pnlEl.textContent = `${isUp ? '+' : ''}${formatINR(totalPnL)}`;
      pnlEl.className = `pnl-val ${isUp ? 'profit' : 'loss'}`;

      if (isLiveTick && positions.length > 0 && Math.abs(totalPnL - lastTotalPnL) > 0.01) {
        pnlEl.classList.remove('pnl-flash-up', 'pnl-flash-down');
        void pnlEl.offsetWidth; // Trigger CSS reflow
        pnlEl.classList.add(totalPnL >= lastTotalPnL ? 'pnl-flash-up' : 'pnl-flash-down');
      }
      lastTotalPnL = totalPnL;
    }
    if (winRateEl) winRateEl.textContent = winRate !== '—' ? `${winRate}% (${wallet.wins}W / ${wallet.losses}L)` : '0 Trades';
    if (openCountEl) openCountEl.textContent = positions.length;
    const tabCountEl = document.getElementById('paperTabOpenCount');
    if (tabCountEl) tabCountEl.textContent = positions.length;

    // Update Market Holiday Status in Modal
    const modalBadge = document.getElementById('modalMarketStatusBadge');
    const chkEnforce = document.getElementById('chkEnforceHolidays');
    const mkt = getMarketStatus();
    if (modalBadge) {
      if (mkt.isHoliday) {
        modalBadge.textContent = `🔴 ${mkt.reason.toUpperCase()}`;
        modalBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        modalBadge.style.color = '#EF4444';
        modalBadge.style.borderColor = '#EF4444';
      } else if (!mkt.isOpen) {
        modalBadge.textContent = `🟡 ${mkt.reason.toUpperCase()}`;
        modalBadge.style.background = 'rgba(245, 158, 11, 0.15)';
        modalBadge.style.color = '#F59E0B';
        modalBadge.style.borderColor = '#F59E0B';
      } else {
        modalBadge.textContent = `🟢 LIVE MARKET OPEN`;
        modalBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        modalBadge.style.color = '#10B981';
        modalBadge.style.borderColor = '#10B981';
      }
    }
    if (chkEnforce) {
      chkEnforce.checked = enforceHolidays;
    }

    // 2. Update Modal Trade Book if open
    renderTradeBookContent();
  }

  function renderTradeBookContent() {
    const openTable = document.getElementById('paperOpenPositionsBody');
    const historyTable = document.getElementById('paperHistoryBody');

    if (openTable) {
      if (positions.length === 0) {
        openTable.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);">No open positions. Click "Paper Buy" or "Paper Short" to execute virtual trades!</td></tr>`;
      } else {
        openTable.innerHTML = positions.map(p => {
          const isUp = p.unrealizedPnL >= 0;
          const tickClass = p.lastTickDir === 'up' ? 'tick-up' : 'tick-down';
          return `
            <tr>
              <td><span style="color:var(--text-muted);font-size:11px;font-family:var(--font-mono);">${p.time}</span></td>
              <td><strong>${p.symbol}</strong></td>
              <td><span class="badge ${p.side === 'BUY' ? 'buy' : 'sell'}">${p.side}</span></td>
              <td><strong>${p.qty}</strong></td>
              <td>${formatINR(p.entryPrice)}</td>
              <td><strong class="${tickClass}">${formatINR(p.currentPrice)}</strong></td>
              <td style="color:#10B981;">${formatINR(p.t1)}</td>
              <td style="color:#F43F5E;">${formatINR(p.sl)}</td>
              <td class="${isUp ? 'text-profit' : 'text-loss'}"><strong>${isUp ? '+' : ''}${formatINR(p.unrealizedPnL)} (${formatPct(p.unrealizedPnLPct)})</strong></td>
              <td><button class="btn-close-pos" onclick="PaperTrading.closePosition('${p.id}')">Exit</button></td>
            </tr>
          `;
        }).join('');
      }
    }

    if (historyTable) {
      if (history.length === 0) {
        historyTable.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted);">No closed trades yet.</td></tr>`;
      } else {
        historyTable.innerHTML = history.map(h => {
          const isUp = h.pnl >= 0;
          return `
            <tr>
              <td><span style="color:var(--text-muted);font-size:11px;font-family:var(--font-mono);">${h.entryTime || '—'}</span></td>
              <td><strong>${h.symbol}</strong></td>
              <td><span class="badge ${h.side === 'BUY' ? 'buy' : 'sell'}">${h.side}</span></td>
              <td>${h.qty}</td>
              <td>${formatINR(h.entryPrice)}</td>
              <td>${formatINR(h.exitPrice)}</td>
              <td class="${isUp ? 'text-profit' : 'text-loss'}"><strong>${formatINR(h.pnl)} (${formatPct(h.pnlPct)})</strong></td>
              <td><span class="reason-tag">${h.reason}</span></td>
              <td><span style="font-size:11px;color:var(--neon-cyan);font-family:var(--font-mono);">${h.exitTime}</span></td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  // ── Trade Book Modal Toggle ──────────────────────────────
  function toggleTradeBook() {
    const modal = document.getElementById('paperTradeBookModal');
    if (!modal) return;
    const isVisible = modal.classList.contains('visible');
    if (isVisible) {
      modal.classList.remove('visible');
    } else {
      modal.classList.add('visible');
      renderTradeBookContent();
    }
  }

  // ── Header Index Ticker Sliding Animation ─────────────────
  function initTickerSlider() {
    const container = document.getElementById('tickerSliderContainer');
    if (!container) return;
    const slides = container.querySelectorAll('.ticker-slide');
    const dots = container.querySelectorAll('.slide-dot');
    if (slides.length <= 1) return;

    let currentIdx = 0;
    let timer = null;
    let isHovered = false;

    function goToSlide(nextIdx) {
      if (nextIdx === currentIdx) return;
      const currentSlide = slides[currentIdx];
      const nextSlide = slides[nextIdx];

      // Current slide exits to top
      currentSlide.classList.remove('active', 'next');
      currentSlide.classList.add('prev');

      // Next slide enters from bottom
      nextSlide.classList.remove('prev', 'next');
      nextSlide.classList.add('active');

      // Update dots
      dots.forEach((d, i) => d.classList.toggle('active', i === nextIdx));

      // After transition finishes, reset the exited slide to 'next'
      setTimeout(() => {
        if (currentSlide !== slides[currentIdx]) {
          currentSlide.classList.remove('prev');
          currentSlide.classList.add('next');
        }
      }, 500);

      currentIdx = nextIdx;
    }

    function next() {
      const nextIdx = (currentIdx + 1) % slides.length;
      goToSlide(nextIdx);
    }

    function start() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (!isHovered) next();
      }, 3200);
    }

    container.addEventListener('mouseenter', () => { isHovered = true; });
    container.addEventListener('mouseleave', () => { isHovered = false; });
    container.addEventListener('click', () => { next(); start(); });

    start();
  }

  // ── Initialize on DOM Load ───────────────────────────────
  function init() {
    renderUI();
    initTickerSlider();
    startLiveTickEngine();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  return {
    openPosition,
    closePosition,
    updateLivePrices,
    resetWallet,
    toggleTradeBook,
    renderTradeBook: renderTradeBookContent,
    getPositions: () => positions,
    getWallet: () => wallet,
    getHistory: () => history,
    getAvailableCash: () => getAvailableCash(),
    getMarketStatus,
    toggleHolidayEnforcement,
    isHolidayEnforced: () => enforceHolidays,
  };

})();
var PaperTrading = window.PaperTrading;
