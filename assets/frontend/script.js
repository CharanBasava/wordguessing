// Redirect to login page
function login() {
  window.location.href = "login.html";
}

// Redirect to play now (can be game or mode selector)
function playNow() {
  alert("Play Now clicked! Redirecting...");
  // You can also use window.location.href = 'game.html';
}

// Join public or private room
function joinRoom(type) {
  const username = document.getElementById("username").value.trim();

  if (!username) {
    alert("Please enter your name");
    return;
  }

  // Check login only for private room
  if (type === "private") {
    const loggedIn = localStorage.getItem("loggedIn") === "true";

    if (!loggedIn) {
      alert("Login is required to join a private room.");
      window.location.href = "login.html";
      return;
    }
  }

  // Save username in localStorage for use in game
  localStorage.setItem("username", username);

  // Redirect to game.html with room type
  window.location.href = `game.html?room=${type}`;
}
