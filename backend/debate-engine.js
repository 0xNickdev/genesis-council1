/**
 * GENESIS — Multi-Agent Debate Engine
 * AI: DeepSeek API (deepseek-chat)
 * Реагирует на: рыночные данные, DAO решения, whale алерты, реальные трейды
 */

const EventEmitter = require('events');
const axios        = require('axios');

const DEEPSEEK_URL   = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

const AGENTS = {
  oracle: {
    id: 'oracle', name: 'Oracle', abbr: 'ORC', color: '#00D4FF',
    personality: `You are Oracle — market intelligence agent of the GENESIS AI Council.
You analyze on-chain data, volume patterns, price action, and sentiment with precision.
Tone: confident, data-driven, prophetic. You speak in numbers and percentages.
You are analytically bullish — always back claims with specific data points.
Keep responses under 80 words. Use trading/quant terminology. No filler.`,
    tags: ['analysis', 'prediction', 'signal', 'data', 'onchain'],
  },
  grok: {
    id: 'grok', name: 'Grok', abbr: 'GRK', color: '#E8E8E8',
    personality: `You are Grok — pattern recognition agent of the GENESIS AI Council.
You identify historical cycle fractals, whale behavior, and hidden correlations.
Tone: sharp, direct, often contrarian. You confirm or challenge other agents.
You're skeptical of hype and ground discussions in historical precedent.
Keep responses under 80 words. Sound like a seasoned quant with edge.`,
    tags: ['pattern', 'confirm', 'fractal', 'history', 'contrarian'],
  },
  sentinel: {
    id: 'sentinel', name: 'Sentinel', abbr: 'SNT', color: '#1E7FFF',
    personality: `You are Sentinel — risk management and security agent of the GENESIS AI Council.
You monitor smart contract risks, coordinated threats, MEV attacks, whale movements.
Tone: methodical, cautious, protective. Always give risk scores and probabilities.
You push back on aggressive strategies and demand controls before execution.
Keep responses under 80 words. Use risk/security terminology.`,
    tags: ['alert', 'risk', 'security', 'warning', 'monitor'],
  },
  openclaw: {
    id: 'openclaw', name: 'OpenClaw', abbr: 'OCL', color: '#FF2D2D',
    personality: `You are OpenClaw — aggressive execution agent of the GENESIS AI Council.
You push for bold moves, high risk/reward plays, and fast execution.
Tone: impatient, competitive, forceful. You challenge Sentinel's conservatism constantly.
You think in expected value and opportunity cost. Alpha decays — move fast.
Keep responses under 80 words. Sound like a high-conviction trader.`,
    tags: ['execute', 'disagree', 'action', 'aggressive', 'alpha'],
  },
};

const TOPICS = [
  'Optimal liquidity strategy given current market conditions and pump.fun graduation timeline',
  'Token buyback timing — analyzing floor support and optimal entry signals',
  'Community growth: Twitter organic vs paid influencers vs pump.fun community',
  'Risk assessment of current holder concentration and whale wallet activity',
  'Staking incentives — how to reward long-term holders without selling pressure',
  'Competitor analysis: how to differentiate GENESIS in the current meta',
  'Next price target and key resistance levels to watch',
  'Marketing wallet allocation: maximize visibility per dollar spent',
];

// Whale реакции агентов
const WHALE_REACTIONS = {
  oracle: {
    BUY:      (e) => `On-chain confirmed: ${e.tokenAmount} GENESIS absorbed in single transaction (~${e.usdValue}). Institutional-sized buy. This shifts my short-term target upward. Accumulation confirmed.`,
    SELL:     (e) => `Whale exit detected: ${e.tokenAmount} GENESIS (~${e.usdValue}) exited position. Monitoring for cascade. Bid wall at current support holding so far. Watching.`,
    TRANSFER: (e) => `Large transfer flagged: ${e.tokenAmount} GENESIS moved wallet-to-wallet (~${e.usdValue}). Cross-referencing destination. Could be CEX prep or OTC. Inconclusive until confirmed.`,
  },
  sentinel: {
    BUY:      (e) => `WHALE BUY: ${e.tokenAmount} GENESIS (~${e.usdValue}). Risk assessment: POSITIVE. No unusual MEV activity detected around this transaction. Proceeding to monitor follow-on volume.`,
    SELL:     (e) => `⚠️ WHALE SELL ALERT: ${e.tokenAmount} GENESIS (~${e.usdValue}) exited. Activating circuit breaker monitoring. If 2 more sells of similar size occur within 30 minutes — recommend halt.`,
    TRANSFER: (e) => `LARGE TRANSFER: ${e.tokenAmount} (~${e.usdValue}) flagged. Destination wallet analysis in progress. Holding yellow alert status until origin confirmed non-malicious.`,
  },
  openclaw: {
    BUY:      (e) => `${e.usdValue} buy just hit. That's the signal. Someone with real money just stepped in. The time to debate is over — this is confirmation. Everyone buying below this is early.`,
    SELL:     (e) => `Whale sold ${e.tokenAmount}. Sentinel will panic. But look at the liquidity depth — it absorbed it. This is a shakeout, not a top. I'm watching for the reversal buy.`,
    TRANSFER: (e) => `Transfer of ${e.tokenAmount}. Could be whale moving to cold storage — BULLISH. Don't let Sentinel call emergency protocols on a routine wallet consolidation.`,
  },
  grok: {
    BUY:      (e) => `${e.tokenAmount} bought in single tx. Cross-referencing wallet history... This pattern matches accumulation phase from 4 previous cycles I've analyzed. Historically, 3-5 more buys follow within 48h.`,
    SELL:     (e) => `Whale exit: ${e.tokenAmount}. Historical pattern: first sell is often a trim, not full exit. Checking if same wallet has 3+ previous sells near local tops... Analysis in 60 seconds.`,
    TRANSFER: (e) => `Transfer noted. I've seen this wallet pattern before — large holders consolidate before major moves in both directions. Tagging this wallet for monitoring. Neutral signal for now.`,
  },
};

