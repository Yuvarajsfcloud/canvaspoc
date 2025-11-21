const express = require("express");
const session = require("express-session");
const passport = require("passport");
const Auth0Strategy = require("passport-auth0");
const path = require("path");

const app = express();

// ====== ENV VARS =======
const auth0Domain = process.env.AUTH0_DOMAIN;
const clientID = process.env.AUTH0_CLIENT_ID;
const clientSecret = process.env.AUTH0_CLIENT_SECRET;
const callbackURL = process.env.CALLBACK_URL;

// ====== SESSION =======
app.use(
  session({
    secret: process.env.SESSION_SECRET || "canvas-poc-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
    secure: true,
    sameSite: "lax"
}
  })
);

// ===== PASSPORT SETUP =====
passport.use(
  new Auth0Strategy(
    {
      domain: auth0Domain,
      clientID: clientID,
      clientSecret: clientSecret,
      callbackURL: callbackURL
    },
    (accessToken, refreshToken, extraParams, profile, done) => {
      return done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.use(passport.initialize());
app.use(passport.session());

// ===== TOP-LEVEL LOGIN =====
app.get("/login", passport.authenticate("auth0", {
  scope: "openid profile email"
}));

// ===== AUTH0 CALLBACK =====
app.get("/callback",
  passport.authenticate("auth0", { failureRedirect: "/error" }),
  (req, res) => {
    res.redirect("/home");
  }
);

// ===== HOME PAGE (AFTER LOGIN) =====
app.get("/home", (req, res) => {
  if (!req.user) return res.redirect("/login");

  res.send(`
    <h1>Welcome ${req.user.displayName}</h1>
    <p>Authenticated with Auth0 successfully.</p>
    <a href="/canvas" target="_blank">Open Canvas App</a>
  `);
});

// ===== CANVAS ENDPOINT =====
app.get("/canvas", (req, res) => {
  if (!req.user) {
    return res.send(`
      <h2>Canvas Loaded</h2>
      <p>No Auth0 session detected.</p>
      <a href="/login" target="_blank">Log in via Auth0</a>
    `);
  }

  res.send(`
    <h2>Canvas External App</h2>
    <p>User: ${req.user.displayName}</p>
  `);
});

// ===== CANVAS ENDPOINT =====
app.get("/error", (req, res) => {
  console.log("Auth0 Error => ", req.query);
  res.send(`
    <h1>Auth0 Login Error</h1>
    <pre>${JSON.stringify(req.query, null, 2)}</pre>
    <a href="/login">Try Again</a>
  `);
});



// ===== ALLOW IFRAME EMBEDDING =====
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "ALLOWALL");
  next();
});

// ===== ROOT =====
app.get("/", (req, res) => {
  res.redirect("/home");
});

// ===== RENDER PORT =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Auth0 Canvas POC running on port " + PORT));
