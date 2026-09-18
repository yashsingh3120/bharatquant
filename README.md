# BharatQuant — Quantum AI Stock Prediction Dashboard 🚀

Complete institutional-grade AI stock trading platform with real-time NSE price tracking, XGBoost inference, multi-factor quant confluence, and dynamic Trade Setups (Targets & Stop-Loss).

## Features
- **100% Real Live Market Prices**: High-speed Python backend proxy fetching real-time NSE data.
- **Quantum Confluence AI Engine**: 500-tree XGBoost models combined with Trend (EMAs), Momentum (RSI/MACD), Institutional Volume, and Market Regime (Nifty 50 & India VIX).
- **Automated Trade Setups**: Instant calculation of Entry Zone, Stop-Loss (SL), Target 1 (T1), Target 2 (T2), and Risk-to-Reward (R:R).
- **Signal Grades**: `Grade A+ Institutional`, `Grade A High Conviction`, `Grade B+ Pullback`, `Grade B Neutral`.
- **TradingView Interactive Charts**: Clean candlestick visualizations with timeframe toggles (5D to 1Y).
- **Auto-Refresh Engine**: Continuous 30-second live prediction updates.

## Local Running
```bash
python server.py
```
Open `http://localhost:8080` in your browser.

## 1-Click Cloud Deployment
- **Render**: Connect repository and select Web Service (uses `render.yaml`).
- **Railway / Koyeb / Cloud Run**: Uses included `Dockerfile`.
