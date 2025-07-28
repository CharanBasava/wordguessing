const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const User = require('../models/User');

// ------------------
// SIGN UP Route (UPDATED)
// ------------------
router.post('/signup', async (req, res) => {
  // UPDATED: Destructure 'name' from the request body
  const { name, username, password } = req.body;

  // Add validation for the new 'name' field
  if (!name || !username || !password) {
    return res.status(400).json({ message: 'Name, username, and password are required.' });
  }

  User.getUserByName(username, async (err, existingUser) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    if (existingUser) return res.status(400).json({ message: 'Username (email) is already taken' });

    const hashedPassword = await bcrypt.hash(password, 10);
    // UPDATED: Pass the 'name' to your user creation function
    User.addUser(name, username, hashedPassword, (err, userId) => {
      if (err) return res.status(500).json({ message: 'Could not create user' });
      res.status(201).json({ success: true, userId });
    });
  });
});

// ------------------
// LOGIN Route (UPDATED)
// ------------------
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  User.getUserByName(username, async (err, user) => {
    if (err) return res.status(500).json({ message: 'Server error.' });
    if (!user) return res.status(400).json({ message: 'Invalid username or password.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid username or password.' });

    // UPDATED: Return the user's name along with their ID
    // This assumes your `user` object from the database now includes a 'name' field
    return res.json({ success: true, userId: user.id, name: user.name });
  });
});

module.exports = router;
