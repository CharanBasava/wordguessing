const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const { v4: uuidv4 } = require('uuid');

// 🔸 Route: Create a new room
// POST /api/rooms/create
router.post('/create', (req, res) => {
  const maxPlayers = req.body.maxPlayers || 6;
  const roomCode = uuidv4().split('-')[0].toLowerCase(); // short unique ID like "a1b2"

  Room.createRoom(roomCode, maxPlayers, (err, roomId) => {
    if (err) return res.status(500).json({ message: 'Could not create room.' });
    res.status(201).json({ success: true, roomCode });
  });
});

// 🟢 Route: Check if a room exists
// GET /api/rooms/check?roomCode=a1b2
router.get('/check', (req, res) => {
  const { roomCode } = req.query;

  Room.getRoomByCode(roomCode, (err, room) => {
    if (err) return res.status(500).json({ message: 'Server error' });

    res.json({ exists: !!room });
  });
});

module.exports = router;
