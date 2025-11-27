const express = require("express");
const session = require("express-session");
const passport = require("passport");
const Auth0Strategy = require("passport-auth0");

const path = require("path");

const app = express();

// ======================================================
//  MIDDLEWARE
// ======================================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// ====== ENV VARS =======
const auth0Domain = process.env.AUTH0_DOMAIN;
const clientID = process.env.AUTH0_CLIENT_ID;
const clientSecret = process.env.AUTH0_CLIENT_SECRET;
const callbackURL = process.env.CALLBACK_URL; // standalone callback (/callback)
const baseUrl = process.env.BASE_URL;  
const callbackURL1 = 'https://canvaspoc.onrender.com/callback';        // ex: https://canvaspoc.onrender.com

// ====== SESSION (STANDALONE ONLY) =======
app.use(
  session({
    secret: process.env.SESSION_SECRET || "canvas-poc-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax"
      // secure: true   // optional: requires HTTPS
    }
  })
);

// ====== PASSPORT (STANDALONE LOGIN FLOW) =======
passport.use(
  new Auth0Strategy(
    {
      domain: auth0Domain,
      clientID: clientID,
      clientSecret: clientSecret,
      callbackURL: callbackURL1,
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

// ===== TOP-LEVEL LOGIN (standalone) =====
app.get("/login", passport.authenticate("auth0", {
  scope: "openid profile email"
}));

// ===== AUTH0 CALLBACK (standalone) =====
app.get("/callback",
  passport.authenticate("auth0", { failureRedirect: "/error" }),
  (req, res) => {
    res.redirect("/home");
  }
);

// ===== HOME PAGE (Standalone Auth0 login) =====
app.get("/home", (req, res) => {
  if (!req.user) return res.redirect("/login");

  res.send(`
    <h1>Welcome ${req.user.displayName}</h1>
    <p>Authenticated with Auth0 successfully (standalone flow).</p>
    <a href="/canvas" target="_blank">Test Canvas</a>
    <script>
      window.opener.postMessage("auth-success", "*");
      window.close();
    </script>
  `);
});

// ====== SILENT AUTH CALLBACK FOR CANVAS ======
/*app.get("/canvas/silent", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <body>
      <script>
        const hash = window.location.hash.substring(1);
        window.parent.postMessage(hash, "*");
      </script>
    </body>
    </html>
  `);
});
*/
// ====== CANVAS ENDPOINT (GET + POST) ======
function renderCanvasHtml() {
  const silentRedirect = callbackURL;

  const authUrl =
      `https://${auth0Domain}/authorize` +
      `?client_id=${encodeURIComponent(clientID)}` +
      `&response_type=token` +
      `&scope=openid%20profile%20email` +
      `&prompt=none` +
      `&redirect_uri=${encodeURIComponent(callbackURL1)}`;

  return `
    <!DOCTYPE html>
    <html>
    <head><title>Canvas SSO</title></head>
    <body>
      <h2>Canvas SSO via Auth0 Silent Authentication</h2>

      <div id="status">Checking Auth0 session…</div>
      <div id="details"></div>

      <!-- Hidden silent-auth iframe -->
      <iframe id="auth0Frame"
              src="${authUrl}"
              style="display:none;"></iframe>

      <script>
        window.addEventListener("message", function(e) {
          const params = new URLSearchParams(e.data);
          const accessToken = params.get("access_token");
          console.log('access token received'+accessToken);
          const error = params.get("error");

          const status = document.getElementById("status");
          const details = document.getElementById("details");

          if (error === "login_required") {
            status.innerText = "No active Auth0 session.";
            details.innerHTML = \`
              <p>Please log in to Auth0 first.</p>
              <p><a href="/home" target="_blank">Click here to log in</a></p>
              <p><a id="canvasReloadLink" href="#">Reload Canvas</a></p>
               \`;
              // Attach the event AFTER the HTML is added
              const reloadLink = document.getElementById("canvasReloadLink");
              if (reloadLink) {
                reloadLink.addEventListener("click", function (e) {
                  e.preventDefault();
                  window.location.reload();
                });
              }
                      
            return;
          }

          if (accessToken) {
            status.innerText = "Authenticated via Auth0 Silent SSO.";
            details.innerHTML = \`
            <p><a href="/logout-auth0" target="_blank">Logout from Auth0</a></p>
            <p><a href="/home" target="_blank">Go to Home Page</a></p>
          \`;
          }

        });
      </script>
    </body>
    </html>
  `;
}

//app.get("/canvas", (req, res) => res.send(renderCanvasHtml()));
// ======================================================
//  CANVAS ROUTE — NO AUTH LOGIC, NO REDIRECTS HERE
// ======================================================
app.post("/canvas", (req, res) => {
  let context;

  // 1️⃣ Validate Salesforce signed_request
   try {
        context = parseSignedRequest(
            req.body.signed_request,
            process.env.CANVAS_CONSUMER_SECRET
        );
    } catch (err) {
        console.error("Canvas signature invalid:", err);
        return res.status(400).send("Invalid Canvas Request");
    }

  // 2️⃣ Check external session (Auth0 cookie)
  if (!req.isAuthenticated()) {
    return res.status(401).send("External session expired. Please login again.");
  }

  // 3️⃣ Render Canvas UI
  res.send(`
      <h2>Canvas Loaded</h2>
      <p>Salesforce User: ${context.userContext.userName}</p>
      <p>External User: ${req.user.displayName || req.user.nickname}</p>

      <button onclick="Sfdc.canvas.client.autogrow()">Resize Canvas</button>
  `);
});


/*app.post("/canvas", express.urlencoded({ extended: true }), (req, res) =>
  res.send(renderCanvasHtml())
);
*/
app.get("/logout-auth0", (req, res) => {
  const returnTo = `${process.env.BASE_URL}/home`;
  res.redirect(
    `https://${process.env.AUTH0_DOMAIN}/v2/logout`
  );
});


// ===== ERROR SCREEN =====
app.get("/error", (req, res) => {
  res.send(`
    <h1>Auth0 Error</h1>
    <pre>${JSON.stringify(req.query, null, 2)}</pre>
  `);
});

// Allow Canvas embedding
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "ALLOWALL");
  next();
});

// ===== ROOT =====
app.get("/", (req, res) => res.redirect("/home"));

const crypto = require("crypto");

function parseSignedRequest(signedRequest, consumerSecret) {
    const [encodedSig, payload] = signedRequest.split(".");

    const sig = base64urlDecode(encodedSig);
    const data = JSON.parse(base64urlDecode(payload));

    const expectedSig = crypto
        .createHmac("sha256", consumerSecret)
        .update(payload)
        .digest();

    if (Buffer.compare(sig, expectedSig) !== 0) {
        throw new Error("Invalid Canvas signature");
    }

    return data;
}

function base64urlDecode(str) {
    return Buffer.from(
        str.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
    );
}


// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Auth0 Canvas SSO running on port " + PORT));
