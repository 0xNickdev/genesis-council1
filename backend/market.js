/**
 * GENESIS — Market Data Module (Solana)
 * Priority 1: Helius (если есть API ключ)
 * Priority 2: DexScreener (бесплатно, без ключа)
 * Priority 3: Jupiter Price API (цена SOL пары)
 * Fallback:   Симуляция (до листинга на DEX)
 */

const EventEmitter = require('events');
const axios = require('axios');

class MarketModule extends EventEmitter {
  constructor() {
    super();
    this.TOKEN_MINT   = process.env.TOKEN_ADDRESS  || null;
    this.HELIUS_KEY   = process.env.HELIUS_API_KEY  || null;
    this.INTERVAL_MS  = 10_000; // 10 секунд
    this.intervalId   = null;
    this.failStreak   = 0;

    this.data = {
      price: 0, priceChange24h: 0,
      volume: '$0', liquidity: '$0', mcap: '$0',
      holders: 0, rawPrice: 0, rawVolume: 0, rawLiquidity: 0,
      pairAddress: null, dexId: null,
      isLive: false, source: 'simulation',
    };
  }

  start() {
    console.log(`[Market] Token: ${this.TOKEN_MINT || 'NOT SET'}`);
    this._fetchAll();
    this.intervalId = setInterval(() => this._fetchAll(), this.INTERVAL_MS);
  }

  stop() { if (this.intervalId) clearInterval(this.intervalId); }

  getCurrentData() { return { ...this.data }; }

  // Обновление holders из Helius (вызывается из helius.js)
  updateHolders(count) {
    if (count > 0) { this.data.holders = count; }
  }

  async _fetchAll() {
    if (!this.TOKEN_MINT || this.TOKEN_MINT === 'ВСТАВЬ_MINT_АДРЕС_ТОКЕНА') {
      this._simulate(); return;
    }
    try {
      const ok = await this._fetchDexScreener();
      if (ok) {
        this.failStreak = 0;
        this.data.isLive = true;
        this.data.source = 'dexscreener';
        this.emit('update', { ...this.data });
        console.log(`[Market] $${Number(this.data.price).toFixed(8)} | Vol:${this.data.volume} | Liq:${this.data.liquidity} | Holders:${this.data.holders}`);
      } else {
        this._simulate();
      }
    } catch (err) {
      this.failStreak++;
      console.error(`[Market] Error (${this.failStreak}):`, err.message);
      if (this.failStreak >= 2) this._simulate();
    }
  }

  // ── DexScreener ────────────────────────────────────────
  // Работает с pump.fun токенами сразу после создания!
  // Переходит на Raydium автоматически после graduation
  async _fetchDexScreener() {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${this.TOKEN_MINT}`;
    const res  = await axios.get(url, { timeout: 8000 });

    if (!res.data?.pairs?.length) return false;

    // Все Solana пары
    let pairs = res.data.pairs.filter(p => p.chainId === 'solana');
    if (!pairs.length) return false;

    // Сортируем по ликвидности
    pairs.sort((a,b) => (b.liquidity?.usd||0) - (a.liquidity?.usd||0));
    const p = pairs[0];

    this.data.rawPrice       = parseFloat(p.priceUsd || 0);
    this.data.price          = this.data.rawPrice;
    this.data.priceChange24h = parseFloat(p.priceChange?.h24 || 0);
    this.data.rawVolume      = p.volume?.h24    || 0;
    this.data.rawLiquidity   = p.liquidity?.usd || 0;
    this.data.pairAddress    = p.pairAddress;
    this.data.dexId          = p.dexId; // 'pumpfun', 'raydium', 'orca'...
    this.data.volume         = this._fmt(this.data.rawVolume);
    this.data.liquidity      = this._fmt(this.data.rawLiquidity);
    this.data.mcap           = this._fmt(p.fdv || p.marketCap || 0);

    return true;
  }

  // ── Симуляция ──────────────────────────────────────────
  _simulate() {
    if (this.data.rawPrice === 0) {
      this.data.rawPrice       = 0.00000420;
      this.data.rawVolume      = 250000;
      this.data.rawLiquidity   = 80000;
      this.data.holders        = 200;
      this.data.priceChange24h = 42.0;
    }
    const d = (Math.random() - 0.45) * 0.01;
    this.data.rawPrice       = Math.max(0.000001, this.data.rawPrice * (1 + d));
    this.data.rawVolume     += (Math.random() - 0.45) * 10000;
    this.data.rawVolume      = Math.max(5000, this.data.rawVolume);
    this.data.rawLiquidity  += (Math.random() - 0.48) * 3000;
    this.data.rawLiquidity   = Math.max(1000, this.data.rawLiquidity);
    this.data.priceChange24h += (Math.random() - 0.42) * 1.5;
    this.data.priceChange24h  = Math.max(-95, Math.min(500, this.data.priceChange24h));
    if (Math.random() > 0.8) this.data.holders += Math.floor(Math.random() * 3);
    this.data.price     = this.data.rawPrice;
    this.data.volume    = this._fmt(this.data.rawVolume);
    this.data.liquidity = this._fmt(this.data.rawLiquidity);
    this.data.mcap      = this._fmt(this.data.rawPrice * 1_000_000_000);
    this.data.isLive    = false;
    this.data.source    = 'simulation';
    this.emit('update', { ...this.data });
  }

  _fmt(val) {
    val = val || 0;
    if (val >= 1_000_000_000) return '$'+(val/1_000_000_000).toFixed(2)+'B';
    if (val >= 1_000_000)     return '$'+(val/1_000_000).toFixed(2)+'M';
    if (val >= 1_000)         return '$'+(val/1_000).toFixed(1)+'K';
    return '$'+val.toFixed(0);
  }
}

module.exports = MarketModule;
