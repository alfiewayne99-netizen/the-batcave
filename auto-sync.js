#!/usr/bin/env node
/**
 * Auto-sync Clawdbot session activity to Face v2
 * Monitors ALL agent session files and updates status in real-time
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const FACE_PORT = 3334;
const AGENTS_DIR = path.join(process.env.HOME, '.clawdbot/agents');
const CHECK_INTERVAL = 500; // Fast response
const IDLE_THRESHOLD = 15000; // 15s without activity = idle
const MIN_UPDATE_INTERVAL = 5000; // Don't update same agent more than once per 5s

// Agent name mapping (folder name -> display name)
const AGENT_NAMES = {
    main: 'raven',
    mason: 'mason',
    surge: 'surge',
    archivist: 'archivist',
    canon: 'canon',
    steward: 'steward',
    counsel: 'counsel',
    reverb: 'reverb',
    foundry: 'foundry',
    vault: 'vault',
    cipher: 'cipher',
    prism: 'prism',
    quill: 'quill',
    shadow: 'shadow',
    ignite: 'ignite',
    colossus: 'colossus',
    levy: 'levy',
    arbitrage: 'arbitrage'
};

// Track state per agent
const agentState = {};

function updateFace(agentId, status, task, detail) {
    const data = JSON.stringify({ status, task, detail });
    const options = {
        hostname: 'localhost',
        port: FACE_PORT,
        path: `/api/status/${agentId}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    const req = http.request(options, () => {});
    req.on('error', () => {}); // Ignore errors
    req.write(data);
    req.end();
}

function findLatestSession(agentFolder) {
    const sessionsDir = path.join(AGENTS_DIR, agentFolder, 'sessions');
    try {
        const files = fs.readdirSync(sessionsDir)
            .filter(f => f.endsWith('.jsonl'))
            .map(f => ({
                name: f,
                path: path.join(sessionsDir, f),
                mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs
            }))
            .sort((a, b) => b.mtime - a.mtime);
        return files[0];
    } catch (e) {
        return null;
    }
}

function extractTaskFromFile(sessionPath) {
    // Read session file and find the FIRST substantive user task
    try {
        const fd = fs.openSync(sessionPath, 'r');
        const buffer = Buffer.alloc(32000); // Read first 32KB to find real task
        const bytesRead = fs.readSync(fd, buffer, 0, 32000, 0);
        fs.closeSync(fd);
        
        const content = buffer.toString('utf8', 0, bytesRead);
        const lines = content.split('\n').filter(l => l.trim());
        
        // Find user messages and extract actual task content
        for (const line of lines) {
            try {
                const json = JSON.parse(line);
                const msg = json.message || json;
                if (msg.role === 'user' && msg.content) {
                    let text = '';
                    if (typeof msg.content === 'string') {
                        text = msg.content;
                    } else if (Array.isArray(msg.content)) {
                        const textContent = msg.content.find(c => c.type === 'text');
                        text = textContent?.text || '';
                    }
                    
                    // Extract actual message content from system/channel prefixes
                    const extracted = extractActualContent(text);
                    if (!extracted) continue;
                    
                    // Skip non-task messages
                    if (isSkippableMessage(extracted)) continue;
                    
                    // Clean and return if substantial
                    const clean = extracted.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                    if (clean.length > 15) {
                        return clean.substring(0, 70) + (clean.length > 70 ? '...' : '');
                    }
                }
            } catch (e) {}
        }
    } catch (e) {}
    return 'Working';
}

function extractActualContent(text) {
    // Skip if entire message is system metadata
    if (text.startsWith('System:') && !text.includes('[Telegram') && !text.includes('[WhatsApp') && !text.includes('[Discord')) {
        return null;
    }
    
    // Remove system prefixes (System: [timestamp] ...)
    let cleaned = text.replace(/^System:.*?\n\n/gs, '');
    cleaned = cleaned.replace(/^System:.*?(?=\[)/gs, '');
    
    // Extract content after channel prefixes like [Telegram...], [WhatsApp...], [Discord...]
    const channelMatch = cleaned.match(/\[(Telegram|WhatsApp|Discord|Slack|iMessage)[^\]]*\]\s*(.+?)(?:\n\[message_id|$)/s);
    if (channelMatch) {
        cleaned = channelMatch[2].trim();
    }
    
    // Remove message_id lines
    cleaned = cleaned.replace(/\n?\[message_id:.*?\]/g, '').trim();
    
    // Remove [clawdbot] prefix if present
    cleaned = cleaned.replace(/^\[clawdbot\]\s*/i, '');
    
    return cleaned || null;
}

