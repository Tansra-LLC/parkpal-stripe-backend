// app.js (CommonJS)
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// --- File paths (adjust the filename if your parking file is named differently) ---
const USERS_FILE = path.join(__dirname, "users.json");
const PARKING_FILE = path.join(__dirname, "parkingSegments.json");

// --- Ensure users.json exists ---
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "[]", "utf-8");
}

// --- Helpers to load/save users ---
function loadUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf-8");
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

// --- Health check (optional) ---
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "parkpal-backend" });
});

// --- SIGNUP ---
app.post("/signup", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const users = loadUsers();
  const exists = users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (exists) return res.status(400).json({ error: "User already exists" });

  const hashed = await bcrypt.hash(password, 10);
  users.push({ email, password: hashed, createdAt: new Date().toISOString() });
  saveUsers(users);

  return res.json({ success: true });
});

// --- LOGIN ---
app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  // Simple success payload (you can add a token later if you need)
  return res.json({ success: true });
});

// --- PARKING DATA ---
app.get("/parking", (_req, res) => {
  try {
    if (!fs.existsSync(PARKING_FILE)) {
      return res.status(500).json({ error: "parkingSegments.json not found" });
    }
    const data = JSON.parse(fs.readFileSync(PARKING_FILE, "utf-8") || "[]");
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: "Failed to read parking data" });
  }
});

// Optional alias if your iOS code still calls /parking-segments:
app.get("/parking-segments", (req, res) => {
  req.url = "/parking";
  app._router.handle(req, res);
});

app.listen(PORT, () => {
  console.log(`✅ ParkPal backend running on :${PORT}`);
});
