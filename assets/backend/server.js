const express = require("express");
const path = require("path");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../frontend")));

// Route: Serve base game page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/game.html"));
});

// Auth Routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// Room Routes
const roomRoutes = require("./routes/roomRoutes");
app.use("/api/rooms", roomRoutes);

// --- Game State Management ---
// UPDATED: Now tracks 'name' and whether the game has 'started'
const roomPlayers = {}; // { roomId: [{ socketId, userId, name }] }
const roomGameState = {}; // { roomId: { players: [], drawerIdx: 0, word: '', scores: {}, started: false } }

const WORDS = ["apple", "car", "banana", "pizza", "tree", "house", "dog", "star", "laptop", "guitar"];
const WINNING_SCORE = 50; // Set a higher winning score based on points

function pickRandomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

// NEW: Function to initialize and start the game
function startGame(roomId) {
  const gameState = roomGameState[roomId];
  const players = roomPlayers[roomId];

  if (!gameState || gameState.started || !players || players.length < 2) return;

  console.log(`Starting game in room: ${roomId}`);
  gameState.started = true;
  gameState.drawerIdx = 0;
  gameState.word = pickRandomWord();

  gameState.players = players.map(p => p.userId);
  gameState.scores = gameState.players.reduce((acc, userId) => {
    acc[userId] = 0;
    return acc;
  }, {});

  io.to(roomId).emit("gameStart");

  const drawer = players[gameState.drawerIdx];
  if (!drawer) {
    console.error(`Could not find a drawer for room ${roomId}`);
    return;
  }

  io.to(roomId).emit("gameState", { drawerId: drawer.userId, drawerName: drawer.name });
  io.to(drawer.socketId).emit("drawerWord", gameState.word);
  io.to(roomId).emit("scoreUpdate", { scores: gameState.scores, players });
}

// ⚡️ Socket.IO
io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // --- Join Room (UPDATED) ---
  socket.on("joinRoom", ({ roomId, userId, name }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userId = userId;
    socket.name = name;

    if (!roomPlayers[roomId]) roomPlayers[roomId] = [];
    if (!roomPlayers[roomId].some(u => u.userId === userId)) {
      roomPlayers[roomId].push({ socketId: socket.id, userId, name });
    } else {
      const playerIndex = roomPlayers[roomId].findIndex(p => p.userId === userId);
      if (playerIndex !== -1) roomPlayers[roomId][playerIndex].socketId = socket.id;
    }

    console.log(`User ${name} joined Room: ${roomId}`);
    io.to(roomId).emit("updatePlayers", roomPlayers[roomId].map(p => p.name));

    if (!roomGameState[roomId]) {
      roomGameState[roomId] = { players: [], scores: {}, started: false };
    }

    const playersInRoom = roomPlayers[roomId];
    if (playersInRoom.length < 2) {
      io.to(roomId).emit("waitingForPlayers", playersInRoom.length);
    } else {
      if (!roomGameState[roomId].started) {
        startGame(roomId);
      } else {
        // If game is in progress, send current state to the new player
        const game = roomGameState[roomId];
        const drawer = playersInRoom.find(p => p.userId === game.players[game.drawerIdx]);
        if(drawer) {
          socket.emit("gameStart");
          socket.emit("gameState", { drawerId: drawer.userId, drawerName: drawer.name });
          socket.emit("scoreUpdate", { scores: game.scores, players: playersInRoom });
        }
      }
    }
  });

  // --- Drawing ---
  socket.on("draw", ({ x, y, color, roomId, eraser }) => {
    socket.to(roomId).emit("draw", { x, y, color, eraser });
  });

  // --- Chat Message (UPDATED) ---
  socket.on("message", ({ roomId, message }) => {
    const displayName = socket.name || `User ${socket.id}`;
    io.to(roomId).emit("message", `${displayName}: ${message}`);
  });

  // --- Guess Word (UPDATED) ---
  socket.on("guess", async ({ roomId, guess }) => {
    const game = roomGameState[roomId];
    const players = roomPlayers[roomId];

    if (!game || !game.started || socket.userId === game.players[game.drawerIdx]) return;
    
    const correct = guess.trim().toLowerCase() === game.word.toLowerCase();

    if (correct) {
      const guesser = players.find(p => p.userId === socket.userId);
      const drawer = players.find(p => p.userId === game.players[game.drawerIdx]);

      if (guesser) game.scores[guesser.userId] = (game.scores[guesser.userId] || 0) + 10;
      if (drawer) game.scores[drawer.userId] = (game.scores[drawer.userId] || 0) + 5;

      io.to(roomId).emit("guessedCorrect", guesser.name, game.word);
      io.to(roomId).emit("scoreUpdate", { scores: game.scores, players });

      if (game.scores[socket.userId] >= WINNING_SCORE) {
        io.to(roomId).emit("gameOver", guesser.name);
        return;
      }

      game.drawerIdx = (game.drawerIdx + 1) % players.length;
      game.word = pickRandomWord();
      const nextDrawer = players[game.drawerIdx];
      
      io.to(roomId).emit("gameState", { drawerId: nextDrawer.userId, drawerName: nextDrawer.name });
      io.to(nextDrawer.socketId).emit("drawerWord", game.word);
    }
  });

  // --- Disconnect (UPDATED) ---
  socket.on("disconnect", () => {
    console.log(`User Disconnected: ${socket.id}`);
    const { roomId, userId } = socket;

    if (roomId && userId && roomPlayers[roomId]) {
      const playerIndex = roomPlayers[roomId].findIndex(p => p.userId === userId);
      if (playerIndex !== -1) {
          roomPlayers[roomId].splice(playerIndex, 1);
          io.to(roomId).emit("updatePlayers", roomPlayers[roomId].map(p => p.name));

          if (roomGameState[roomId] && roomGameState[roomId].started && roomPlayers[roomId].length < 2) {
              roomGameState[roomId].started = false;
              io.to(roomId).emit("gameEndNotEnoughPlayers");
          }
      }
    }

    if (roomId && roomPlayers[roomId] && roomPlayers[roomId].length === 0) {
      delete roomPlayers[roomId];
      delete roomGameState[roomId];
    }
  });
});

// ✅ Start server
http.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
