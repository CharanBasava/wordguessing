// --- Get room from URL ---
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room') || '';
document.getElementById('roomId').textContent = roomId;

// --- Get logged-in user info ---
const userId = localStorage.getItem('userId');
const name = localStorage.getItem('name') || "Player";

// 🔌 Connect to socket.io
const socket = io();

// 🧑‍🤝‍🧑 Join the room with user info
socket.emit('joinRoom', { roomId, userId, name });

// --- Game State Variables ---
let gameHasStarted = false;
let playersMap = {}; // To map userId to name for scores { userId: name }

// --- Canvas setup ---
const canvas = document.getElementById("drawingBoard");
const ctx = canvas.getContext("2d");
const colorPalette = document.querySelector(".color-palette");
const chatInput = document.getElementById('chatInput');
const clearCanvasBtn = document.getElementById('clearCanvasBtn');

let drawing = false;
let color = "#000000";
let isEraser = false;
let brushSize = 10;
let lastX = 0;
let lastY = 0;

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

canvas.addEventListener("mousedown", e => {
  if (!gameHasStarted || !drawingEnabled) return;
  drawing = true;
  const { x, y } = getCanvasCoords(e);
  ctx.beginPath();
  ctx.moveTo(x, y);
  lastX = x;
  lastY = y;
  drawOrErase(x, y, true);
});

canvas.addEventListener("mouseup", () => {
  drawing = false;
  ctx.closePath();
});

canvas.addEventListener("mouseleave", () => {
  drawing = false;
  ctx.closePath();
});

canvas.addEventListener("mousemove", e => {
  if (!drawing || !gameHasStarted || !drawingEnabled) return;
  const { x, y } = getCanvasCoords(e);
  drawOrErase(x, y, true);
  lastX = x;
  lastY = y;
});

function drawOrErase(x, y, emit = true) {
  if (isEraser) {
    eraseOnCanvas(x, y);
    if (emit) socket.emit("draw", { x, y, color: null, roomId, eraser: true });
  } else {
    drawOnCanvas(x, y, color);
    if (emit) socket.emit("draw", { x, y, color, roomId });
  }
}

function drawOnCanvas(x, y, clr) {
  ctx.strokeStyle = clr;
  ctx.lineWidth = brushSize;
  ctx.lineCap = "round";
  ctx.lineTo(x, y);
  ctx.stroke();
}

function eraseOnCanvas(x, y) {
  ctx.clearRect(x - brushSize / 2, y - brushSize / 2, brushSize, brushSize);
}

socket.on("draw", ({ x, y, color, eraser }) => {
  if (eraser) eraseOnCanvas(x, y);
  else drawOnCanvas(x, y, color);
});

