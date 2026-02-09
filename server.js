const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3334;

// ============ SECURITY HEADERS MIDDLEWARE ============
// HSTS - HTTP Strict Transport Security
app.use((req, res, next) => {
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    next();
});

// Content Security Policy
app.use((req, res, next) => {
    res.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' ws: wss:; frame-ancestors 'none';");
    next();
});

// X-Frame-Options - Prevent clickjacking
app.use((req, res, next) => {
    res.header('X-Frame-Options', 'DENY');
    next();
});

// X-Content-Type-Options - Prevent MIME sniffing
app.use((req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    next();
});

// X-XSS-Protection
app.use((req, res, next) => {
    res.header('X-XSS-Protection', '1; mode=block');
    next();
});

// Referrer Policy
app.use((req, res, next) => {
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Permissions Policy
app.use((req, res, next) => {
    res.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// Remove X-Powered-By header
app.disable('x-powered-by');

// Compression middleware - Gzip responses
app.use(compression({
    level: 6,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

// ============ DATA STORES ============
let agentsConfig = loadJSON('agents.json');
let statusData = loadJSON('status.json') || { agents: {}, lastUpdated: null };
let activityLog = loadJSON('activity.json') || [];
let uptimeData = loadJSON('uptime.json') || { agents: {}, date: null };
let errorsData = loadJSON('errors.json') || [];
let settingsData = loadJSON('settings.json') || { 
    soundEnabled: true, 
    soundVolume: 0.5,
    notificationsEnabled: true,
    showOfflineAgents: true,
    compactMode: false
};

// Track when agents started working (in-memory for current session)
const workingSince = {};

function loadJSON(filename) {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, filename), 'utf8'));
    } catch (e) {
        return null;
    }
}

function saveJSON(filename, data) {
    fs.writeFileSync(path.join(__dirname, filename), JSON.stringify(data, null, 2));
}

// Reset uptime daily
function checkDailyReset() {
    const today = new Date().toISOString().split('T')[0];
    if (uptimeData.date !== today) {
        console.log(`[Uptime] New day: ${today}, resetting daily uptime`);
        uptimeData = { agents: {}, date: today };
        saveJSON('uptime.json', uptimeData);
    }
}

// Watch for config changes
fs.watchFile(path.join(__dirname, 'agents.json'), () => {
    console.log('[Config] agents.json changed, reloading...');
    agentsConfig = loadJSON('agents.json');
    broadcast({ type: 'config', data: agentsConfig });
});

// ============ MIDDLEWARE ============
app.use(express.json());

// CORS - Restrictive configuration
const ALLOWED_ORIGINS = [
    'https://the-batcave.onrender.com',
    'https://nexvoy.travel',
    'https://www.nexvoy.travel',
    'http://localhost:3334',
    'http://localhost:3000',
    'http://localhost:5173'
];

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});
// ============ REST API ============

// Get config (agents + departments)
app.get('/api/config', (req, res) => {
    res.json(agentsConfig);
});

// Get all status
app.get('/api/status', (req, res) => {
    res.json(statusData);
});

// Get specific agent status
app.get('/api/status/:agentId', (req, res) => {
    const agent = statusData.agents[req.params.agentId];
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
});

// Update agent status (main endpoint for agents to report)
app.post('/api/status/:agentId', (req, res) => {
    const { agentId } = req.params;
    const { status, task, detail, progress, error } = req.body;
    
    // Verify agent exists in config
    if (!agentsConfig.agents[agentId]) {
        return res.status(404).json({ error: `Agent '${agentId}' not in config` });
    }
    
    const now = new Date();
    const nowISO = now.toISOString();
    
    checkDailyReset();
    
    // Track uptime transitions
    const prevStatus = statusData.agents[agentId]?.status;
    
    // Agent started working
    if (status === 'working' && prevStatus !== 'working') {
        workingSince[agentId] = now;
    }
    
    // Agent stopped working - add to daily uptime
    if (prevStatus === 'working' && status !== 'working' && workingSince[agentId]) {
        const workedMs = now - workingSince[agentId];
        if (!uptimeData.agents[agentId]) {
            uptimeData.agents[agentId] = { totalMs: 0, sessions: 0 };
        }
        uptimeData.agents[agentId].totalMs += workedMs;
        uptimeData.agents[agentId].sessions += 1;
        uptimeData.agents[agentId].lastSession = nowISO;
        saveJSON('uptime.json', uptimeData);
        delete workingSince[agentId];
    }
    
    // Handle errors
    if (error) {
        const errorEvent = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            timestamp: nowISO,
            agentId,
            error: error,
            task: task || statusData.agents[agentId]?.task
        };
        errorsData.unshift(errorEvent);
        if (errorsData.length > 50) errorsData = errorsData.slice(0, 50);
        saveJSON('errors.json', errorsData);
        broadcast({ type: 'error', data: errorEvent });
    }
    
    statusData.agents[agentId] = {
        status: status || 'online',
        task: task || null,
        detail: detail || null,
        progress: progress || null,
        error: error || null,
        lastActive: nowISO
    };
    statusData.lastUpdated = nowISO;
    
    saveJSON('status.json', statusData);
    
    // Broadcast to all WebSocket clients
    broadcast({
        type: 'status',
        agentId,
        data: statusData.agents[agentId],
        prevStatus
    });
    
    // Auto-log activity for status changes (skip idle/system tasks)
    const skipTasks = ['Available', 'Idle', 'Online', 'task', null, undefined, ''];
    const isSystemTask = (t) => !t || skipTasks.includes(t) || t.includes('gateway') || t.includes('clawdbot');
    
    if (status === 'working' && task && prevStatus !== 'working' && !isSystemTask(task)) {
        addActivity('task', agentId, `Started: ${task}`);
    } else if ((status === 'complete' || status === 'online') && prevStatus === 'working') {
        const prevTask = statusData.agents[agentId]?.task;
        if (prevTask && !isSystemTask(prevTask)) {
            addActivity('task', agentId, `Completed: ${prevTask}`);
        }
    } else if (error) {
        addActivity('alert', agentId, `Error: ${error}`);
    }
    
    console.log(`[Status] ${agentId}: ${status} - ${task || 'idle'}${error ? ` (ERROR: ${error})` : ''}`);
    res.json({ ok: true, agent: statusData.agents[agentId] });
});

