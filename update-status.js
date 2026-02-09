#!/usr/bin/env node
/**
 * Update agent status on Face v2
 * Usage: node update-status.js <status> "Task" "Detail" [progress]
 * Example: node update-status.js working "Building feature" "50% complete" 50
 */

const http = require('http');

const FACE_PORT = 3334;
const AGENT_ID = process.env.AGENT_ID || 'raven';

const args = process.argv.slice(2);
const status = args[0] || 'online';
const task = args[1] || '';
const detail = args[2] || null;
const progress = args[3] ? parseInt(args[3]) : null;

const data = JSON.stringify({ status, task, detail, progress });

const options = {
    hostname: 'localhost',
    port: FACE_PORT,
    path: `/api/status/${AGENT_ID}`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log(`✓ AGENT ${AGENT_ID.toUpperCase()} | ${status.toUpperCase()} | ${task || 'Ready'}`);
            if (detail) console.log(`  ${detail}`);
            if (progress !== null) console.log(`  Progress: ${progress}%`);
        } else {
            console.error(`✗ Failed: ${body}`);
        }
    });
});

req.on('error', (e) => {
    console.error(`✗ Face not responding: ${e.message}`);
    console.log('Make sure face-v2 is running: cd face-v2 && npm start');
});

req.write(data);
req.end();
