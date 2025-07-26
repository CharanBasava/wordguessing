# Drawsarous

Drawsarous is a **real-time multiplayer drawing and guessing game** web application.
Users can create and join private rooms, draw, chat, guess secret words, and compete to win in turn-based rounds. The app uses secure authentication, real-time gameplay with Socket.IO, persistent storage in SQLite, and a responsive frontend.

---

## Project Overview

Drawsarous lets friends play a classic Pictionary-style game online! Register, create or join private rooms with a code, and take turns drawing and guessing secret words.
All drawing, chat, scoring, and turns sync instantly with Socket.IO.

### Key Objectives:
- Secure user sign up and login.
- Room creation/joining by unique code to play with friends.
- Real-time shared drawing board and chat.
- Automatic word selection, turn-taking, and dynamic score tracking.
- Responsive, friendly UI for desktop and mobile.

---

## Features

- **User Authentication:** Sign-up, login, and logout with secure password hashing.
- **Room Creation & Join:** Create or join rooms using a private code.
- **Live Drawing Board:** Real-time synchronized multiplayer whiteboard.
- **In-Room Chat:** Chat in real time with your fellow players.
- **Turn and Role Logic:** Each round, one player draws, others guess.
- **Secret Words:** Random word chosen each round, only visible to the drawer.
- **Scoreboard:** Live tracking and win detection.
- **Winner Announcement:** Automatic game over when reaching target score.
- **Session Protection:** All core pages require valid login.
- **Frontend Feedback:** In-page errors/success and mobile-friendly.

---

## Technologies Used

- **Node.js & Express.js:** Backend server
- **Socket.IO:** Real-time drawing, chat, and gameplay
- **SQLite:** Local file database for users and rooms
- **bcrypt:** Secure password hashing for users
- **Vanilla HTML/CSS/JS:** Responsive UI
- **Render.com or Railway.app:** Free cloud hosting
- *(Add your UI framework if used, e.g., Tailwind or Bootstrap)*

---

## Project Structure

``` project-root/
├─ assets/
│ ├─ backend/
│ │ ├─ server.js
│ │ ├─ db.js
│ │ ├─ routes/
│ │ ├─ models/
│ └─ frontend/
│ ├─ index.html
│ ├─ signup.html
│ ├─ login.html
│ ├─ create-room.html
│ ├─ join-room.html
│ ├─ game.html
│ ├─ game.js
│ └─ game.css
├─ package.json
├─ README.md ```


---

## 🚀 How to Use Drawsarous

1. **Sign Up:** Register a new account with email and password.
2. **Login:** Enter your credentials to access the app.
3. **Create a Room:** Generate a private room and share the code.
4. **Join a Room:** Enter a friend's code to join their game.
5. **Play:** Take turns drawing the secret word while others guess via chat. Correct guesses earn points and rotate the drawer.



---

## 📝 Deployment

- Push your app to GitHub.
- Deploy for free on [Render.com](https://render.com/) or [Railway.app](https://railway.app/).
    - **Root Directory:** `assets/backend`
    - **Build Command:** `npm install`
    - **Start Command:** `node server.js`
- Make sure your SQLite database file is in the backend directory.
- Share your Render/Railway public URL with friends!

---

## 📦 Future Enhancements

- Add public lobbies and room lists
- Word hints and masked/underscored word visualization
- More robust mobile UI, dark mode
- Player avatars and badges
- Rematch/new game workflow
- Chat moderation and anti-spam tools

---


**Enjoy drawing, guessing, and competing with friends — anytime!**

6. **Win:** First to the target score is crowned winner!

---



