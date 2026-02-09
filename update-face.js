#!/usr/bin/env node

/**
 * Alfred Face Status Updater
 * Updates Alfred's status on the Face v2 dashboard
 */

const http = require('http');

const FACE_URL = process.env.FACE_URL || 'http://localhost:3334';

function updateStatus(status, task, detail, progress = null, error = null) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      status,
      task,
      detail,
      progress,
      error,
      timestamp: new Date().toISOString()
    });

    const options = {
      hostname: 'localhost',
      port: 3334,
      path: '/api/status/alfred',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(responseData));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

function logActivity(action, detail, meta = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      agent: 'alfred',
      action,
      detail,
      meta,
      timestamp: new Date().toISOString()
    });

    const options = {
      hostname: 'localhost',
      port: 3334,
      path: '/api/activity',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        resolve();
      });
    });

    req.on('error', () => {
      // Silent fail - don't break execution if Face is down
      resolve();
    });

    req.write(data);
    req.end();
  });
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node update-face.js <status> <task> [detail]');
    console.log('');
    console.log('Statuses: online, working, idle, error, offline');
    console.log('Examples:');
    console.log('  node update-face.js working "Building memory system" "Implementing checksums"');
    console.log('  node update-face.js idle "Waiting for user input"');
    console.log('  node update-face.js online "Ready to help"');
    process.exit(1);
  }

  const [status, task, detail] = args;

  updateStatus(status, task, detail || null)
    .then(() => {
      console.log(`✅ Face updated: ${status} - ${task}`);
      return logActivity('status_change', `Changed status to ${status}`, { task });
    })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Failed to update Face:', err.message);
      process.exit(1);
    });
}

module.exports = { updateStatus, logActivity };