const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public")); // Serve game.html, game.js, game.css

io.on("connection", (socket) => {
  console.log("User connected");
  // your socket logic
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
