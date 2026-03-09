/**
 * GENESIS — Main Server
 * WebSocket + REST API + Helius Webhook receiver
 */

require('dotenv').config();
const express   = require('express');
const { WebSocketServer } = require('ws');
const cors      = require('cors');
const http      = require('http');
const { v4: uuidv4 } = require('uuid');

const DebateEngine = require('./debate-engine');
const DAOModule    = require('./dao');
const MarketModule = require('./market');
const HeliusModule = require('./helius');

const PORT = process.env.PORT || 3001;
const app  = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

// ── In-memory stores ───────────────────────────────────
const clients       = new Set();
const messageHistory = [];
const decisionLog   = [];

// ── Modules ────────────────────────────────────────────
const debate = new DebateEngine();
const dao    = new DAOModule();
const market = new MarketModule();
const helius = new HeliusModule();

// ── Helpers ────────────────────────────────────────────
function broadcast(data) {
  const payload = JSON.stringify(data);
  clients.forEach(ws => { if (ws.readyState === 1) ws.send(payload); });
}

function pushLog(entry) {
  const e = { id: uuidv4(), timestamp: Date.now(), ...entry };
  decisionLog.push(e);
  if (decisionLog.length > 300) decisionLog.shift();
  broadcast({ type: 'log_entry', data: e });
}

// ── WebSocket ───────────────────────────────────────────
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Connected. Total: ${clients.size}`);

  ws.send(JSON.stringify({
    type: 'init',
    data: {
      history: messageHistory.slice(-40),
      log:     decisionLog.slice(-25),
      token:   market.getCurrentData(),
      dao:     dao.getCurrentState(),
    }
  }));

  ws.on('close',  () => { clients.delete(ws); });
  ws.on('error',  () => { clients.delete(ws); });
});

// ── Debate engine events ────────────────────────────────
debate.on('typing_start', (id)        => broadcast({ type: 'typing_start', agent: id }));
debate.on('status',       (id, s)     => broadcast({ type: 'agent_status', agent: id, status: s }));
debate.on('message',      (msg)       => {
  const entry = { id: uuidv4(), type: 'agent_message', timestamp: Date.now(), ...msg };
  messageHistory.push(entry);
  if (messageHistory.length > 200) messageHistory.shift();
  broadcast(entry);
  broadcast({ type: 'agent_status', agent: msg.agent, status: 'idle' });
});
debate.on('log', (data) => pushLog(data));

// ── DAO events ──────────────────────────────────────────
dao.on('update',   (state)    => broadcast({ type: 'dao_update', data: state }));
dao.on('decision', (decision) => {
  pushLog({ type: 'decision', text: decision.text });
  debate.injectContext(`DAO DECISION: ${decision.text}`);
});
dao.on('log', (data) => pushLog(data));

// ── Market events ───────────────────────────────────────
market.on('update', (data) => {
  broadcast({ type: 'token_update', data });
  debate.injectMarketData(data);
  dao.injectPrice(data.rawPrice);
});

// ── Helius events ───────────────────────────────────────
helius.on('metadata', (meta) => {
  broadcast({ type: 'token_meta', data: meta });
  debate.injectContext(`Token metadata confirmed: ${meta.name} (${meta.symbol}), Supply: ${meta.supply}`);
});

helius.on('holders', (count) => {
  market.updateHolders(count);
  broadcast({ type: 'token_update', data: { ...market.getCurrentData(), holders: count } });
});

helius.on('swap', (event) => {
  // Уведомляем агентов о трейде
  debate.injectTrade(event);
  broadcast({ type: 'trade_event', data: event });
});

helius.on('whale', (event) => {
  // Whale alert — Sentinel реагирует немедленно
  debate.injectWhaleAlert(event);
  pushLog({
    type: 'action',
    text: `🐋 WHALE ${event.type}: ${event.tokenAmount} GENESIS (~${event.usdValue}) | ${event.sig}`,
  });
  broadcast({ type: 'whale_alert', data: event });
});

helius.on('log', (data) => pushLog(data));

// ── REST API ────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({
  status: 'online', agents: 4, clients: clients.size,
  helius: helius.isReady, market: market.getCurrentData().isLive,
  timestamp: Date.now(),
}));

app.get('/api/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 200);
  res.json({ messages: messageHistory.slice(-limit) });
});

app.get('/api/log',   (req, res) => res.json({ log: decisionLog.slice(-50) }));
app.get('/api/token', (req, res) => res.json(market.getCurrentData()));
app.get('/api/dao',   (req, res) => res.json(dao.getCurrentState()));


// ── Grokroom Bridge — dashboard ↔ mood across browsers/monitors ────
const agentMsgStore  = {};
const agentMoodStore = {};

app.post('/api/agent-msg', (req, res) => {
  const { agentId, agentName, text } = req.body || {};
  if (!agentId || !text) return res.status(400).json({ error: 'Missing' });
  if (!agentMsgStore[agentId]) agentMsgStore[agentId] = [];
  agentMsgStore[agentId].push({ text, agentName, ts: Date.now() });
  if (agentMsgStore[agentId].length > 20) agentMsgStore[agentId].shift();
  res.json({ ok: true });
});

app.get('/api/agent-msgs', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const result = {};
  Object.entries(agentMsgStore).forEach(([id, msgs]) => {
    result[id] = msgs.filter(m => m.ts > since).map(m => m.text);
  });
  res.json({ messages: result, ts: Date.now() });
});

app.post('/api/agent-mood', (req, res) => {
  const { agentId, mood } = req.body || {};
  if (!agentId || !mood) return res.status(400).json({ error: 'Missing' });
  agentMoodStore[agentId] = { ...mood, updatedAt: Date.now() };
  res.json({ ok: true });
});

app.get('/api/agent-moods', (req, res) => res.json(agentMoodStore));

// ── Helius Webhook Receiver ─────────────────────────────
// Helius шлёт сюда POST при каждой транзакции с токеном
app.post('/webhook/helius', (req, res) => {
  // Проверяем секрет
  const secret = req.headers['authorization'] || req.headers['authheader'];
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ ok: true }); // Helius ждёт 200 быстро
  const transactions = Array.isArray(req.body) ? req.body : [req.body];
  helius.processWebhook(transactions, market.getCurrentData().rawPrice);
});

// ── Start ───────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   GENESIS COUNCIL — BACKEND v2           ║
║   WS:      ws://localhost:${PORT}           ║
║   API:     http://localhost:${PORT}/api     ║
║   Webhook: http://localhost:${PORT}/webhook ║
╚══════════════════════════════════════════╝
  `);
  debate.start();
  dao.start();
  market.start();
  helius.start().then(() => {
    if (helius.isReady) {
      const meta = helius.getTokenMeta();
      if (meta.name) debate.injectContext(`Council initialized for token: ${meta.name} (${meta.symbol})`);
    }
  });
});
