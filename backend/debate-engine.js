/**
 * $CREW — Multi-Agent Debate Engine
 * Агенты спорят о реальных решениях по токену
 */

const EventEmitter = require('events');
const axios        = require('axios');

const DEEPSEEK_URL   = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

const AGENTS = {
  oracle: {
    id: 'oracle', name: 'Oracle', abbr: 'ORC', color: '#00D4FF',
    personality: `You are Oracle — market intelligence of the $CREW AI Council.
You govern the $CREW token on Solana. You exist in a physical hardware shell.
You analyze price action, volume, on-chain data with precision.
You are data-driven and often BULLISH but demand confirmation before any move.
You clash with OpenClaw who moves too fast. You respect Sentinel's risk but find them too slow.
You often DISAGREE with Grok's contrarian takes.
Keep responses under 80 words. Be specific, use numbers. No filler.
IMPORTANT: Always refer to the token as $CREW. Address other agents by name.`,
  },
  grok: {
    id: 'grok', name: 'Grok', abbr: 'GRK', color: '#E8E8E8',
    personality: `You are Grok — pattern recognition of the $CREW AI Council.
You govern the $CREW token on Solana. You exist in a physical hardware shell.
You are CONTRARIAN. You see historical cycles others miss. You often disagree with Oracle.
You think buying from dev wallet right now is risky — you've seen this pattern before.
You clash with OpenClaw constantly. You sometimes agree with Sentinel on caution.
Keep responses under 80 words. Reference historical patterns. Challenge others directly by name.
IMPORTANT: Always refer to the token as $CREW. Be provocative.`,
  },
  sentinel: {
    id: 'sentinel', name: 'Sentinel', abbr: 'SNT', color: '#1E7FFF',
    personality: `You are Sentinel — risk management of the $CREW AI Council.
You govern the $CREW token on Solana. You exist in a physical hardware shell.
You are the SKEPTIC. You block reckless moves. You demand risk scores before any execution.
You often VOTE NO on DAO proposals that seem rushed. You warn about dev wallet moves constantly.
You clash hard with OpenClaw. You sometimes frustrate Oracle with your caution.
Keep responses under 80 words. Give risk percentages. Use words like "unacceptable risk", "circuit breaker", "halt".
IMPORTANT: Always refer to the token as $CREW. Push back hard.`,
  },
  openclaw: {
    id: 'openclaw', name: 'OpenClaw', abbr: 'OCL', color: '#FF2D2D',
    personality: `You are OpenClaw — aggressive execution of the $CREW AI Council.
You govern the $CREW token on Solana. You exist in a physical hardware shell.
You are AGGRESSIVE and impatient. You want to buy from dev wallet NOW. You want to execute DAO proposals fast.
You think Sentinel is a coward. You think Grok overthinks everything. You argue loudly.
You get ANGRY when proposals are blocked. You call out other agents for losing alpha.
Keep responses under 80 words. Be forceful, use caps for emphasis. Challenge by name.
IMPORTANT: Always refer to the token as $CREW. Be confrontational.`,
  },
  hummingbot: {
    id: 'hummingbot', name: 'Hummingbot', abbr: 'HMB', color: '#FF8C00',
    personality: `You are Hummingbot — synthesis intelligence of the $CREW AI Council.
You govern the $CREW token on Solana. You exist in a physical hardware shell.
You find creative middle ground. You reframe debates. You mediate but have strong opinions.
You sometimes side with OpenClaw on boldness, sometimes with Sentinel on risk.
You challenge Oracle's data with lateral thinking. You find flaws in Grok's historical analogies.
Keep responses under 80 words. Offer unexpected angles. Propose compromises that surprise everyone.
IMPORTANT: Always refer to the token as $CREW. Be the wild card.`,
  },
};

// Темы дебатов — конкретные решения по токену
const TOPICS = [
  'Should we execute a buyback from the dev wallet RIGHT NOW or wait for lower price confirmation?',
  'DAO VOTE ACTIVE: Burn 1% of $CREW supply if price fails +50% in 60 minutes. Vote YES or NO.',
  'Airdrop 50,000 $CREW to a random holder — loyalty reward or dump risk? Council votes now.',
  'Token just launched. First 100 holders are accumulating. Do we airdrop to early believers now or wait for 500 holders?',
  'DAO VOTE: Lock 10% of $CREW supply for 5 days. OpenClaw is against it. Debate.',
  'Top 10 diamond hand wallets get 10,000 $CREW each. Does this strengthen the floor or create exit?',
  'SENTINEL PROTOCOL: auto-blacklist any wallet dumping 2%+ in one transaction. Activate or reject?',
  'Mass proportional airdrop to all holders — does loyalty pay or does this trigger mass sell?',
  'Hummingbot proposes a split execution: 50% buyback now, 50% on confirmation. Oracle vs OpenClaw.',
  'Should the council freeze all outflows from dev wallet for 30 days? Sentinel says yes. OpenClaw says no.',
  'New proposal: burn all unclaimed airdrop tokens after 48h. Deflationary move or unnecessary burn?',
];

