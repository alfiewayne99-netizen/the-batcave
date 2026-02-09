const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const configPath = path.join(__dirname, '..', 'agents.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    res.status(200).json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load config', message: err.message });
  }
};
