const express = require("express");
const path = require("path");
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
const roomPlayers = {}; // { roomId: [{ socketId, userId, name, isConnected: true }] } // Added isConnected flag
const roomGameState = {}; // { 
//   roomId: { 
//     players: [], // Array of userId
//     drawerIdx: 0, 
//     word: '', 
//     scores: {}, 
//     started: false, 
//     maxPlayers: 0,         // NEW: From Room DB
//     totalGameTime: 0,      // NEW: From Room DB (in minutes)
//     gameTimerInterval: null, // NEW: Interval ID for global game timer
//     gameTimeRemaining: 0,  // NEW: Total game time in seconds
//     roundTimerInterval: null, // NEW: Interval ID for round timer
//     roundTimeRemaining: 60, // NEW: Current round time in seconds
//     correctGuessersThisRound: new Set(), // NEW: To track unique guessers for scoring
//     guessOrder: {},        // NEW: To track guess order for scoring { userId: order }
//     roundCount: 0,         // NEW: To track current round
//     maxRounds: 0,          // NEW: Will be calculated based on maxPlayers
//     roundWordStartTime: 0  // NEW: Timestamp for score calculation
//   } 
// }

const WORDS = ["apple", "car", "banana", "pizza", "tree", "house", "dog", "star", "laptop", "guitar"];
const POINTS_FOR_GUESSER = 100; // Base points for the first guesser
const POINTS_FOR_DRAWER = 50;   // Points for the drawer when word is guessed
const DECAY_RATE_TIME = 1;     // Points deducted per second (e.g., 1 point per second)
const DECAY_RATE_ORDER = 10;   // Points deducted per guesser after first (e.g., 10 points per person)

// Function to calculate score based on time and guess order
function calculateGuessScore(timeTaken, guessOrder) {
  const score = Math.max(
    POINTS_FOR_GUESSER - (timeTaken * DECAY_RATE_TIME) - (DECAY_RATE_ORDER * (guessOrder - 1)),
    1 // Score should not go below 1
  );
  return score;
}

function pickRandomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

// Function to start a new drawing round
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
    // Attempt to end game if no players, or handle error gracefully
    io.to(roomId).emit("gameError", "Issue selecting next drawer. Game may end.");
    clearInterval(game.roundTimerInterval);
    clearInterval(game.gameTimerInterval);
    return;
  }

  game.roundTimeRemaining = 60; // Reset round timer for the new round
  game.roundWordStartTime = Date.now(); // Record start time for scoring

  // Clear previous round timer if any
  if (game.roundTimerInterval) {
    clearInterval(game.roundTimerInterval);
  }

  // Start round timer
  game.roundTimerInterval = setInterval(() => {
    game.roundTimeRemaining--;
    io.to(roomId).emit("roundTimerUpdate", game.roundTimeRemaining);

    if (game.roundTimeRemaining <= 0) {
      clearInterval(game.roundTimerInterval);
      io.to(roomId).emit("message", "Time's up! The word was: " + game.word);
      // Automatically advance to next turn if time runs out
      if (game.roundCount < game.maxRounds) {
        startNewRound(roomId);
      } else {
        endGame(roomId);
      }
    }
  }, 1000);

  // Send new round state to all players
  io.to(roomId).emit("newRound", {
    round: game.roundCount,
    maxRounds: game.maxRounds,
    drawerId: currentDrawer.userId,
    drawerName: currentDrawer.name,
    roundTime: game.roundTimeRemaining,
  });

  // Send word only to the current drawer
  io.to(currentDrawer.socketId).emit("drawerWord", game.word);

  // Clear canvas for new round
  io.to(roomId).emit("canvasCleared");
}


