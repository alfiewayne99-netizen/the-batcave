const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const statusPath = path.join(__dirname, '..', 'status.json');
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    res.status(200).json(status);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load status', message: err.message });
  }
};
