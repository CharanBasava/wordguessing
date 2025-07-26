const db = require('../db');

// Create a new room
function createRoom(roomCode, maxPlayers, callback) {
  const query = `INSERT INTO rooms (room_code, max_players) VALUES (?, ?)`;
  db.run(query, [roomCode, maxPlayers], function (err) {
    callback(err, this?.lastID);
  });
}

// Get room by code
function getRoomByCode(roomCode, callback) {
  const query = `SELECT * FROM rooms WHERE room_code = ?`;
  db.get(query, [roomCode], callback);
}

module.exports = { createRoom, getRoomByCode };
