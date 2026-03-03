/**
 * GENESIS — Helius Integration Module
 * Webhooks: реальные on-chain события мгновенно
 * Holders:  точные данные без лимитов
 * Metadata: название, supply, decimals токена
 * Whales:   автоматические алерты на крупные сделки
 *
 * Документация: https://docs.helius.dev
 */

const EventEmitter = require('events');
const axios = require('axios');

// Порог "кита" — транзакции крупнее этой суммы в USD
const WHALE_THRESHOLD_USD = 5000;

class HeliusModule extends EventEmitter {
  constructor() {
    super();
    this.API_KEY      = process.env.HELIUS_API_KEY || null;
    this.TOKEN_MINT   = process.env.TOKEN_ADDRESS  || null;
    this.BASE_URL     = `https://api.helius.xyz/v0`;
    this.RPC_URL      = `https://mainnet.helius-rpc.com/?api-key=${this.API_KEY}`;
    this.tokenMeta    = {};
    this.holderCount  = 0;
    this.webhookId    = null;
    this.isReady      = false;
  }

  async start() {
    if (!this.API_KEY || !this.TOKEN_MINT) {
      console.warn('[Helius] No API_KEY or TOKEN_ADDRESS — Helius disabled');
      return;
    }
    console.log('[Helius] Starting...');
    try {
      await this._fetchTokenMetadata();
      await this._fetchHolders();
      // Регистрируем вебхук если указан WEBHOOK_URL в .env
      if (process.env.WEBHOOK_URL) {
        await this._registerWebhook();
      }
      this.isReady = true;
      console.log(`[Helius] Ready. Token: ${this.tokenMeta.symbol || 'GENESIS'} | Holders: ${this.holderCount}`);
      // Обновляем holders каждые 2 минуты
      setInterval(() => this._fetchHolders(), 120_000);
    } catch (err) {
      console.error('[Helius] Start error:', err.message);
    }
  }

  getHolders()   { return this.holderCount; }
  getTokenMeta() { return this.tokenMeta;   }

  // ═══════════════════════════════════════════
  // Метаданные токена (название, symbol, supply)
  // ═══════════════════════════════════════════
  async _fetchTokenMetadata() {
    const url = `${this.BASE_URL}/token-metadata?api-key=${this.API_KEY}`;
    const res = await axios.post(url, {
      mintAccounts: [this.TOKEN_MINT],
      includeOffChain: true,
      disableCache: false,
    }, { timeout: 8000 });

    const meta = res.data?.[0];
    if (!meta) return;

    this.tokenMeta = {
      name:     meta.onChainMetadata?.metadata?.data?.name     || meta.offChainMetadata?.metadata?.name || 'GENESIS',
      symbol:   meta.onChainMetadata?.metadata?.data?.symbol   || 'GNS',
      decimals: meta.onChainAccountInfo?.accountInfo?.data?.parsed?.info?.decimals || 9,
      supply:   meta.onChainAccountInfo?.accountInfo?.data?.parsed?.info?.supply   || '1000000000',
      logo:     meta.offChainMetadata?.metadata?.image || null,
    };
    console.log(`[Helius] Token: ${this.tokenMeta.name} (${this.tokenMeta.symbol})`);
    this.emit('metadata', this.tokenMeta);
  }

