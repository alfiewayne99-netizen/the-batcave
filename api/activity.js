const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const activityPath = path.join(__dirname, '..', 'activity.json');
    const limit = parseInt(req.query.limit) || 20;
    const activity = JSON.parse(fs.readFileSync(activityPath, 'utf8'));
    res.status(200).json({ activity: activity.slice(0, limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load activity', message: err.message });
  }
};
