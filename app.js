const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// -------------------------
// Load parking data
// -------------------------
// Make sure you have a parking.json file in the same folder as app.js
// It should contain all your segments from the other tab.
const parkingFilePath = path.join(__dirname, 'parking.json');
let parkingSegments = [];

try {
    const data = fs.readFileSync(parkingFilePath, 'utf8');
    parkingSegments = JSON.parse(data);
    console.log(`Loaded ${parkingSegments.length} parking segments`);
} catch (err) {
    console.error("Error reading parking.json:", err);
}

// -------------------------
// Routes
// -------------------------

// GET /parking - returns all parking segments
app.get('/parking', (req, res) => {
    res.json(parkingSegments);
});

// POST /signup - create a test user
let testUsers = [];

app.post('/signup', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
    }

    const existingUser = testUsers.find(u => u.username === username);
    if (existingUser) {
        return res.status(409).json({ error: "User already exists" });
    }

    const newUser = { username, password };
    testUsers.push(newUser);
    console.log(`New user created: ${username}`);

    res.json({ message: "User created successfully", user: { username } });
});

// POST /login - simple login check
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = testUsers.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
    }
    res.json({ message: "Login successful", user: { username } });
});

// Health check
app.get('/', (req, res) => {
    res.send("SpotPal backend is running");
});

// Start server
app.listen(port, () => {
    console.log(`SpotPal backend running on port ${port}`);
});