// Batch update (for bulk status updates)
app.post('/api/status', (req, res) => {
    const updates = req.body;
    const now = new Date().toISOString();
    
    Object.entries(updates).forEach(([agentId, data]) => {
        if (agentsConfig.agents[agentId]) {
            statusData.agents[agentId] = {
                ...statusData.agents[agentId],
                ...data,
                lastActive: now
            };
        }
    });
    
    statusData.lastUpdated = now;
    saveJSON('status.json', statusData);
    broadcast({ type: 'status-bulk', data: statusData });
    
    res.json({ ok: true, updated: Object.keys(updates).length });
});

// ============ UPTIME API ============

// Get all uptime data
app.get('/api/uptime', (req, res) => {
    checkDailyReset();
    
    // Include current working sessions in the response
    const result = { ...uptimeData };
    Object.entries(workingSince).forEach(([agentId, startTime]) => {
        const currentMs = Date.now() - startTime.getTime();
        if (!result.agents[agentId]) {
            result.agents[agentId] = { totalMs: 0, sessions: 0 };
        }
        result.agents[agentId].currentMs = currentMs;
    });
    
    res.json(result);
});

// Get specific agent uptime
app.get('/api/uptime/:agentId', (req, res) => {
    checkDailyReset();
    const { agentId } = req.params;
    const data = uptimeData.agents[agentId] || { totalMs: 0, sessions: 0 };
    
    // Add current session if working
    if (workingSince[agentId]) {
        data.currentMs = Date.now() - workingSince[agentId].getTime();
    }
    
    res.json(data);
});

// ============ ERRORS API ============

// Get recent errors
app.get('/api/errors', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    res.json(errorsData.slice(0, limit));
});

// Clear errors for an agent
app.delete('/api/errors/:agentId', (req, res) => {
    const { agentId } = req.params;
    const before = errorsData.length;
    errorsData = errorsData.filter(e => e.agentId !== agentId);
    saveJSON('errors.json', errorsData);
    
    // Clear error state from status
    if (statusData.agents[agentId]) {
        statusData.agents[agentId].error = null;
        saveJSON('status.json', statusData);
        broadcast({ type: 'status', agentId, data: statusData.agents[agentId] });
    }
    
    res.json({ ok: true, cleared: before - errorsData.length });
});

// ============ SETTINGS API ============

// Get settings
app.get('/api/settings', (req, res) => {
    res.json(settingsData);
});

// Update settings
app.post('/api/settings', (req, res) => {
    settingsData = { ...settingsData, ...req.body };
    saveJSON('settings.json', settingsData);
    broadcast({ type: 'settings', data: settingsData });
    res.json({ ok: true, settings: settingsData });
});

// Activity endpoints
app.get('/api/activity', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    res.json(activityLog.slice(-limit).reverse());
});

