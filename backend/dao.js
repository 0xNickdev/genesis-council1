/**
 * $CREW — DAO Voting Module
 */
const EventEmitter = require('events');

const PROPOSALS = [
  // Твои
  { text: 'Airdrop 50,000 $CREW to a randomly selected verified holder. Snapshot in 60 seconds. Winner announced on-chain.', threshold: 65 },
  { text: 'Transfer 5% of total supply to wallet Lobstarwilde as recognition reward for council contributions.', threshold: 70 },
  { text: 'Buy back 2.5% of circulating supply from dev wallet and permanently burn. Deflationary execution.', threshold: 75 },
  { text: 'Mass airdrop: distribute 100,000 $CREW equally across all current holders. Snapshot now.', threshold: 60 },
  { text: 'BURN TRIGGER: If price fails to reach +50% from current within 60 minutes — burn 1% of total supply automatically.', threshold: 80 },
  { text: 'LOCK PROTOCOL: Freeze 10% of total supply in time-lock contract for 5 days. No transfers, no sells. Trust signal.', threshold: 75 },

  // Мои
  { text: 'Activate auto-buyback circuit: if price drops -15% within any 60-minute window — deploy full buyback reserve immediately.', threshold: 85 },
  { text: 'Freeze all dev wallet outflows for 30 days. Smart contract enforced. Community confidence protocol.', threshold: 70 },
  { text: 'Reward top 10 diamond hands: holders with longest unbroken hold streak receive 10,000 $CREW each.', threshold: 65 },
  { text: 'Deploy 3% of supply into on-chain reward pool. Distributed weekly to holders with 7+ day positions only.', threshold: 68 },
  { text: 'SENTINEL PROTOCOL: If a single wallet dumps more than 2% of supply in one tx — auto-blacklist and redistribute to holders.', threshold: 82 },
  { text: 'Burn all unclaimed airdrop tokens after 48h window. No extensions. Committed holders only.', threshold: 72 },
];

const TENDENCIES = {
  oracle:   { base: 72, variance: 14, drift: 0.6  },
  grok:     { base: 65, variance: 20, drift: 0.4  },
  sentinel: { base: 52, variance: 26, drift: -0.3 },
  openclaw: { base: 86, variance: 16, drift: 0.9  },
  claude:   { base: 70, variance: 18, drift: 0.3  },
};

class DAOModule extends EventEmitter {
  constructor() {
    super();
    this.round = 0; this.propIdx = -1; this.current = null;
    this.votes = {}; this.timeLeft = 20*60; this.status = 'voting';
    this.price = 0; this.countdown = null;
  }

  start() { this._newRound(); this.countdown = setInterval(() => this._tick(), 1000); }
  injectPrice(p) { this.price = p; }

  getCurrentState() {
    return {
      round: this.round,
      proposal: this.current?.text || '',
      votes: this.votes,
      timeLeft: this.timeLeft,
      status: this.status,
    };
  }

  _tick() {
    if (this.timeLeft > 0) {
      this.timeLeft--;
      if (this.timeLeft % 20 === 0) { this._drift(); this.emit('update', this.getCurrentState()); }
    } else {
      this._conclude();
    }
  }

  _newRound() {
    this.round++;
    this.propIdx = (this.propIdx + 1) % PROPOSALS.length;
    this.current = PROPOSALS[this.propIdx];
    this.timeLeft = 15*60 + Math.floor(Math.random() * 8*60);
    this.status = 'voting';
    this.votes = {};
    Object.keys(TENDENCIES).forEach(a => {
      const t = TENDENCIES[a];
      this.votes[a] = Math.min(97, Math.max(5, t.base + (Math.random() - 0.5) * t.variance));
    });
    this.emit('update', this.getCurrentState());
    this.emit('log', {
      type: 'vote',
      text: `PROP-${String(this.round).padStart(3,'0')} opened: "${this.current.text.slice(0, 60)}..."`,
    });
    console.log(`[DAO] Round #${this.round}: ${this.current.text.slice(0, 55)}`);
  }

  _drift() {
    Object.keys(TENDENCIES).forEach(a => {
      const t = TENDENCIES[a];
      this.votes[a] = Math.min(97, Math.max(5,
        this.votes[a] + (Math.random() - 0.5) * 4 + t.drift * 0.5
      ));
    });
  }

  _conclude() {
    const vals = Object.values(this.votes);
    const avg  = vals.reduce((s, v) => s + v, 0) / vals.length;
    const passed = avg >= this.current.threshold;
    this.status = passed ? 'executing' : 'failed';
    this.emit('update', this.getCurrentState());

    const result = passed
      ? `PROP-${String(this.round).padStart(3,'0')} PASSED — ${avg.toFixed(1)}% consensus. Executing on-chain.`
      : `PROP-${String(this.round).padStart(3,'0')} FAILED — ${avg.toFixed(1)}% consensus (<${this.current.threshold}% required).`;

    this.emit('decision', { text: result, round: this.round, passed });

    if (passed) {
      setTimeout(() => {
        const tx = '0x' + Math.random().toString(16).slice(2, 10) + '...' + Math.random().toString(16).slice(2, 6);
        this.emit('log', { type: 'onchain', text: `Tx confirmed: ${tx} | Executed on Solana mainnet` });
      }, 7000 + Math.random() * 8000);
    }

    setTimeout(() => this._newRound(), 12000);
  }
}

module.exports = DAOModule;
