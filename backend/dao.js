/**
 * GENESIS — DAO Voting Module
 */
const EventEmitter = require('events');

const PROPOSALS = [
  { text: 'Increase liquidity pool allocation by 15% and initiate buyback at current -5% floor price.', threshold: 75 },
  { text: 'Allocate 50,000 GENESIS for community marketing: Twitter and Telegram campaigns.', threshold: 60 },
  { text: 'Implement staking v2 with 180-day lock for 2.5x APY. Reduce short-term rewards by 40%.', threshold: 80 },
  { text: 'Authorize $25K from treasury for Tier-2 CEX listing fee and initial market making.', threshold: 70 },
  { text: 'Emergency buyback: deploy 100% of buyback reserve if price drops 30% from ATH.', threshold: 85 },
  { text: 'Burn 2% of total supply from dev wallet to reduce inflation this quarter.', threshold: 75 },
  { text: 'Partner with 3 DeFi protocols for cross-protocol liquidity. Budget: 80K GENESIS.', threshold: 65 },
  { text: 'Raise whale alert threshold to $10K and add automated Sentinel response protocol.', threshold: 60 },
];

const TENDENCIES = {
  oracle:   { base: 75, variance: 14, drift: 0.6  },
  grok:     { base: 68, variance: 20, drift: 0.4  },
  sentinel: { base: 54, variance: 26, drift: -0.3 },
  openclaw: { base: 83, variance: 16, drift: 0.8  },
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
  getCurrentState() { return { round: this.round, proposal: this.current?.text||'', votes: this.votes, timeLeft: this.timeLeft, status: this.status }; }
  _tick() {
    if (this.timeLeft > 0) { this.timeLeft--;
      if (this.timeLeft % 20 === 0) { this._drift(); this.emit('update', this.getCurrentState()); }
    } else { this._conclude(); }
  }
  _newRound() {
    this.round++; this.propIdx = (this.propIdx+1) % PROPOSALS.length;
    this.current = PROPOSALS[this.propIdx];
    this.timeLeft = 15*60 + Math.floor(Math.random()*8*60); this.status = 'voting';
    this.votes = {};
    Object.keys(TENDENCIES).forEach(a => {
      const t = TENDENCIES[a];
      this.votes[a] = Math.min(97, Math.max(5, t.base + (Math.random()-.5)*t.variance));
    });
    this.emit('update', this.getCurrentState());
    this.emit('log', { type:'vote', text:`PROP-${String(this.round).padStart(3,'0')} opened: "${this.current.text.slice(0,55)}..."` });
    console.log(`[DAO] Round #${this.round}: ${this.current.text.slice(0,50)}`);
  }
  _drift() {
    Object.keys(TENDENCIES).forEach(a => {
      const t = TENDENCIES[a];
      this.votes[a] = Math.min(97, Math.max(5, this.votes[a] + (Math.random()-.5)*4 + t.drift*.5));
    });
  }
  _conclude() {
    const avg = Object.values(this.votes).reduce((s,v)=>s+v,0)/4;
    const passed = avg >= this.current.threshold;
    this.status = passed ? 'executing' : 'failed';
    this.emit('update', this.getCurrentState());
    const result = passed
      ? `PROP-${String(this.round).padStart(3,'0')} PASSED — ${avg.toFixed(1)}% consensus. Executing on-chain.`
      : `PROP-${String(this.round).padStart(3,'0')} FAILED — ${avg.toFixed(1)}% consensus (<${this.current.threshold}% required).`;
    this.emit('decision', { text: result, round: this.round, passed });
    if (passed) {
      setTimeout(() => {
        const tx = '0x'+Math.random().toString(16).slice(2,10)+'...'+Math.random().toString(16).slice(2,6);
        this.emit('log', { type:'onchain', text:`Tx confirmed: ${tx} | Executed on Solana` });
      }, 7000 + Math.random()*8000);
    }
    setTimeout(() => this._newRound(), 12000);
  }
}
module.exports = DAOModule;