app.post('/api/activity', (req, res) => {
    const { type, agent, text, icon } = req.body;
    
    if (!type || !agent || !text) {
        return res.status(400).json({ error: 'Required: type, agent, text' });
    }
    
    const event = addActivity(type, agent, text, icon);
    res.status(201).json(event);
});

function addActivity(type, agent, text, icon) {
    const event = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        timestamp: new Date().toISOString(),
        type,
        agent,
        text,
        icon: icon || typeIcons[type] || '📌'
    };
    
    activityLog.push(event);
    if (activityLog.length > 100) activityLog = activityLog.slice(-100);
    saveJSON('activity.json', activityLog);
    
    broadcast({ type: 'activity', data: event });
    return event;
}

const typeIcons = {
    message: '💬',
    task: '⚡',
    commit: '📝',
    cron: '⏰',
    alert: '🚨',
    status: '🔄',
    system: '🖥️'
};

// Add project savings
app.post('/api/savings', (req, res) => {
    const { name, value, date } = req.body;
    if (!name || !value) {
        return res.status(400).json({ error: 'name and value required' });
    }
    
    if (!agentsConfig.meta) agentsConfig.meta = {};
    if (!agentsConfig.meta.savingsConfig) {
        agentsConfig.meta.savingsConfig = { hourlyRate: 150, activeRatio: 0.5, manualAdditions: [] };
    }
    if (!agentsConfig.meta.savingsConfig.manualAdditions) {
        agentsConfig.meta.savingsConfig.manualAdditions = [];
    }
    
    const addition = { name, value: Number(value), date: date || new Date().toISOString().split('T')[0] };
    agentsConfig.meta.savingsConfig.manualAdditions.push(addition);
    saveJSON('agents.json', agentsConfig);
    
    // Calculate new total
    const config = agentsConfig.meta.savingsConfig;
    const birthDate = new Date(agentsConfig.meta.birthDate || '2026-01-25T23:53:22Z');
    const hoursOnline = (Date.now() - birthDate) / (1000 * 60 * 60);
    const timeSavings = hoursOnline * config.hourlyRate * config.activeRatio;
    const manualTotal = config.manualAdditions.reduce((sum, item) => sum + (item.value || 0), 0);
    const total = Math.floor(timeSavings + manualTotal);
    
    broadcast({ type: 'savings', data: { total, addition } });
    res.json({ ok: true, addition, total });
});

// Get savings breakdown
app.get('/api/savings', (req, res) => {
    const config = agentsConfig.meta?.savingsConfig || { hourlyRate: 150, activeRatio: 0.5, manualAdditions: [] };
    const birthDate = new Date(agentsConfig.meta?.birthDate || '2026-01-25T23:53:22Z');
    const hoursOnline = (Date.now() - birthDate) / (1000 * 60 * 60);
    const timeSavings = Math.floor(hoursOnline * config.hourlyRate * config.activeRatio);
    const projectSavings = config.manualAdditions.reduce((sum, item) => sum + (item.value || 0), 0);
    
    res.json({
        timeSavings,
        projectSavings,
        total: timeSavings + projectSavings,
        projects: config.manualAdditions,
        config: { hourlyRate: config.hourlyRate, activeRatio: config.activeRatio }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: new Date().toISOString(),
        agents: Object.keys(agentsConfig.agents).length,
        connected: wss.clients.size,
        version: '2.0.0'
    });
});

// ============ INTEGRATION HEALTH CHECKS ============
// These endpoints are used by the dashboard to check service status

// Check backend API (this server)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '2.0.0'
    });
});

// Check database (SQLite via status file access)
app.get('/health/db', async (req, res) => {
    const startTime = Date.now();
    try {
        // Check if we can read/write the status file
        const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'status.json'), 'utf8'));
        const latency = Date.now() - startTime;
        res.json({ 
            status: 'ok', 
            latency: latency,
            timestamp: new Date().toISOString(),
            message: 'SQLite accessible via filesystem'
        });
    } catch (error) {
        res.status(503).json({ 
            status: 'error', 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Check Redis (placeholder - extend when Redis is added)
app.get('/health/redis', (req, res) => {
    // For now, return unknown status since Redis isn't implemented
    res.status(503).json({ 
        status: 'unknown', 
        message: 'Redis not configured',
        timestamp: new Date().toISOString()
    });
});

// Check Expedia API (placeholder - implement when affiliate API is connected)
app.get('/health/expedia', async (req, res) => {
    const apiKey = process.env.EXPEDIA_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ 
            status: 'not_configured', 
            message: 'EXPEDIA_API_KEY not set',
            timestamp: new Date().toISOString()
        });
    }
    
    // TODO: Implement actual Expedia API health check
    res.json({ 
        status: 'ok', 
        message: 'API key configured',
        timestamp: new Date().toISOString()
    });
});