// --- Listen for the server broadcast to clear the canvas ---
socket.on('canvasCleared', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// --- Color + tool UI ---
document.querySelectorAll(".color-option").forEach(option => {
  option.addEventListener("click", () => {
    if (!drawingEnabled) return;
    color = option.dataset.color;
    isEraser = false;
    document.querySelector(".color-option.selected")?.classList.remove("selected");
    option.classList.add("selected");
    document.getElementById("penTool").classList.add("selected");
    document.getElementById("eraserTool").classList.remove("selected");
  });
});

document.getElementById("penTool").addEventListener("click", () => {
  if (!drawingEnabled) return;
  isEraser = false;
});
document.getElementById("eraserTool").addEventListener("click", () => {
  if (!drawingEnabled) return;
  isEraser = true;
});

// --- Add event listener for the clear button ---
clearCanvasBtn.addEventListener('click', () => {
  if (drawingEnabled) {
    if (confirm('Are you sure you want to clear the entire canvas?')) {
      socket.emit('clearCanvas', { roomId });
    }
  }
});

document.querySelector('.color-option[data-color="#000000"]').classList.add('selected');
document.getElementById("penTool").classList.add('selected');

// --- Timer - Now handled by server events ---
const gameTimerDisplay = document.getElementById("timer"); // Global game timer
// const timerDisplay = document.getElementById("timer"); // OLD: This was for round timer, now reused for global
const roundTimerDisplay = document.createElement('span'); // NEW: For current round timer
roundTimerDisplay.id = 'roundTimer';
roundTimerDisplay.style.marginLeft = '10px';
gameTimerDisplay.parentNode.insertBefore(roundTimerDisplay, gameTimerDisplay.nextSibling); // Insert next to global timer

// --- Chat ---
const chatBox = document.getElementById('chatBox');
chatInput.addEventListener("keydown", (e) => {
  if (!gameHasStarted) return;
  if (e.key === "Enter" && chatInput.value.trim()) {
    const message = chatInput.value.trim();
    socket.emit("message", { roomId, message });
    if (!drawingEnabled) {
      socket.emit("guess", { roomId, guess: message });
    }
    chatInput.value = "";
  }
});

socket.on("message", (msg) => {
  const div = document.createElement("div");
  div.textContent = msg;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
});

// --- Game Logic and State Listeners ---
const infoBox = document.getElementById("drawerInfo") || document.createElement("div");
if (!document.getElementById("drawerInfo")) {
  infoBox.id = "drawerInfo";
  infoBox.style.fontWeight = "bold";
  infoBox.style.marginBottom = "10px";
  document.querySelector(".canvas-container")?.prepend(infoBox);
}

let drawingEnabled = false;

// NEW LISTENERS for global game timer and round timer
socket.on("gameTimerUpdate", (timeRemaining) => {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  gameTimerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
});

socket.on("roundTimerUpdate", (timeRemaining) => {
  roundTimerDisplay.textContent = `Round: ${timeRemaining}s`;
});

socket.on("waitingForPlayers", ({ currentPlayers, maxPlayers }) => { // UPDATED: Receive current and max players
  infoBox.textContent = `Waiting for players... (${currentPlayers}/${maxPlayers})`;
  colorPalette.style.display = 'none';
  clearCanvasBtn.style.display = 'none';
  chatInput.placeholder = "Waiting for game to start...";
  chatInput.disabled = true; // Disable chat until game starts
});

socket.on("gameStart", () => {
  gameHasStarted = true;
  infoBox.textContent = "Game has started! Good luck!";
  chatInput.disabled = false; // Enable chat
});

// NEW LISTENER for new rounds
socket.on("newRound", ({ round, maxRounds, drawerId, drawerName, roundTime }) => {
  infoBox.textContent = `Round ${round}/${maxRounds}:`;
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas on new round

  // Set initial state for drawer/guesser
  const myId = localStorage.getItem("userId");
  if (myId == drawerId) {
    drawingEnabled = true;
    colorPalette.style.display = 'flex';
    clearCanvasBtn.style.display = 'inline-block';
    chatInput.placeholder = "You are drawing, you can't guess!";
    chatInput.disabled = true; // Drawer cannot type in chat to guess
  } else {
    drawingEnabled = false;
    colorPalette.style.display = 'none';
    clearCanvasBtn.style.display = 'none';
    infoBox.textContent = `🎨 ${drawerName} is drawing!`;
    chatInput.placeholder = "Type your guess...";
    chatInput.disabled = false; // Guesser can type
  }
});


// UPDATED gameState listener (less logic now, as newRound handles more)
socket.on("gameState", ({ drawerId, drawerName }) => {
  // This event will primarily handle the active drawer info if a player joins mid-game
  // The 'newRound' event provides a more complete state update for active players
  // You can keep this for redundancy or specific mid-game join scenarios.
});


socket.on("drawerWord", (word) => {
  infoBox.textContent = `🖊️ Your word is: ${word}`;
  // Ensure the canvas is clear for the new word
  ctx.clearRect(0, 0, canvas.width, canvas.height); 
});

socket.on("guessedCorrect", (guesserName, word) => {
  const div = document.createElement("div");
  div.style.fontWeight = "bold";
  div.style.color = "green";
  div.textContent = `🎉 ${guesserName} guessed the word: "${word}"!`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
});

// UPDATED Player List to show names and connection status
const playersList = document.getElementById('playersList');
socket.on("updatePlayers", (players) => { // UPDATED: Receive objects, not just names
  playersList.innerHTML = "";
  players.forEach(player => {
    const li = document.createElement("li");
    li.textContent = player.name;
    if (!player.isConnected) {
        li.style.color = 'gray';
        li.textContent += ' (Disconnected)';
    }
    playersList.appendChild(li);
  });
});


// UPDATED Scores to display with names
const scoresList = document.getElementById('scoresList');
socket.on("scoreUpdate", ({ scores, players }) => {
  scoresList.innerHTML = "";

  playersMap = players.reduce((map, player) => {
    map[player.userId] = player.name;
    return map;
  }, {});

  // Sort scores from highest to lowest
  const sortedScores = Object.entries(scores).sort(([,scoreA], [,scoreB]) => scoreB - scoreA);

  sortedScores.forEach(([pId, score]) => {
    const playerName = playersMap[pId] || 'Unknown';
    const li = document.createElement("li");
    li.textContent = `${playerName}: ${score}`;
    scoresList.appendChild(li);
  });
});


// UPDATED Game Over to use name and show final scores
socket.on("gameOver", ({ winnerName, maxScore, finalScores }) => { // UPDATED: Receive winner name, max score, and all final scores
  alert(`🏆 Game over! Winner: ${winnerName} with ${maxScore} points!`);
  infoBox.textContent = `Game Over! ${winnerName} is the winner with ${maxScore} points!`;
  gameHasStarted = false;
  chatInput.disabled = true; // Disable chat after game ends

  // Optionally, display final scores in a more prominent way
  scoresList.innerHTML = ''; // Clear regular score list
  const finalScoreHeader = document.createElement('h4');
  finalScoreHeader.textContent = 'Final Scores:';
  scoresList.appendChild(finalScoreHeader);

  // Sort final scores for display
  const sortedFinalScores = Object.entries(finalScores).sort(([,scoreA], [,scoreB]) => scoreB - scoreA);
  sortedFinalScores.forEach(([pId, score]) => {
      const playerName = playersMap[pId] || 'Unknown';
      const li = document.createElement("li");
      li.textContent = `${playerName}: ${score}`;
      scoresList.appendChild(li);
  });
});

// NEW: Game Paused event for when players disconnect
socket.on("gamePaused", (message) => {
    infoBox.textContent = `Game Paused: ${message}`;
    gameHasStarted = false; // Pause game state on frontend
    chatInput.disabled = true; // Disable chat
    colorPalette.style.display = 'none'; // Hide drawing tools
    clearCanvasBtn.style.display = 'none';
});

// NEW: Room Error (e.g., if room details can't be fetched)
socket.on("roomError", (message) => {
    infoBox.textContent = `Error: ${message}. Returning to lobby.`;
    alert(`Error: ${message}.`);
    setTimeout(() => {
        window.location.href = 'index.html'; // Or redirect to a general lobby page
    }, 3000);
});
