const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Example subscription check endpoint
app.get('/api/check-subscription', (req, res) => {
    // Replace this logic with real subscription check
    res.json({ active: true });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});