const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

let tiktokConnection = null;

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('connect-tiktok', async (username) => {
    if (tiktokConnection) {
      try { tiktokConnection.disconnect(); } catch(e) {}
    }

    tiktokConnection = new WebcastPushConnection(username);

    try {
      await tiktokConnection.connect();
      socket.emit('connected', { username });
      console.log(`Connected to @${username}`);
    } catch (err) {
      socket.emit('error', { message: err.message });
      return;
    }

    tiktokConnection.on('chat', (data) => {
      socket.emit('chat', {
        username: data.uniqueId,
        nickname: data.nickname,
        comment: data.comment,
        profilePicture: data.profilePictureUrl
      });
    });

    tiktokConnection.on('gift', (data) => {
      socket.emit('gift', {
        username: data.uniqueId,
        nickname: data.nickname,
        giftName: data.giftName,
        giftCount: data.repeatCount,
        diamondCount: data.diamondCount,
        profilePicture: data.profilePictureUrl
      });
    });

    tiktokConnection.on('member', (data) => {
      socket.emit('join', {
        username: data.uniqueId,
        nickname: data.nickname,
        profilePicture: data.profilePictureUrl
      });
    });

    tiktokConnection.on('like', (data) => {
      socket.emit('like', {
        username: data.uniqueId,
        nickname: data.nickname,
        likeCount: data.likeCount,
        totalLikeCount: data.totalLikeCount
      });
    });

    tiktokConnection.on('disconnected', () => {
      socket.emit('disconnected');
    });

    tiktokConnection.on('error', (err) => {
      socket.emit('error', { message: err.message });
    });
  });

  socket.on('disconnect-tiktok', () => {
    if (tiktokConnection) {
      try { tiktokConnection.disconnect(); } catch(e) {}
      tiktokConnection = null;
    }
    socket.emit('disconnected');
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`🚀 TikTok LIVE Connector Cloud running on port ${PORT}`);
});
