const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const fs   = require('fs');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

app.use(express.json());
app.use(express.static(PUBLIC));

// ── State ──
let tiktokConn    = null;
let currentUser   = null;
const likeBoard   = {}; // { uid: { nickname, likes } }

// ── Broadcast ──
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

// ── Connect TikTok ──
function connectTikTok(username) {
  if (tiktokConn) { try { tiktokConn.disconnect(); } catch(e){} tiktokConn = null; }
  currentUser = username;

  // Reset likeboard saat connect baru
  Object.keys(likeBoard).forEach(k => delete likeBoard[k]);

  const conn = new WebcastPushConnection(username, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 2000,
  });

  conn.on('chat',      d => broadcast({ type:'chat',      user:d.uniqueId, nickname:d.nickname, comment:d.comment, profilePicture:d.profilePictureUrl }));
  conn.on('gift',      d => broadcast({ type:'gift',      user:d.uniqueId, nickname:d.nickname, giftName:d.giftName, repeatCount:d.repeatCount, diamondCount:d.diamondCount, profilePicture:d.profilePictureUrl }));
  conn.on('follow',    d => broadcast({ type:'follow',    user:d.uniqueId, nickname:d.nickname, profilePicture:d.profilePictureUrl }));
  conn.on('share',     d => broadcast({ type:'share',     user:d.uniqueId, nickname:d.nickname, profilePicture:d.profilePictureUrl }));
  conn.on('subscribe', d => broadcast({ type:'subscribe', user:d.uniqueId, nickname:d.nickname, profilePicture:d.profilePictureUrl }));
  conn.on('roomUser',  d => broadcast({ type:'viewers',   count:d.viewerCount }));
  conn.on('member',    d => broadcast({ type:'join',      user:d.uniqueId, nickname:d.nickname, profilePicture:d.profilePictureUrl }));

  conn.on('like', d => {
    const uid = d.uniqueId;
    if (!likeBoard[uid]) likeBoard[uid] = { nickname: d.nickname, likes: 0 };
    likeBoard[uid].likes += (d.likeCount || 1);
    broadcast({ type:'like', user:uid, nickname:d.nickname, likeCount:d.likeCount, totalLikeCount:d.totalLikeCount });
  });

  conn.on('disconnected', () => broadcast({ type:'status', status:'disconnected', message:'Terputus dari TikTok LIVE' }));

  conn.connect()
    .then(() => { broadcast({ type:'status', status:'connected', message:`Terhubung ke @${username}` }); console.log(`✅ @${username}`); })
    .catch(err => { broadcast({ type:'status', status:'error', message:err.message }); console.log(`❌ ${err.message}`); });

  tiktokConn = conn;
}

// ── API ──
app.post('/api/connect', (req, res) => {
  const { username } = req.body;
  if (!username) return res.json({ success:false, message:'Username kosong' });
  connectTikTok(username.replace('@','').trim());
  res.json({ success:true });
});

app.post('/api/disconnect', (req, res) => {
  if (tiktokConn) { try { tiktokConn.disconnect(); } catch(e){} tiktokConn = null; }
  broadcast({ type:'status', status:'disconnected', message:'Disconnected' });
  res.json({ success:true });
});

app.get('/api/status', (req, res) => {
  res.json({ connected: !!tiktokConn, username: currentUser });
});

app.get('/api/likeboard', (req, res) => {
  res.json(likeBoard);
});

// Fallback ke index.html untuk semua route
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

// ── WebSocket ──
wss.on('connection', ws => {
  console.log(`[WS] +1 client. Total: ${wss.clients.size}`);
  ws.send(JSON.stringify({
    type: 'status',
    status: tiktokConn ? 'connected' : 'disconnected',
    message: tiktokConn ? `Terhubung ke @${currentUser}` : 'Belum terhubung'
  }));
  ws.on('close', () => console.log(`[WS] -1 client. Total: ${wss.clients.size}`));
});

server.listen(PORT, () => {
  console.log(`🚀 TikTok LIVE Connector Cloud running on port ${PORT}`);
});