  // ═══════════════════════════════════════════
  // Holders — точный count через Helius RPC
  // ═══════════════════════════════════════════
  async _fetchHolders() {
    try {
      // Используем getTokenLargestAccounts как прокси для общего count
      // Для точного числа используем getProgramAccounts (тяжело) или DAS API
      const url = `${this.BASE_URL}/addresses/${this.TOKEN_MINT}/balances?api-key=${this.API_KEY}`;
      const res = await axios.get(url, { timeout: 8000 });

      // Helius DAS — количество owners
      const dasUrl = `${this.BASE_URL.replace('v0','v1')}/token-accounts?api-key=${this.API_KEY}`;
      const dasRes = await axios.post(dasUrl, {
        mint: this.TOKEN_MINT,
        page: 1,
        limit: 1,
      }, { timeout: 8000 }).catch(() => null);

      if (dasRes?.data?.total) {
        this.holderCount = dasRes.data.total;
        this.emit('holders', this.holderCount);
      }
    } catch (err) {
      console.warn('[Helius] Holders fetch failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════
  // Регистрация вебхука для реалтайм транзакций
  // Helius шлёт POST на твой сервер при каждом трейде
  // ═══════════════════════════════════════════
  async _registerWebhook() {
    try {
      // Сначала удаляем старые вебхуки для этого токена
      await this._cleanupWebhooks();

      const url = `${this.BASE_URL}/webhooks?api-key=${this.API_KEY}`;
      const res = await axios.post(url, {
        webhookURL:   process.env.WEBHOOK_URL + '/webhook/helius',
        transactionTypes: ['SWAP', 'TRANSFER'],
        accountAddresses: [this.TOKEN_MINT],
        webhookType:  'enhanced',
        authHeader:   process.env.WEBHOOK_SECRET || 'genesis-secret',
      }, { timeout: 8000 });

      this.webhookId = res.data?.webhookID;
      console.log(`[Helius] Webhook registered: ${this.webhookId}`);
    } catch (err) {
      console.error('[Helius] Webhook registration failed:', err.message);
    }
  }

  async _cleanupWebhooks() {
    try {
      const url = `${this.BASE_URL}/webhooks?api-key=${this.API_KEY}`;
      const res = await axios.get(url, { timeout: 5000 });
      const hooks = res.data || [];
      for (const hook of hooks) {
        if (hook.accountAddresses?.includes(this.TOKEN_MINT)) {
          await axios.delete(`${this.BASE_URL}/webhooks/${hook.webhookID}?api-key=${this.API_KEY}`);
          console.log(`[Helius] Removed old webhook: ${hook.webhookID}`);
        }
      }
    } catch (_) {}
  }

  // ═══════════════════════════════════════════
  // Обработка входящего вебхука от Helius
  // Вызывается из server.js при POST /webhook/helius
  // ═══════════════════════════════════════════
  processWebhook(transactions, tokenPriceUsd = 0) {
    if (!Array.isArray(transactions)) return;

    for (const tx of transactions) {
      try {
        this._processTx(tx, tokenPriceUsd);
      } catch (err) {
        console.error('[Helius] processTx error:', err.message);
      }
    }
  }

  _processTx(tx, tokenPriceUsd) {
    const type = tx.type; // 'SWAP', 'TRANSFER', etc.
    const sig  = tx.signature?.slice(0, 12) + '...' || 'unknown';
    const ts   = new Date(tx.timestamp * 1000).toUTCString().slice(17, 25);

    // Для SWAP — определяем направление (buy/sell)
    if (type === 'SWAP') {
      const swaps = tx.events?.swap;
      if (!swaps) return;

      // Ищем наш токен в swap
      const nativeIn  = swaps.nativeInput;
      const nativeOut = swaps.nativeOutput;
      const tokensIn  = swaps.tokenInputs  || [];
      const tokensOut = swaps.tokenOutputs || [];

      const ourTokenIn  = tokensIn.find(t => t.mint === this.TOKEN_MINT);
      const ourTokenOut = tokensOut.find(t => t.mint === this.TOKEN_MINT);

      const isBuy  = !!ourTokenOut; // получили наш токен → buy
      const isSell = !!ourTokenIn;  // отдали наш токен → sell

      if (!isBuy && !isSell) return;

      const tokenAmount = isBuy
        ? (ourTokenOut.rawTokenAmount?.tokenAmount / Math.pow(10, this.tokenMeta.decimals || 9)) || 0
        : (ourTokenIn.rawTokenAmount?.tokenAmount  / Math.pow(10, this.tokenMeta.decimals || 9)) || 0;

      const usdValue = tokenAmount * tokenPriceUsd;
      const isWhale  = usdValue >= WHALE_THRESHOLD_USD;
      const signer   = tx.feePayer?.slice(0, 6) + '...' + tx.feePayer?.slice(-4) || 'unknown';

      const event = {
        type:        isBuy ? 'BUY' : 'SELL',
        signer,
        tokenAmount: this._fmtTokens(tokenAmount),
        usdValue:    '$' + usdValue.toFixed(0),
        isWhale,
        sig,
        ts,
        raw: { tokenAmount, usdValue },
      };

      // Эмитируем событие
      this.emit('swap', event);
      if (isWhale) this.emit('whale', event);

      // Лог для публичного лога
      const logText = isWhale
        ? `🐋 WHALE ${isBuy ? 'BUY' : 'SELL'}: ${event.tokenAmount} GENESIS (~${event.usdValue}) by ${signer}`
        : `${isBuy ? '🟢 BUY' : '🔴 SELL'}: ${event.tokenAmount} GENESIS by ${signer}`;

      this.emit('log', {
        type: isWhale ? 'action' : (isBuy ? 'vote' : 'decision'),
        text: logText,
        event,
      });

      console.log(`[Helius] ${logText} | tx: ${sig}`);
    }

    // TRANSFER — крупные переводы
    if (type === 'TRANSFER') {
      const transfers = tx.tokenTransfers || [];
      const our = transfers.filter(t => t.mint === this.TOKEN_MINT);
      for (const transfer of our) {
        const amount = transfer.tokenAmount || 0;
        const usdVal = amount * tokenPriceUsd;
        if (usdVal >= WHALE_THRESHOLD_USD) {
          const event = {
            type: 'TRANSFER',
            from: transfer.fromUserAccount?.slice(0,6) + '...' || '?',
            to:   transfer.toUserAccount?.slice(0,6)   + '...' || '?',
            tokenAmount: this._fmtTokens(amount),
            usdValue: '$' + usdVal.toFixed(0),
            isWhale: true,
            sig,
          };
          this.emit('whale', event);
          this.emit('log', {
            type: 'action',
            text: `🐋 LARGE TRANSFER: ${event.tokenAmount} GENESIS from ${event.from} → ${event.to} (~${event.usdValue})`,
          });
        }
      }
    }
  }

  _fmtTokens(n) {
    if (n >= 1_000_000) return (n/1_000_000).toFixed(2)+'M';
    if (n >= 1_000)     return (n/1_000).toFixed(1)+'K';
    return n.toFixed(0);
  }
}

module.exports = HeliusModule;
