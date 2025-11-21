const express = require("express");
const session = require("express-session");
const app = express();

// Session for fake SSO
app.use(
  session({
    secret: "canvas-poc-secret",
    resave: false,
    saveUninitialized: true
  })
);

// ===== TOP-LEVEL LOGIN =====
app.get("/login", (req, res) => {
  req.session.user = { name: "POC User" };  // fake login
  res.send(`
    <h1>User logged in</h1>
    <p>You now have a valid session.</p>
    <a href="/canvas" target="_blank">Open Canvas Page</a>
  `);
});

// ===== CANVAS ENDPOINT =====
app.get("/canvas", (req, res) => {
  if (!req.session.user) {
    // IMPORTANT: No redirect inside iframe
    return res.send(`
      <h3>Canvas Loaded Without Login</h3>
      <p>No SSO session detected.</p>
      <p>Please open: <a href="/login" target="_blank">/login</a> before loading Canvas.</p>
    `);
  }

  res.send(`
    <h3>Canvas App Loaded</h3>
    <p>User: ${req.session.user.name}</p>
    <p>This simulates your external app being authenticated already.</p>
  `);
});

// Allow embedding
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "ALLOWALL");
  next();
});

app.listen(3000, () => console.log("Canvas POC Running"));
