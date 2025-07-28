const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const { v4: uuidv4 } = require('uuid');


// 🔸 Route: Create a new room (UPDATED)
// POST /api/rooms/create
router.post('/create', (req, res) => {
  // UPDATED: Destructure maxPlayers and totalGameTime from the request body
  const { maxPlayers, totalGameTime } = req.body; 

  const roomCode = uuidv4().split('-')[0].toLowerCase(); // short unique ID like "a1b2"

  // Basic validation for parameters received
  if (!maxPlayers || maxPlayers < 2 || maxPlayers > 12) {
    return res.status(400).json({ message: 'Invalid max players specified. Must be between 2 and 12.' });
  }
  if (!totalGameTime || totalGameTime < 1 || totalGameTime > 60) {
    return res.status(400).json({ message: 'Invalid total game time specified. Must be between 1 and 60 minutes.' });
  }

  // UPDATED: Pass totalGameTime to the createRoom function
  Room.createRoom(roomCode, maxPlayers, totalGameTime, (err, roomId) => {
    if (err) {
      console.error("Error creating room:", err); // Log the error for debugging
      return res.status(500).json({ message: 'Could not create room.' });
    }
    res.status(201).json({ success: true, roomCode });
  });
});


// 🟢 Route: Check if a room exists (UNCHANGED)
// GET /api/rooms/check?roomCode=a1b2
router.get('/check', (req, res) => {
  const { roomCode } = req.query;

  Room.getRoomByCode(roomCode, (err, room) => {
    if (err) return res.status(500).json({ message: 'Server error' });

    res.json({ exists: !!room });
  });
});


module.exports = router;
