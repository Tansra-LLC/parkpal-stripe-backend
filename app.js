const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// -------------------------
// Load and transform parking data
// -------------------------
const parkingFilePath = path.join(__dirname, 'parking.data.json');
let parkingSegments = [];

try {
    const rawData = fs.readFileSync(parkingFilePath, 'utf8');
    const allSigns = JSON.parse(rawData);

    // Transform each sign to the simplified format
    parkingSegments = allSigns.map(sign => ({
        id: sign.SignID,
        blockID: sign.BlockID,
        sideNumber: sign.SideNumber,
        signNumber: sign.SignNumber,
        streetName: sign["Street Name"],
        from: sign.From,
        to: sign.To,
        type: sign["Regulation Type"],
        days: sign.Days,
        time: sign.Time
        // coordinates could be added if available
    }));

    console.log(`Loaded ${parkingSegments.length} parking segments`);
} catch (err) {
    console.error("Error reading park_data.json:", err);
}

// -------------------------
// Routes
// -------------------------
app.get('/parking', (req, res) => {
    res.json(parkingSegments);
});

// Test users
let testUsers = [];
app.post('/signup', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });

    const existingUser = testUsers.find(u => u.username === username);
    if (existingUser) return res.status(409).json({ error: "User already exists" });

    const newUser = { username, password };
    testUsers.push(newUser);
    res.json({ message: "User created", user: { username } });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = testUsers.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ error: "Invalid username or password" });
    res.json({ message: "Login successful", user: { username } });
});

app.get('/', (req, res) => {
    res.send("SpotPal backend is running");
});

app.listen(port, () => {
    console.log(`SpotPal backend running on port ${port}`);
});
