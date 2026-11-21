const express = require('express');
const path = require('path');

const app = express();

// Middleware: JSON parsing & static assets
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Basic health check for setup verification
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'group-expense-splitter' });
});

module.exports = app;
