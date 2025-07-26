// --- Get room from URL ---
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room') || '';
document.getElementById('roomId').textContent = roomId;

// --- Get logged-in user info ---
const userId = localStorage.getItem('userId');
const name = localStorage.getItem('name') || "Player"; // UPDATED: Use name from localStorage

// 🔌 Connect to socket.io
const socket = io();

// 🧑‍🤝‍🧑 Join the room with user info
socket.emit('joinRoom', { roomId, userId, name }); // UPDATED: Send name

// --- Game State Variables ---
let gameHasStarted = false;
let playersMap = {}; // To map userId to name for scores { userId: name }

// --- Canvas setup ---
const canvas = document.getElementById("drawingBoard");
const ctx = canvas.getContext("2d");
const colorPalette = document.querySelector(".color-palette");
const chatInput = document.getElementById('chatInput');

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
  if (!gameHasStarted || !drawingEnabled) return; // UPDATED: Check if game has started and if this player can draw
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
  if (!drawing || !gameHasStarted || !drawingEnabled) return; // UPDATED
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
document.querySelector('.color-option[data-color="#000000"]').classList.add('selected');
document.getElementById("penTool").classList.add('selected');

// --- Timer ---
let timeLeft = 60;
const timerDisplay = document.getElementById("timer");
const timerInterval = setInterval(() => {
  if (timeLeft <= 0) {
    clearInterval(timerInterval);
    timerDisplay.textContent = "Time's up!";
  } else {
    timerDisplay.textContent = timeLeft;
    timeLeft--;
  }
}, 1000);

// --- Chat ---
const chatBox = document.getElementById('chatBox');
chatInput.addEventListener("keydown", (e) => {
  if (!gameHasStarted) return; // Can't chat/guess before game starts
  if (e.key === "Enter" && chatInput.value.trim()) {
    const message = chatInput.value.trim();
    socket.emit("message", { roomId, message });
    if (!drawingEnabled) { // The drawer cannot guess
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

// NEW LISTENERS for 2-player start
socket.on("waitingForPlayers", (playerCount) => {
    infoBox.textContent = `Waiting for more players... (${playerCount}/2)`;
    colorPalette.style.display = 'none'; // Hide drawing tools
});

socket.on("gameStart", () => {
    gameHasStarted = true;
    infoBox.textContent = "Game has started! Good luck!";
});

// UPDATED gameState listener
socket.on("gameState", ({ drawerId, drawerName }) => {
  const myId = localStorage.getItem("userId");
  if (myId == drawerId) {
    drawingEnabled = true;
    colorPalette.style.display = 'flex'; // Show drawing tools
    chatInput.placeholder = "You are drawing, you can't guess!";
  } else {
    drawingEnabled = false;
    colorPalette.style.display = 'none'; // Hide drawing tools
    infoBox.textContent = `🎨 ${drawerName} is drawing!`;
    chatInput.placeholder = "Type your guess...";
  }
});

socket.on("drawerWord", (word) => {
  infoBox.textContent = `🖊️ Your word is: ${word}`;
});

socket.on("guessedCorrect", (guesserName, word) => {
  const div = document.createElement("div");
  div.style.fontWeight = "bold";
  div.style.color = "green";
  div.textContent = `🎉 ${guesserName} guessed the word: "${word}"!`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
});

// UPDATED Player List to show names
const playersList = document.getElementById('playersList');
socket.on("updatePlayers", (playerNames) => {
  playersList.innerHTML = "";
  playerNames.forEach(playerName => {
    const li = document.createElement("li");
    li.textContent = playerName;
    playersList.appendChild(li);
  });
});

// UPDATED Scores to display with names
const scoresList = document.getElementById('scoresList');
socket.on("scoreUpdate", ({ scores, players }) => {
  scoresList.innerHTML = "";
  
  // Build a fresh map of userId -> name
  playersMap = players.reduce((map, player) => {
      map[player.userId] = player.name;
      return map;
  }, {});

  for (const pId in scores) {
      const playerName = playersMap[pId] || 'Unknown';
      const li = document.createElement("li");
      li.textContent = `${playerName}: ${scores[pId]}`;
      scoresList.appendChild(li);
  }
});

// UPDATED Game Over to use name
socket.on("gameOver", (winnerName) => {
  alert(`🏆 Game over! Winner: ${winnerName}`);
  infoBox.textContent = `Game Over! ${winnerName} is the winner!`;
  gameHasStarted = false;
});
