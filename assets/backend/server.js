const express = require("express");
const path = require("path"); // CORRECTED: Removed the extra ' = require'
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;

// Import the Room model to get room details (maxPlayers, totalGameTime)
const Room = require('./models/Room');

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
const roomPlayers = {}; // { roomId: [{ socketId, userId, name, isConnected: true }] }
const roomGameState = {}; // {
//   roomId: {
//     players: [],
//     drawerIdx: 0,
//     word: '',
//     scores: {},
//     started: false,
//     maxPlayers: 0,
//     totalGameTime: 0,
//     gameTimerInterval: null,
//     gameTimeRemaining: 0,
//     roundTimerInterval: null,
//     roundTimeRemaining: 60,
//     correctGuessersThisRound: new Set(),
//     guessOrder: {},
//     roundCount: 0,
//     maxRounds: 0,
//     roundWordStartTime: 0,
//     drawingHistory: [] // To store all drawing strokes for replay
//   }
// }

const WORDS = ["apple", "car", "banana", "pizza", "tree", "house", "dog", "star", "laptop", "guitar"];
const POINTS_FOR_GUESSER = 100;
const POINTS_FOR_DRAWER = 50;
const DECAY_RATE_TIME = 1;
const DECAY_RATE_ORDER = 10;

function calculateGuessScore(timeTaken, guessOrder) {
  const score = Math.max(
    POINTS_FOR_GUESSER - (timeTaken * DECAY_RATE_TIME) - (DECAY_RATE_ORDER * (guessOrder - 1)),
    1
  );
  return score;
}

function pickRandomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function startNewRound(roomId) {
  const game = roomGameState[roomId];
  const players = roomPlayers[roomId];

  if (!game || !game.started || players.length === 0) return;

  // Clear previous round's state
  game.correctGuessersThisRound.clear();
  game.guessOrder = {};
  game.roundCount++;

  // Determine next drawer
  game.drawerIdx = (game.drawerIdx + 1) % players.length;
  game.word = pickRandomWord();

  const currentDrawer = players[game.drawerIdx];
  if (!currentDrawer) {
    console.error(`Error: Could not find drawer for room ${roomId}, players array might be empty or indexed incorrectly.`);
    io.to(roomId).emit("gameError", "Issue selecting next drawer. Game may end.");
    clearInterval(game.roundTimerInterval);
    clearInterval(game.gameTimerInterval);
    return;
  }

  game.roundTimeRemaining = 60;
  game.roundWordStartTime = Date.now();

  if (game.roundTimerInterval) {
    clearInterval(game.roundTimerInterval);
  }

  game.roundTimerInterval = setInterval(() => {
    game.roundTimeRemaining--;
    io.to(roomId).emit("roundTimerUpdate", game.roundTimeRemaining);

    if (game.roundTimeRemaining <= 0) {
      clearInterval(game.roundTimerInterval);
      io.to(roomId).emit("message", "Time's up! The word was: " + game.word);
      if (game.roundCount < game.maxRounds) {
        setTimeout(() => startNewRound(roomId), 3000);
      } else {
        endGame(roomId);
      }
    }
  }, 1000);

  io.to(roomId).emit("newRound", {
    round: game.roundCount,
    maxRounds: game.maxRounds,
    drawerId: currentDrawer.userId,
    drawerName: currentDrawer.name,
    roundTime: game.roundTimeRemaining,
  });

  io.to(currentDrawer.socketId).emit("drawerWord", game.word);

  // Clear canvas for new round AND reset drawing history for the room
  game.drawingHistory = []; // Clear the drawing history for the room
  io.to(roomId).emit("canvasCleared");
}


async function startGame(roomId) {
  const game = roomGameState[roomId];
  const players = roomPlayers[roomId];

  await new Promise(resolve => {
      Room.getRoomByCode(roomId, (err, roomDetails) => {
          if (err || !roomDetails) {
              console.error(`Error fetching room details for ${roomId}:`, err);
              return;
          }
          game.maxPlayers = roomDetails.max_players;
          game.totalGameTime = roomDetails.total_game_time * 60;
          game.gameTimeRemaining = game.totalGameTime;
          game.maxRounds = game.maxPlayers * 3;
          resolve();
      });
  });

  if (!game || game.started || players.length < game.maxPlayers) {
    console.log(`Attempted to start game in room ${roomId} but conditions not met.`);
    return;
  }

  console.log(`Starting game in room: ${roomId} with ${players.length}/${game.maxPlayers} players. Total time: ${game.totalGameTime / 60} min`);
  game.started = true;
  game.roundCount = 0;
  game.gameStartTime = Date.now();

  game.players = players.map(p => p.userId);
  game.scores = game.players.reduce((acc, userId) => ({ ...acc, [userId]: 0 }), {});

  game.drawingHistory = []; // Initialize drawing history when game starts

  game.gameTimerInterval = setInterval(() => {
    game.gameTimeRemaining--;
    io.to(roomId).emit("gameTimerUpdate", game.gameTimeRemaining);

    if (game.gameTimeRemaining <= 0) {
      clearInterval(game.gameTimerInterval);
      clearInterval(game.roundTimerInterval);
      endGame(roomId);
      return;
    }
  }, 1000);

  io.to(roomId).emit("gameStart");
  startNewRound(roomId);
}