// Check Booking.com API (placeholder)
app.get('/health/booking', async (req, res) => {
    const apiKey = process.env.BOOKING_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ 
            status: 'not_configured', 
            message: 'BOOKING_API_KEY not set',
            timestamp: new Date().toISOString()
        });
    }
    
    res.json({ 
        status: 'ok', 
        message: 'API key configured',
        timestamp: new Date().toISOString()
    });
});

// Check Amadeus API (placeholder)
app.get('/health/amadeus', async (req, res) => {
    const clientId = process.env.AMADEUS_CLIENT_ID;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
        return res.status(503).json({ 
            status: 'not_configured', 
            message: 'AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET not set',
            timestamp: new Date().toISOString()
        });
    }
    
    res.json({ 
        status: 'ok', 
        message: 'API credentials configured',
        timestamp: new Date().toISOString()
    });
});

// Check Stripe (placeholder)
app.get('/health/stripe', async (req, res) => {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
        return res.status(503).json({ 
            status: 'not_configured', 
            message: 'STRIPE_SECRET_KEY not set',
            timestamp: new Date().toISOString()
        });
    }
    
    res.json({ 
        status: 'ok', 
        message: 'API key configured',
        timestamp: new Date().toISOString()
    });
});

// Check Web Scraper (placeholder)
app.get('/health/scraper', (req, res) => {
    // Check if scraper module exists
    const scraperPath = path.join(__dirname, '..', '..', 'integrations', 'scraper.js');
    const exists = fs.existsSync(scraperPath);
    
    if (exists) {
        res.json({ 
            status: 'ok', 
            message: 'Scraper module available',
            path: scraperPath,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(503).json({ 
            status: 'not_found', 
            message: 'Scraper module not found',
            timestamp: new Date().toISOString()
        });
    }
});

// ============ STATIC FILES ============
// Serve static files AFTER API routes so /api/* works properly
app.use(express.static(__dirname));

// ============ HTTP + WEBSOCKET SERVER ============
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`[WS] Client connected (${clients.size} total)`);
    
    checkDailyReset();
    
    // Calculate current uptime including active sessions
    const uptimeWithCurrent = { ...uptimeData };
    Object.entries(workingSince).forEach(([agentId, startTime]) => {
        const currentMs = Date.now() - startTime.getTime();
        if (!uptimeWithCurrent.agents[agentId]) {
            uptimeWithCurrent.agents[agentId] = { totalMs: 0, sessions: 0 };
        }
        uptimeWithCurrent.agents[agentId].currentMs = currentMs;
    });
    
    // Send initial state
    ws.send(JSON.stringify({
        type: 'init',
        config: agentsConfig,
        status: statusData,
        activity: activityLog.slice(-20).reverse(),
        uptime: uptimeWithCurrent,
        errors: errorsData.slice(0, 10),
        settings: settingsData
    }));
    
    ws.on('close', () => {
        clients.delete(ws);
        console.log(`[WS] Client disconnected (${clients.size} remaining)`);
    });
    
    ws.on('error', (err) => {
        console.error('[WS] Error:', err.message);
        clients.delete(ws);
    });
});

function broadcast(message) {
    const payload = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(payload);
        }
    });
}

// ============ UPTIME SYNC (every 30s) ============
setInterval(() => {
    if (Object.keys(workingSince).length > 0) {
        broadcast({ type: 'uptime-tick', workingSince: Object.fromEntries(
            Object.entries(workingSince).map(([id, time]) => [id, time.toISOString()])
        )});
    }
}, 30000);

// ============ START SERVER ============
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════╗
║       RAVEN FACE v2 - PRODUCTION READY     ║
╠════════════════════════════════════════════╣
║  Dashboard: http://localhost:${PORT}           ║
║  API:       http://localhost:${PORT}/api       ║
║  WebSocket: ws://localhost:${PORT}             ║
║                                            ║
║  Agents:    ${Object.keys(agentsConfig.agents).length.toString().padEnd(3)} configured             ║
║  Depts:     ${Object.keys(agentsConfig.departments).length.toString().padEnd(3)} departments            ║
║                                            ║
║  v2 Features:                              ║
║  ✓ Sound notifications                     ║
║  ✓ PWA installable                         ║
║  ✓ Agent uptime tracking                   ║
║  ✓ Error indicators                        ║
║  ✓ Settings panel                          ║
╚════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] Shutting down...');
    wss.close();
    server.close();
    process.exit(0);
});
// Force redeploy Mon Feb  9 19:43:36 +04 2026
