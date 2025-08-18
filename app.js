const express = require('express');
const cors = require('cors');
const fs = require('fs'); // for reading parking data from a JSON file
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// -------------------------
// Load parking data
// -------------------------
// Place a file called `parking.json` in the same folder as app.js
// Example format for parking.json:
/*
[
  {
    "id": "segment1",
    "coordinates": [[-73.9712, 40.7831], [-73.9700, 40.7840]],
    "type": "No Parking"
  },
  {
    "id": "segment2",
    "coordinates": [[-73.9720, 40.7820], [-73.9710, 40.7830]],
    "type": "Free"
  }
]
*/
let parkingSegments = [];
try {
    const data = fs.readFileSync('parking.json', 'utf8');
    parkingSegments = JSON.parse(data);
} catch (err) {
    console.error("Error reading parking.json:", err);
}

// -------------------------
// Routes
// -------------------------

// GET /parking — returns all parking segments
app.get('/parking', (req, res) => {
    res.json(parkingSegments);
});

// POST /signup — simple user creation for testing
let testUsers = [];
app.post('/signup', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
    }

    const existing = testUsers.find(u => u.username === user

