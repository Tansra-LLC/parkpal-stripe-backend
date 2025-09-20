const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const cors = require("cors");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- SIGNUP ---
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
  "INSERT INTO users (email, password, payed) VALUES ($1, $2, $3)",
  [email, hashed, false]
);
    res.json({ success: true });
  } catch (err) {
    console.error("Signup error:", err);
    res.json({ success: false });
  }
});

// --- LOGIN ---
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (result.rows.length === 0) return res.json({ success: false });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    res.json({ success: match });
  } catch (err) {
    console.error("Login error:", err);
    if (!match) return res.json({ success: false, message: "Invalid password" });
if (!user.payed) return res.json({ success: false, message: "Payment required" });

res.json({ success: true });

  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

