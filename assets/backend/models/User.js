const db = require('../db');

// Insert new user into SQLite (UPDATED)
function addUser(name, username, password, callback) {
  // UPDATED: The query now includes the 'name' column
  const query = `INSERT INTO users (name, username, password) VALUES (?, ?, ?)`;
  // UPDATED: The parameters now include the 'name'
  db.run(query, [name, username, password], function (err) {
    callback(err, this?.lastID);
  });
}

// Get user by username (No changes needed here)
function getUserByName(username, callback) {
  const query = `SELECT * FROM users WHERE username = ?`;
  db.get(query, [username], callback);
}

module.exports = { addUser, getUserByName };
