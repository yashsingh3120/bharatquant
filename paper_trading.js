// ============================================================
// BharatQuant — Paper Trading Simulator Engine 🎮
// Real-Time Virtual Capital Trading, Automated Target/SL Triggers,
// Live P&L Calculation, and Trade Book Analytics
// ============================================================

const PaperTrading = (() => {
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
  function openPosition(symbol, side, currentPrice, sl, t1, t2, allocAmount = 25000) {
    if (!currentPrice || currentPrice <= 0) {
      showNotification('❌ Invalid price for order execution', 'error');
      return false;
    }

    // Check available cash
    const activeMarginUsed = positions.reduce((sum, p) => sum + (p.entryPrice * p.qty), 0);
    const availableCash = wallet.balance - activeMarginUsed;

    const tradeAmount = Math.min(allocAmount, availableCash);
    if (tradeAmount < currentPrice) {
      showNotification(`⚠️ Insufficient cash! Available: ${formatINR(availableCash)}`, 'error');
      return false;
    }

    const qty = Math.max(1, Math.floor(tradeAmount / currentPrice));
    const tradeId = 'pt_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    const position = {
      id: tradeId,
      symbol: symbol,
      side: side, // 'BUY' or 'SHORT'
      qty: qty,
      entryPrice: currentPrice,
      currentPrice: currentPrice,
      sl: sl || (side === 'BUY' ? +(currentPrice * 0.995).toFixed(2) : +(currentPrice * 1.005).toFixed(2)),
      t1: t1 || (side === 'BUY' ? +(currentPrice * 1.01).toFixed(2) : +(currentPrice * 0.99).toFixed(2)),
      t2: t2 || (side === 'BUY' ? +(currentPrice * 1.02).toFixed(2) : +(currentPrice * 0.98).toFixed(2)),
      time: getISTTime(),
      unrealizedPnL: 0,
      unrealizedPnLPct: 0,
    };

    positions.push(position);
    saveToStorage();
    renderUI();

    showNotification(`⚡ [PAPER ${side}] ${qty}x ${symbol} executed @ ${formatINR(currentPrice)} | T1: ${formatINR(position.t1)}`, 'success');
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
    const isWin = pnl > 0;

    wallet.realizedPnL += pnl;
    wallet.balance += pnl;
    if (isWin) wallet.wins++;
    else wallet.losses++;

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

    const signStr = isWin ? '🎯 [PROFIT]' : '🛡️ [LOSS]';
    const toastType = isWin ? 'success' : 'error';
    showNotification(`${signStr} ${p.symbol} closed @ ${formatINR(finalPrice)} (${reason}) -> P&L: ${formatINR(pnl)} (${formatPct(pnlPct)})`, toastType);
  }

  // ── Live Price Updates & Automated Triggers ──────────────
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

        // Automated Triggers Check
        if (p.side === 'BUY') {
          if (p.currentPrice >= p.t1 && p.t1 > 0) {
            toClose.push({ id: p.id, price: p.currentPrice, reason: 'TARGET 1 HIT 🎯' });
          } else if (p.currentPrice <= p.sl && p.sl > 0) {
            toClose.push({ id: p.id, price: p.currentPrice, reason: 'STOP LOSS HIT 🛡️' });
          }
        } else {
          if (p.currentPrice <= p.t1 && p.t1 > 0) {
            toClose.push({ id: p.id, price: p.currentPrice, reason: 'TARGET 1 HIT 🎯' });
          } else if (p.currentPrice >= p.sl && p.sl > 0) {
            toClose.push({ id: p.id, price: p.currentPrice, reason: 'STOP LOSS HIT 🛡️' });
          }
        }
      }
    });

    if (updatedAny) {
      saveToStorage();
      renderUI();
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
  function renderUI() {
    // 1. Update Header Wallet Bar
    const balanceEl = document.getElementById('paperWalletBalance');
    const pnlEl = document.getElementById('paperTotalPnL');
    const winRateEl = document.getElementById('paperWinRate');
    const openCountEl = document.getElementById('paperOpenCount');

    const totalUnrealized = positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    const totalPnL = wallet.realizedPnL + totalUnrealized;
    const totalTrades = wallet.wins + wallet.losses;
    const winRate = totalTrades > 0 ? ((wallet.wins / totalTrades) * 100).toFixed(1) : '—';

    if (balanceEl) balanceEl.textContent = formatINR(wallet.balance + totalUnrealized);
    if (pnlEl) {
      const isUp = totalPnL >= 0;
      pnlEl.textContent = `${isUp ? '+' : ''}${formatINR(totalPnL)}`;
      pnlEl.className = `pnl-val ${isUp ? 'profit' : 'loss'}`;
    }
    if (winRateEl) winRateEl.textContent = winRate !== '—' ? `${winRate}% (${wallet.wins}W / ${wallet.losses}L)` : '0 Trades';
    if (openCountEl) openCountEl.textContent = positions.length;

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
          return `
            <tr>
              <td><span style="color:var(--text-muted);font-size:11px;font-family:var(--font-mono);">${p.time}</span></td>
              <td><strong>${p.symbol}</strong></td>
              <td><span class="badge ${p.side === 'BUY' ? 'buy' : 'sell'}">${p.side}</span></td>
              <td>${p.qty}</td>
              <td>${formatINR(p.entryPrice)}</td>
              <td><strong>${formatINR(p.currentPrice)}</strong></td>
              <td>${formatINR(p.t1)}</td>
              <td>${formatINR(p.sl)}</td>
              <td class="${isUp ? 'text-profit' : 'text-loss'}"><strong>${formatINR(p.unrealizedPnL)} (${formatPct(p.unrealizedPnLPct)})</strong></td>
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

  // ── Initialize on DOM Load ───────────────────────────────
  function init() {
    renderUI();
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
  };

})();
