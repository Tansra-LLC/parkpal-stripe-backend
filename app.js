
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Dummy subscription map
const users = {
  "user@example.com": { subscribed: true }
};

app.post('/api/login', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send('Email required');
  const token = jwt.sign({ email }, process.env.JWT_SECRET);
  res.json({ token });
});

app.get('/api/subscription-status', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).send('Unauthorized');
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = users[decoded.email];
    res.json({ subscribed: user?.subscribed || false });
  } catch (e) {
    res.status(401).send('Invalid token');
  }
});

app.get('/api/parking-segments', (req, res) => {
  const data = require('./parking_data.json');
  res.json(data);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