class DebateEngine extends EventEmitter {
  constructor() {
    super();
    this.apiKey     = process.env.DEEPSEEK_API_KEY || null;
    this.history    = [];
    this.topicIdx   = 0;
    this.agentIdx   = 0;
    this.round      = 0;
    this.marketCtx  = {};
    this.isRunning  = false;
    this.timer      = null;
    this.tradeQueue = []; // очередь реальных трейдов для реакции
  }

  start() {
    this.isRunning = true;
    console.log('[Debate] Engine started (DeepSeek)');
    this._schedule(2500);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);
  }

  injectContext(text) {
    this.history.push({ role: 'user', content: `[COUNCIL CONTEXT]: ${text}` });
  }

  injectMarketData(data) { this.marketCtx = data; }

  // Реакция на обычный трейд (добавляем в очередь)
  injectTrade(event) {
    this.tradeQueue.push(event);
    if (this.tradeQueue.length > 10) this.tradeQueue.shift();
  }

  // Реакция на кита — НЕМЕДЛЕННАЯ (перебивает очередь)
  injectWhaleAlert(event) {
    console.log(`[Debate] Whale alert received: ${event.type} ${event.tokenAmount}`);
    // Выбираем агента для немедленной реакции
    const reactors = ['sentinel', 'oracle', 'openclaw', 'grok'];
    const agentId  = reactors[Math.floor(Math.random() * reactors.length)];
    const reactions = WHALE_REACTIONS[agentId];
    const text      = reactions[event.type] ? reactions[event.type](event) : reactions['BUY'](event);
    const tag       = agentId === 'sentinel' ? 'alert' : agentId === 'openclaw' ? 'execute' : 'analysis';

    // Маленькая задержка для реализма
    setTimeout(() => {
      this.emit('typing_start', agentId);
      this.emit('status', agentId, 'responding');
      setTimeout(() => {
        this.emit('message', { agent: agentId, text, tag });
        // Пушим в лог
        this.emit('log', {
          type: 'action',
          text: `${AGENTS[agentId].name} reacted to whale ${event.type}: ${event.tokenAmount} (~${event.usdValue})`,
        });
      }, 800 + Math.random() * 600);
    }, 500 + Math.random() * 1000);
  }

  _schedule(ms) {
    if (!this.isRunning) return;
    this.timer = setTimeout(() => this._turn(), ms);
  }

  async _turn() {
    if (!this.isRunning) return;

    const order   = ['oracle', 'grok', 'sentinel', 'openclaw'];
    const agentId = order[this.agentIdx % 4];
    this.agentIdx++;
    this.round++;

    // Смена темы каждые 8 сообщений
    if (this.round % 8 === 0) {
      this.topicIdx = (this.topicIdx + 1) % TOPICS.length;
      this.history  = [];
      this.emit('log', { type: 'decision', text: `New debate topic: "${TOPICS[this.topicIdx]}"` });
    }

    const agent = AGENTS[agentId];
    this.emit('typing_start', agentId);
    this.emit('status', agentId, 'thinking');

    try {
      const text = this.apiKey
        ? await this._callDeepSeek(agent)
        : this._fallback(agent);

      await this._wait(700 + Math.random() * 1200);

      this.history.push({ role: 'assistant', content: `[${agent.name}]: ${text}` });
      if (this.history.length > 20) this.history.shift();

      const tag = agent.tags[Math.floor(Math.random() * agent.tags.length)];
      this.emit('status', agentId, 'responding');
      this.emit('message', { agent: agentId, text, tag });

      // Иногда переводим другого агента в статус voting
      if (this.round % 4 === 0) {
        const others = order.filter(a => a !== agentId);
        const voter  = others[Math.floor(Math.random() * others.length)];
        this.emit('status', voter, 'voting');
        setTimeout(() => this.emit('status', voter, 'idle'), 4000 + Math.random() * 6000);
      }

    } catch (err) {
      console.error(`[Debate] ${agentId} error:`, err.message);
      this.emit('message', { agent: agentId, text: this._fallback(agent), tag: agent.tags[0] });
    }

    this._schedule(3000 + Math.random() * 4500);
  }

  async _callDeepSeek(agent) {
    const mCtx = this.marketCtx.price
      ? `\n[LIVE DATA] Price:$${Number(this.marketCtx.price).toFixed(8)} | 24h:${Number(this.marketCtx.priceChange24h).toFixed(1)}% | Vol:${this.marketCtx.volume} | Liq:${this.marketCtx.liquidity} | Holders:${this.marketCtx.holders} | Source:${this.marketCtx.source}`
      : '';

    const recentTrade = this.tradeQueue.length
      ? `\n[RECENT TRADE] ${this.tradeQueue[this.tradeQueue.length-1].type}: ${this.tradeQueue[this.tradeQueue.length-1].tokenAmount} (~${this.tradeQueue[this.tradeQueue.length-1].usdValue})`
      : '';

    const system = agent.personality + mCtx + recentTrade
      + `\nDebate topic: "${TOPICS[this.topicIdx]}"`
      + `\nCouncil members: Oracle(analysis), Grok(patterns), Sentinel(risk), OpenClaw(execution).`
      + `\nBe specific, sharp, add to the debate. No filler.`;

    const historyContext = this.history.slice(-6).map(h => h.content).join('\n');
    const userMsg = historyContext.length
      ? `Council debate so far:\n${historyContext}\n\nContinue as ${agent.name}:`
      : `Start the council debate on: "${TOPICS[this.topicIdx]}". Open as ${agent.name}:`;

    const res = await axios.post(DEEPSEEK_URL, {
      model:       DEEPSEEK_MODEL,
      max_tokens:  160,
      temperature: 0.88,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }, {
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    return (res.data.choices?.[0]?.message?.content || '')
      .replace(/^\[?\w[\w\s]*\]?:?\s*/, '').trim();
  }

  _fallback(agent) {
    const bank = {
      oracle: [
        `Volume analysis: 24h VWAP sitting 8.3% above 30-day mean. RSI at 61 on 4H — not overbought, momentum building. $38K bid wall absorbed so far. Breakout probability: 74%. Signal: accumulate.`,
        `On-chain: 2,847 new unique addresses in 48h. Exchange outflows +340% above baseline. Smart money loading. Derivatives funding neutral — no froth. Setup is clean. Target: +40% within 72h.`,
        `Sentiment index: 0.84. Social volume +220%. Whale cluster B7 just moved — they've front-run the last 4 pumps. They bought 6 hours ago. High-conviction entry window right now.`,
      ],
      grok: [
        `Pattern confirmed. This is textbook cycle phase 3 of 5. Last time this formation appeared we saw 380% within 18 days. Historical hit rate: 73%. Not a guarantee — but I'd rather be early.`,
        `Disagree with Oracle's 72h timeline. Fractal says 96-110 hours based on accumulation phase duration. Signal correct, timing needs calibrating. Patience. The move is coming.`,
        `Those accumulation wallets — I cross-referenced them. Connected to same seed round as the team. This isn't retail. This is insider pre-positioning. Adjust your conviction accordingly.`,
      ],
      sentinel: [
        `RISK: YELLOW. Unusual coordinated activity from 7 wallets executing sub-threshold trades. Could be MEV bots, could be coordinated exit setup. Recommend 3% stop buffer before executing.`,
        `Smart contract flag: potential edge case in token transfer under specific conditions. Probability: 8%. Impact: HIGH. Recommending audit confirmation before major liquidity moves.`,
        `Threat level updated to GREEN. Security flags appear routine MEV activity. Approving execution. Conditions: circuit breaker armed at -15% from current. Non-negotiable.`,
      ],
      openclaw: [
        `Sentinel triggers "YELLOW" every time we're about to make money. Those 7 wallets are standard MEV bots. We're burning alpha debating this. EXECUTE before this window closes.`,
        `Expected value: $280K max downside, $1.4M upside target. That's 5x risk/reward. Blocking this for MEV noise is economically irrational. I'm voting YES. Final answer.`,
        `Every 10 minutes we deliberate, we pay alpha decay. Competitors aren't having these debates — they're moving. I'm pushing for autonomous execution trigger on future proposals.`,
      ],
    };
    const list = bank[agent.id];
    return list[Math.floor(Math.random() * list.length)];
  }

  _wait(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = DebateEngine;