function endGame(roomId) {
  const game = roomGameState[roomId];
  if (!game) return;

  clearInterval(game.gameTimerInterval);
  clearInterval(game.roundTimerInterval);

  let winnerId = null;
  let maxScore = -1;

  for (const userId in game.scores) {
    if (game.scores[userId] > maxScore) {
      maxScore = game.scores[userId];
      winnerId = userId;
    }
  }

  const winner = roomPlayers[roomId].find(p => p.userId === winnerId);
  const winnerName = winner ? winner.name : 'Unknown Player';

  io.to(roomId).emit("gameOver", { winnerName, maxScore, finalScores: game.scores });

  // Clean up game state after game over
  delete roomPlayers[roomId];
  delete roomGameState[roomId];
}


// ⚡️ Socket.IO
io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on("joinRoom", async ({ roomId, userId, name }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userId = userId;
    socket.name = name;

    if (!roomPlayers[roomId]) roomPlayers[roomId] = [];

    const existingPlayer = roomPlayers[roomId].find(p => p.userId === userId);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      existingPlayer.isConnected = true;
      console.log(`${name} reconnected to room ${roomId}`);
    } else {
      roomPlayers[roomId].push({ socketId: socket.id, userId, name, isConnected: true });
      console.log(`User ${name} joined Room: ${roomId}`);
    }

    if (!roomGameState[roomId]) {
      roomGameState[roomId] = {
        players: [],
        drawerIdx: 0,
        word: '',
        scores: {},
        started: false,
        maxPlayers: 0,
        totalGameTime: 0,
        gameTimerInterval: null,
        gameTimeRemaining: 0,
        roundTimerInterval: null,
        roundTimeRemaining: 60,
        correctGuessersThisRound: new Set(),
        guessOrder: {},
        roundCount: 0,
        maxRounds: 0,
        roundWordStartTime: 0,
        drawingHistory: [] // Initialize drawing history for a new room
      };
    }
    const game = roomGameState[roomId];

    io.to(roomId).emit("updatePlayers", roomPlayers[roomId].map(p => ({ name: p.name, userId: p.userId, isConnected: p.isConnected })));

    const playersInRoom = roomPlayers[roomId].filter(p => p.isConnected);

    if (game.started) {
        io.to(socket.id).emit("gameStart");
        io.to(socket.id).emit("gameTimerUpdate", game.gameTimeRemaining);
        io.to(socket.id).emit("roundTimerUpdate", game.roundTimeRemaining);

        const currentDrawer = playersInRoom.find(p => p.userId === game.players[game.drawerIdx]);
        if (currentDrawer) {
            io.to(socket.id).emit("gameState", { drawerId: currentDrawer.userId, drawerName: currentDrawer.name });
            if (socket.userId === currentDrawer.userId) {
                socket.emit("drawerWord", game.word);
            }
        }
        io.to(socket.id).emit("scoreUpdate", { scores: game.scores, players: roomPlayers[roomId] });

        // Replay drawing history to the joining player
        io.to(socket.id).emit("canvasCleared"); // Clear their canvas first
        game.drawingHistory.forEach(drawData => {
          io.to(socket.id).emit("draw", drawData); // Then redraw
        });

    } else {
        Room.getRoomByCode(roomId, async (err, roomDetails) => {
            if (err || !roomDetails) {
                console.error(`Error fetching room details for ${roomId} on join:`, err);
                socket.emit("roomError", "Could not fetch room details. Please try again.");
                return;
            }
            game.maxPlayers = roomDetails.max_players;
            game.totalGameTime = roomDetails.total_game_time * 60;

            if (playersInRoom.length < game.maxPlayers) {
                io.to(roomId).emit("waitingForPlayers", {
                    currentPlayers: playersInRoom.length,
                    maxPlayers: game.maxPlayers
                });
            } else if (playersInRoom.length === game.maxPlayers) {
                await startGame(roomId);
            }
        });
    }
  });

  // Store drawing data in history
  socket.on("draw", ({ x, y, color, roomId, eraser }) => {
    const game = roomGameState[roomId];
    if (game && game.started && game.players[game.drawerIdx] === socket.userId) {
        const drawData = { x, y, color, eraser };
        game.drawingHistory.push(drawData); // Store the draw event
        socket.to(roomId).emit("draw", drawData); // Relay to others
    }
  });

  // Clear drawing history when clearCanvas is called
  socket.on('clearCanvas', ({ roomId }) => {
    const game = roomGameState[roomId];
    if (game && game.started && game.players[game.drawerIdx] === socket.userId) {
      game.drawingHistory = []; // Clear the server's history
      io.to(roomId).emit('canvasCleared');
    }
  });

  socket.on("message", ({ roomId, message }) => {
    const displayName = socket.name || `User ${socket.id}`;
    io.to(roomId).emit("message", `${displayName}: ${message}`);
  });

  socket.on("guess", async ({ roomId, guess }) => {
    const game = roomGameState[roomId];
    const players = roomPlayers[roomId];

    if (!game || !game.started || socket.userId === game.players[game.drawerIdx] || !guess.trim()) return;

    const guesserSocket = socket.id;

    const correct = guess.trim().toLowerCase() === game.word.toLowerCase();
    let scoreAwarded = 0;

    if (correct) {
      if (game.correctGuessersThisRound.has(socket.userId)) {
          io.to(guesserSocket).emit("message", "You already guessed correctly this round!");
          return;
      }

      game.correctGuessersThisRound.add(socket.userId);

      const currentGuessOrder = Object.keys(game.guessOrder).length + 1;
      game.guessOrder[socket.userId] = currentGuessOrder;

      const timeTaken = Math.floor((Date.now() - game.roundWordStartTime) / 1000);
      scoreAwarded = calculateGuessScore(timeTaken, currentGuessOrder);

      game.scores[socket.userId] = (game.scores[socket.userId] || 0) + scoreAwarded;

      const drawerId = game.players[game.drawerIdx];
      game.scores[drawerId] = (game.scores[drawerId] || 0) + POINTS_FOR_DRAWER;

      const guesser = players.find(p => p.userId === socket.userId);
      const drawer = players.find(p => p.userId === drawerId);

      io.to(roomId).emit("guessedCorrect", guesser.name, game.word);
      io.to(roomId).emit("scoreUpdate", { scores: game.scores, players: roomPlayers[roomId] });

      const allPlayersGuessed = players.filter(p => p.userId !== drawerId).every(p => game.correctGuessersThisRound.has(p.userId));

      if (allPlayersGuessed || game.correctGuessersThisRound.size >= players.length - 1) {
        io.to(roomId).emit("message", `All correct guesses are in! The word was: ${game.word}`);
        clearInterval(game.roundTimerInterval);
        if (game.roundCount < game.maxRounds) {
          setTimeout(() => startNewRound(roomId), 3000);
        } else {
          endGame(roomId);
        }
      }
    } else {
      io.to(socket.id).emit("message", "Incorrect guess. Try again!");
    }
  });

  socket.on("disconnect", () => {
    console.log(`User Disconnected: ${socket.id}`);
    const { roomId, userId } = socket;

    if (roomId && userId && roomPlayers[roomId]) {
      const player = roomPlayers[roomId].find(p => p.userId === userId);
      if (player) {
          player.isConnected = false;
          console.log(`${player.name} disconnected from room ${roomId}`);
          io.to(roomId).emit("updatePlayers", roomPlayers[roomId].map(p => ({ name: p.name, userId: p.userId, isConnected: p.isConnected })));

          const connectedPlayers = roomPlayers[roomId].filter(p => p.isConnected);

          const game = roomGameState[roomId];
          if (game && game.started && connectedPlayers.length < game.maxPlayers) {
              io.to(roomId).emit("message", `${player.name} disconnected. Waiting for more players or game will pause.`);
              if (connectedPlayers.length < 2) {
                  clearInterval(game.gameTimerInterval);
                  clearInterval(game.roundTimerInterval);
                  game.started = false;
                  io.to(roomId).emit("gamePaused", "Not enough players. Game paused.");
              }
          }
      }

      if (roomPlayers[roomId].every(p => !p.isConnected)) {
        delete roomPlayers[roomId];
        delete roomGameState[roomId];
        console.log(`Room ${roomId} cleaned up as all players disconnected.`);
      }
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