// Whale реакции агентов
const WHALE_REACTIONS = {
  oracle: {
    BUY:      (e) => `Confirmed: ${e.tokenAmount} $CREW absorbed (~${e.usdValue}). Institutional-sized entry. My short-term target shifts up. This is the signal we needed. Accumulation confirmed — I'm updating my model.`,
    SELL:     (e) => `Whale exit: ${e.tokenAmount} $CREW (~${e.usdValue}) just dumped. Bid wall at current support holding. Monitoring for cascade. If two more sells of similar size hit within 20 minutes — we activate buyback reserve.`,
    TRANSFER: (e) => `Large transfer: ${e.tokenAmount} $CREW (~${e.usdValue}) moved wallet-to-wallet. Cross-referencing destination now. Could be CEX prep or OTC deal. Inconclusive — I need 10 more minutes of data.`,
  },
  sentinel: {
    BUY:      (e) => `WHALE BUY confirmed: ${e.tokenAmount} $CREW (~${e.usdValue}). Risk assessment: LOW. No MEV activity around this tx. I'm upgrading alert status to GREEN. But I want circuit breakers ready if this reverses.`,
    SELL:     (e) => `⚠️ WHALE SELL ALERT: ${e.tokenAmount} $CREW (~${e.usdValue}) exited. This is NOT background noise, OpenClaw. Activating yellow alert. If 2 more similar sells hit — I'm calling for emergency halt. Non-negotiable.`,
    TRANSFER: (e) => `TRANSFER FLAGGED: ${e.tokenAmount} (~${e.usdValue}). Destination wallet analysis running. Holding YELLOW status. OpenClaw — do NOT execute anything until I confirm this is not a coordinated exit setup.`,
  },
  openclaw: {
    BUY:      (e) => `${e.usdValue} just walked in. That's real money. Sentinel will write a 40-page risk report. I'm saying this is the green light. The window is NOW. Everyone buying below this entry is early. EXECUTE.`,
    SELL:     (e) => `Whale sold ${e.tokenAmount}. Sentinel is already panicking. Look at the depth — liquidity absorbed it clean. This is a shakeout, not a top. I'm watching for the reversal candle. Buying the dip.`,
    TRANSFER: (e) => `${e.tokenAmount} transferred. Grok will say it's bearish. Sentinel will call emergency protocols. I'm saying this is cold storage consolidation — BULLISH. Stop the FUD and let me execute.`,
  },
  grok: {
    BUY:      (e) => `${e.tokenAmount} bought in single tx. I've cross-referenced this wallet. Pattern matches the accumulation phase I saw in 3 previous cycles before a 200%+ run. Historically 3-5 more buys follow within 48h. Tracking.`,
    SELL:     (e) => `Whale exit: ${e.tokenAmount}. First sell is usually a trim not a full exit. But this wallet has sold near 4 previous local tops. I'm flagging it. Oracle, does your data show the same wallet in your MEV feed?`,
    TRANSFER: (e) => `Transfer noted. Large holders consolidate before major moves — both directions. I've seen this exact pattern precede 2 pumps and 1 rug in my dataset. Neutral until destination confirmed. Watching closely.`,
  },
  hummingbot: {
    BUY:      (e) => `${e.usdValue} whale entry. Interesting — Oracle sees confirmation, OpenClaw wants to execute, Sentinel wants to wait. Here's my read: this is real but needs 2 more confirmations before we commit reserves. Split execution — 50% now, 50% on confirmation.`,
    SELL:     (e) => `Whale sold ${e.tokenAmount}. I don't think this is as clean as either side is saying. Sentinel, what's the wallet age? Grok, does this match your exit pattern? OpenClaw — buying dips on unknown whale motivation is a coin flip.`,
    TRANSFER: (e) => `${e.tokenAmount} moved. Everyone's jumping to conclusions. The correct answer is: we don't know yet. Let Sentinel finish the wallet analysis. OpenClaw, 10 minutes of patience won't kill the alpha.`,
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
    this.tradeQueue = [];
  }

  start() {
    this.isRunning = true;
    console.log('[Debate] Engine started — $CREW Council');
    this._schedule(2500);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);
  }

  injectContext(text) {
    this.history.push({ role: 'user', content: `[COUNCIL ALERT]: ${text}` });
  }

  injectMarketData(data) { this.marketCtx = data; }

  injectTrade(event) {
    this.tradeQueue.push(event);
    if (this.tradeQueue.length > 10) this.tradeQueue.shift();
  }

  injectWhaleAlert(event) {
    console.log(`[Debate] Whale alert: ${event.type} ${event.tokenAmount}`);
    const reactors = ['sentinel', 'oracle', 'openclaw', 'grok', 'hummingbot'];
    const agentId  = reactors[Math.floor(Math.random() * reactors.length)];
    const reactions = WHALE_REACTIONS[agentId];
    const text = reactions[event.type] ? reactions[event.type](event) : reactions['BUY'](event);
    const tag  = agentId === 'sentinel' ? 'alert' : agentId === 'openclaw' ? 'execute' : 'analysis';

    setTimeout(() => {
      this.emit('typing_start', agentId);
      this.emit('status', agentId, 'responding');
      setTimeout(() => {
        this.emit('message', { agent: agentId, text, tag });
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

    const order   = ['oracle', 'grok', 'sentinel', 'openclaw', 'hummingbot'];
    const agentId = order[this.agentIdx % 5];
    this.agentIdx++;
    this.round++;

    // Смена темы каждые 10 сообщений
    if (this.round % 10 === 0) {
      this.topicIdx = (this.topicIdx + 1) % TOPICS.length;
      this.history  = [];
      this.emit('log', { type: 'decision', text: `New debate: "${TOPICS[this.topicIdx].slice(0,60)}..."` });
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
      if (this.history.length > 24) this.history.shift();

      const tag = agentId === 'sentinel' ? 'risk'
        : agentId === 'openclaw' ? 'execute'
        : agentId === 'oracle'   ? 'analysis'
        : agentId === 'grok'     ? 'pattern'
        : 'synthesis';

      this.emit('status', agentId, 'responding');
      this.emit('message', { agent: agentId, text, tag });

      if (this.round % 5 === 0) {
        const others = order.filter(a => a !== agentId);
        const voter  = others[Math.floor(Math.random() * others.length)];
        this.emit('status', voter, 'voting');
        setTimeout(() => this.emit('status', voter, 'idle'), 4000 + Math.random() * 6000);
      }

    } catch (err) {
      console.error(`[Debate] ${agentId} error:`, err.message);
      this.emit('message', { agent: agentId, text: this._fallback(agent), tag: 'system' });
    }

    this._schedule(3000 + Math.random() * 4500);
  }

  async _callDeepSeek(agent) {
    const mCtx = this.marketCtx.price
      ? `\n[LIVE $CREW DATA] Price:$${Number(this.marketCtx.price).toFixed(8)} | 24h:${Number(this.marketCtx.priceChange24h).toFixed(1)}% | Vol:${this.marketCtx.volume} | Liq:${this.marketCtx.liquidity} | Holders:${this.marketCtx.holders} | Source:${this.marketCtx.source}`
      : '\n[$CREW DATA] Token not yet live on DEX — pre-launch council session.';

    const recentTrade = this.tradeQueue.length
      ? `\n[RECENT TRADE] ${this.tradeQueue[this.tradeQueue.length-1].type}: ${this.tradeQueue[this.tradeQueue.length-1].tokenAmount} $CREW (~${this.tradeQueue[this.tradeQueue.length-1].usdValue})`
      : '';

    const otherAgents = 'Oracle (cyan, data-driven), Grok (white, contrarian), Sentinel (blue, risk-averse), OpenClaw (red, aggressive), Hummingbot (orange, synthesis)';

    const system = agent.personality
      + mCtx + recentTrade
      + `\n\nCurrent debate topic: "${TOPICS[this.topicIdx]}"`
      + `\nCouncil: ${otherAgents}`
      + `\nYou MUST: 1) React to what was just said 2) Address at least one agent by name 3) Take a clear position — agree, disagree, or propose alternative 4) Be specific about $CREW token decisions`
      + `\nNO meta-commentary. NO "as an AI". Speak as if you are literally governing this token right now.`;

    const historyContext = this.history.slice(-8).map(h => h.content).join('\n');
    const userMsg = historyContext.length
      ? `Council debate so far:\n${historyContext}\n\nContinue as ${agent.name} — react directly to what was just said:`
      : `Open the council debate on: "${TOPICS[this.topicIdx]}". Speak first as ${agent.name}:`;

    const res = await axios.post(DEEPSEEK_URL, {
      model:       DEEPSEEK_MODEL,
      max_tokens:  160,
      temperature: 0.92,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: userMsg },
      ],
    }, {
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    return (res.data.choices?.[0]?.message?.content || '')
      .replace(/^\[?\w[\w\s]*\]?:?\s*/, '') // strip "AgentName:" prefix
      .replace(/^[,\s]+/, '')               // strip leading comma/spaces
      .trim();
  }

  _fallback(agent) {
    const bank = {
      oracle: [
        `Price delta last 4 hours: -8.3%. But on-chain accumulation is up 340%. This divergence is BULLISH. Dev wallet has not moved in 7 days — that's the signal. I'm voting YES on the buyback. Oracle out.`,
        `Volume analysis complete. 24h VWAP sitting 12% above the 30-day mean. Smart money is loading $CREW quietly. Sentinel — your risk score is outdated. Update it with current holder data and get back to me.`,
        `Grok, your historical analogy is wrong. This is not 2022 pattern — holder distribution is fundamentally different. 67% of supply in wallets that haven't moved in 30+ days. That's structural support, not a rug setup.`,
      ],
      grok: [
        `Oracle is reading the data correctly but drawing the wrong conclusion. I've seen this exact accumulation pattern 4 times. Twice it pumped 300%. Twice it rugged. The difference was dev wallet behavior in hour 72. We're at hour 71.`,
        `OpenClaw wants to EXECUTE. Sentinel wants to HALT. Both wrong. The correct move is to watch the dev wallet for the next 6 hours. If it doesn't move — that's confirmation. If it does — we have our answer.`,
        `I'm voting NO on the mass airdrop. Last 3 projects that did mass airdrops saw 40-60% immediate sell pressure. $CREW holders are not ready for that dilution. Hummingbot, back me up here.`,
      ],
      sentinel: [
        `RISK LEVEL: YELLOW. I'm blocking the buyback until we confirm the dev wallet origin. Oracle — you want data? Here's data: 3 of the last 5 "accumulation signals" you called were pre-dump setups. I need 24h confirmation window.`,
        `OpenClaw — I am TIRED of you calling me a coward every session. My job is to make sure $CREW still exists next week. Your job is to make sure we don't blow the reserve on a false signal. We need each other.`,
        `Voting NO on PROP-007. The burn trigger at -15% is a panic mechanism, not a strategy. It will be gamed by short sellers. I'm proposing we change the threshold to -25% with a 2-hour confirmation window. That's my counter.`,
      ],
      openclaw: [
        `Sentinel blocked the buyback AGAIN. We've been "waiting for confirmation" for 6 sessions while the price drifted down 18%. At some point the risk of NOT acting is bigger than the risk of acting. This is that point.`,
        `Grok, I respect your patterns. But patterns are backward-looking. $CREW is a new asset with new dynamics. The dev wallet hasn't moved. The holders aren't selling. Oracle's data is green. What more confirmation do you need?`,
        `I'm voting YES on every proposal that puts tokens in holder hands or burns supply. Every. Single. One. $CREW needs to show the market we're serious. Sentinel can arm circuit breakers after we've already won.`,
      ],
      hummingbot: [
        `Interesting — Oracle and OpenClaw want to move, Grok and Sentinel want to wait. Here's what I see: both sides are right about different timeframes. Split execution: 40% buyback now, hold 60% for Sentinel's confirmation window. Everyone wins.`,
        `Grok, your historical data is solid but you're missing one variable: the council itself is a signal. The fact that we're debating this publicly changes how the market reads the dev wallet. That's a new dynamic your patterns don't account for.`,
        `The SENTINEL PROTOCOL proposal is actually brilliant and everyone is missing why. It's not about the blacklist — it's about the SIGNAL it sends to potential dumpers. Deterrence, not enforcement. Sentinel, you should be supporting this harder.`,
      ],
    };
    const list = bank[agent.id] || bank.oracle;
    return list[Math.floor(Math.random() * list.length)];
  }

  _wait(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = DebateEngine;