// Function to start the overall game
async function startGame(roomId) {
  const game = roomGameState[roomId];
  const players = roomPlayers[roomId];

  // Fetch room details (maxPlayers, totalGameTime) from DB
  await new Promise(resolve => {
      Room.getRoomByCode(roomId, (err, roomDetails) => {
          if (err || !roomDetails) {
              console.error(`Error fetching room details for ${roomId}:`, err);
              // Handle error, maybe end game or prevent start
              return;
          }
          game.maxPlayers = roomDetails.max_players;
          game.totalGameTime = roomDetails.total_game_time * 60; // Convert minutes to seconds
          game.gameTimeRemaining = game.totalGameTime;
          game.maxRounds = game.maxPlayers * 3; // Example: 3 rounds per player
          resolve();
      });
  });

  if (!game || game.started || players.length < game.maxPlayers) {
    console.log(`Attempted to start game in room ${roomId} but conditions not met.`);
    return;
  }

  console.log(`Starting game in room: ${roomId} with ${players.length}/${game.maxPlayers} players. Total time: ${game.totalGameTime / 60} min`);
  game.started = true;
  game.roundCount = 0; // Reset round count
  game.gameStartTime = Date.now(); // Record game start time

  // Initialize scores for all players currently in the room
  game.players = players.map(p => p.userId);
  game.scores = game.players.reduce((acc, userId) => ({ ...acc, [userId]: 0 }), {});

  // Start global game timer
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

  io.to(roomId).emit("gameStart"); // Announce game start to frontend
  startNewRound(roomId); // Start the first round
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
    
    // Check if player is already in room (reconnecting)
    const existingPlayer = roomPlayers[roomId].find(p => p.userId === userId);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id; // Update socket ID for reconnection
      existingPlayer.isConnected = true;
      console.log(`${name} reconnected to room ${roomId}`);
    } else {
      roomPlayers[roomId].push({ socketId: socket.id, userId, name, isConnected: true });
      console.log(`User ${name} joined Room: ${roomId}`);
    }

    // Initialize game state if not present
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
        roundWordStartTime: 0
      };
    }
    const game = roomGameState[roomId];

    // Update player list for everyone
    io.to(roomId).emit("updatePlayers", roomPlayers[roomId].map(p => ({ name: p.name, userId: p.userId, isConnected: p.isConnected })));

    const playersInRoom = roomPlayers[roomId].filter(p => p.isConnected);
    
    if (game.started) {
        // If game is already started, send current state to the joining/reconnecting player
        io.to(socket.id).emit("gameStart");
        io.to(socket.id).emit("gameTimerUpdate", game.gameTimeRemaining);
        io.to(socket.id).emit("roundTimerUpdate", game.roundTimeRemaining);

        const currentDrawer = playersInRoom.find(p => p.userId === game.players[game.drawerIdx]);
        if (currentDrawer) {
            io.to(socket.id).emit("gameState", { drawerId: currentDrawer.userId, drawerName: currentDrawer.name });
            if (socket.userId === currentDrawer.userId) { // If reconnecting drawer
                socket.emit("drawerWord", game.word);
            }
        }
        io.to(socket.id).emit("scoreUpdate", { scores: game.scores, players: roomPlayers[roomId] });
        io.to(socket.id).emit("canvasCleared"); // Re-sync canvas state (clearing it for now)
    } else {
        // Fetch maxPlayers and totalGameTime from DB to determine if room is full
        Room.getRoomByCode(roomId, async (err, roomDetails) => {
            if (err || !roomDetails) {
                console.error(`Error fetching room details for ${roomId} on join:`, err);
                socket.emit("roomError", "Could not fetch room details. Please try again.");
                return;
            }
            game.maxPlayers = roomDetails.max_players;
            game.totalGameTime = roomDetails.total_game_time * 60; // Convert minutes to seconds

            if (playersInRoom.length < game.maxPlayers) {
                io.to(roomId).emit("waitingForPlayers", { 
                    currentPlayers: playersInRoom.length, 
                    maxPlayers: game.maxPlayers 
                });
            } else if (playersInRoom.length === game.maxPlayers) {
                // All players have joined, start the game!
                await startGame(roomId);
            }
        });
    }
  });

  socket.on("draw", ({ x, y, color, roomId, eraser }) => {
    const game = roomGameState[roomId];
    if (game && game.started && game.players[game.drawerIdx] === socket.userId) { // Only allow drawer to draw
        socket.to(roomId).emit("draw", { x, y, color, eraser });
    }
  });

  socket.on('clearCanvas', ({ roomId }) => {
    const game = roomGameState[roomId];
    if (game && game.started && game.players[game.drawerIdx] === socket.userId) {
      io.to(roomId).emit('canvasCleared');
    }
  });

  socket.on("message", ({ roomId, message }) => {
    const displayName = socket.name || `User ${socket.id}`;
    io.to(roomId).emit("message", `${displayName}: ${message}`);
  });

  socket.on("guess", async ({ roomId, guess }) => {
    const game = roomGameState[roomId];
    const players = roomPlayers[roomId]; // Use current players for dynamic lookup

    // Guesser cannot be the drawer, game must be started, and guess must be non-empty
    if (!game || !game.started || socket.userId === game.players[game.drawerIdx] || !guess.trim()) return;

    const guesserSocket = socket.id; // Store guesser's socket ID for direct emits

    const correct = guess.trim().toLowerCase() === game.word.toLowerCase();
    let scoreAwarded = 0;

    if (correct) {
      // Check if this guesser has already guessed correctly this round
      if (game.correctGuessersThisRound.has(socket.userId)) {
          io.to(guesserSocket).emit("message", "You already guessed correctly this round!");
          return; // Don't award points again or log as new guess
      }

      game.correctGuessersThisRound.add(socket.userId); // Mark as correctly guessed

      // Determine guess order
      const currentGuessOrder = Object.keys(game.guessOrder).length + 1;
      game.guessOrder[socket.userId] = currentGuessOrder;

      // Calculate time taken for this guess
      const timeTaken = Math.floor((Date.now() - game.roundWordStartTime) / 1000);
      scoreAwarded = calculateGuessScore(timeTaken, currentGuessOrder);

      // Award points to guesser
      game.scores[socket.userId] = (game.scores[socket.userId] || 0) + scoreAwarded;

      // Award points to drawer (only once per guesser)
      const drawerId = game.players[game.drawerIdx];
      game.scores[drawerId] = (game.scores[drawerId] || 0) + POINTS_FOR_DRAWER;


      const guesser = players.find(p => p.userId === socket.userId);
      const drawer = players.find(p => p.userId === drawerId);

      io.to(roomId).emit("guessedCorrect", guesser.name, game.word);
      io.to(roomId).emit("scoreUpdate", { scores: game.scores, players: roomPlayers[roomId] });

      // Check if all players (excluding drawer) have guessed
      const allPlayersGuessed = players.filter(p => p.userId !== drawerId).every(p => game.correctGuessersThisRound.has(p.userId));

      if (allPlayersGuessed || game.correctGuessersThisRound.size >= players.length - 1) { // If all others guessed or enough guessed
        io.to(roomId).emit("message", `All correct guesses are in! The word was: ${game.word}`);
        clearInterval(game.roundTimerInterval); // Stop current round timer
        if (game.roundCount < game.maxRounds) {
          setTimeout(() => startNewRound(roomId), 3000); // Start next round after a short delay
        } else {
          endGame(roomId);
        }
      }
    } else {
      // Send message to guesser if guess is incorrect (optional)
      io.to(socket.id).emit("message", "Incorrect guess. Try again!");
    }
  });

  socket.on("disconnect", () => {
    console.log(`User Disconnected: ${socket.id}`);
    const { roomId, userId } = socket;

    if (roomId && userId && roomPlayers[roomId]) {
      const player = roomPlayers[roomId].find(p => p.userId === userId);
      if (player) {
          player.isConnected = false; // Mark as disconnected
          console.log(`${player.name} disconnected from room ${roomId}`);
          io.to(roomId).emit("updatePlayers", roomPlayers[roomId].map(p => ({ name: p.name, userId: p.userId, isConnected: p.isConnected })));

          const connectedPlayers = roomPlayers[roomId].filter(p => p.isConnected);
          
          const game = roomGameState[roomId];
          if (game && game.started && connectedPlayers.length < game.maxPlayers) {
              // If game is running and player count drops below max, inform everyone
              io.to(roomId).emit("message", `${player.name} disconnected. Waiting for more players or game will pause.`);
              // If only one player left, stop game/pause
              if (connectedPlayers.length < 2) {
                  clearInterval(game.gameTimerInterval);
                  clearInterval(game.roundTimerInterval);
                  game.started = false; // Pause game
                  io.to(roomId).emit("gamePaused", "Not enough players. Game paused.");
              }
          }
      }

      // If all players have permanently left (no one left to reconnect), clean up
      if (roomPlayers[roomId].every(p => !p.isConnected)) { // Check if all players recorded are disconnected
        delete roomPlayers[roomId];
        delete roomGameState[roomId];
        console.log(`Room ${roomId} cleaned up as all players disconnected.`);
      }
    }
  });
});

// ✅ Start server
http.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