function isSkippableMessage(text) {
    const lower = text.toLowerCase().trim();
    
    // Skip heartbeat/system messages
    if (text.includes('HEARTBEAT') ||
        text.includes('Read HEARTBEAT.md') ||
        text.includes('A new session was started') ||
        text.includes('session was started via') ||
        text.includes('Respond with just') ||
        text.includes('Quick ping') ||
        text.includes('clawdbot gateway') ||
        text.includes('clawdbot status') ||
        text.includes('clawdbot agents') ||
        text.includes('GatewayRestart') ||
        text.includes('SENTINEL:')) {
        return true;
    }
    
    // Skip short greetings (case insensitive, allow some punctuation)
    const greetings = ['hey', 'hi', 'hello', 'yo', 'sup', 'ping', 'test', 'ok', 'okay', 'thanks', 'thx', 'ty'];
    const cleanLower = lower.replace(/[!?.,]+$/, '');
    if (greetings.includes(cleanLower)) {
        return true;
    }
    
    // Skip very short messages (likely not real tasks)
    if (lower.length < 10) {
        return true;
    }
    
    // Skip messages that are just questions about memory/context
    if (lower.includes('do you remember') || 
        lower.includes('do you have the same memory') ||
        lower.includes('are you there')) {
        return true;
    }
    
    return false;
}

function checkAgentActivity(agentFolder) {
    const agentId = AGENT_NAMES[agentFolder] || agentFolder;
    
    if (!agentState[agentId]) {
        agentState[agentId] = {
            lastFileSize: {},
            lastActivityTime: 0,
            currentStatus: 'offline',
            lastSessionPath: null
        };
    }
    
    const state = agentState[agentId];
    const latestSession = findLatestSession(agentFolder);
    
    if (!latestSession) return;

    try {
        const stat = fs.statSync(latestSession.path);
        const prevSize = state.lastFileSize[latestSession.path] || 0;
        const currentSize = stat.size;
        
        // Check if this is a recent session (within last hour)
        const sessionAge = Date.now() - latestSession.mtime;
        if (sessionAge > 3600000) {
            // Session is old, mark as offline
            if (state.currentStatus !== 'offline') {
                state.currentStatus = 'offline';
                updateFace(agentId, 'offline', null, null);
            }
            return;
        }

        if (currentSize > prevSize) {
            // Activity detected
            state.lastActivityTime = Date.now();
            state.lastFileSize[latestSession.path] = currentSize;

            // Extract task from FIRST user message in session
            const task = extractTaskFromFile(latestSession.path);

            const now = Date.now();
            const statusChanged = state.currentStatus !== 'working';
            const taskChanged = state.lastTask !== task;
            const enoughTimePassed = !state.lastUpdateTime || (now - state.lastUpdateTime) > MIN_UPDATE_INTERVAL;
            
            // Only update if: status changed, OR (task changed AND enough time passed)
            if (statusChanged || (taskChanged && enoughTimePassed)) {
                state.currentStatus = 'working';
                state.lastTask = task;
                state.lastUpdateTime = now;
                if (statusChanged) {
                    console.log(`[${new Date().toLocaleTimeString()}] ${agentId.toUpperCase()}: ${task.substring(0, 50)}`);
                }
                updateFace(agentId, 'working', task, 'Active');
            }
        } else {
            // Check if idle
            const idleTime = Date.now() - state.lastActivityTime;
            if (state.lastActivityTime > 0 && idleTime > IDLE_THRESHOLD && state.currentStatus === 'working') {
                state.currentStatus = 'online';
                state.lastTask = null;
                updateFace(agentId, 'online', null, null);
            }
        }
    } catch (e) {}
}

function checkAllAgents() {
    try {
        const agentFolders = fs.readdirSync(AGENTS_DIR)
            .filter(f => {
                const stat = fs.statSync(path.join(AGENTS_DIR, f));
                return stat.isDirectory();
            });
        
        for (const folder of agentFolders) {
            checkAgentActivity(folder);
        }
    } catch (e) {
        console.error('Error checking agents:', e.message);
    }
}

// Run check loop
console.log('[Face Auto-Sync v2] Starting...');
console.log(`[Face Auto-Sync v2] Monitoring: ${AGENTS_DIR}`);
console.log(`[Face Auto-Sync v2] Agents: ${Object.keys(AGENT_NAMES).join(', ')}`);
setInterval(checkAllAgents, CHECK_INTERVAL);

// Initial check
checkAllAgents();
