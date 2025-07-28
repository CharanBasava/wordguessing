const db = require('../db');

// Create a new room (UPDATED)
// Now accepts totalGameTime and inserts it into the database
function createRoom(roomCode, maxPlayers, totalGameTime, callback) {
  // UPDATED: Added total_game_time to the INSERT query
  const query = `INSERT INTO rooms (room_code, max_players, total_game_time) VALUES (?, ?, ?)`;
  // UPDATED: Added totalGameTime to the parameters
  db.run(query, [roomCode, maxPlayers, totalGameTime], function (err) {
    callback(err, this?.lastID);
  });
}

// Get room by code (UNCHANGED, but will return new column)
function getRoomByCode(roomCode, callback) {
  const query = `SELECT * FROM rooms WHERE room_code = ?`;
  db.get(query, [roomCode], callback);
}

module.exports = { createRoom, getRoomByCode };
