# Raven Face v2 🪶

Production-ready dashboard for monitoring the AI agent team in real-time.

## Features

- ✅ **Config-driven agents** - All agents loaded from `agents.json`
- ✅ **Real-time updates** - WebSocket pushes status changes instantly
- ✅ **Task board** - Clear view of who's working on what
- ✅ **Activity feed** - Last 20 actions with timestamps
- ✅ **Department grouping** - Tech, Creative, Finance, Ops, Legal, Services
- ✅ **Mobile responsive** - Works great on iPad
- ✅ **Dark mode** - Sleek dark aesthetic
- ✅ **BTC price** - Live ticker from CoinGecko
- ✅ **Savings counter** - Accumulated cost savings display

## Quick Start

```bash
cd ~/clawd/face-v2
npm install
npm start
```

Dashboard: http://localhost:3334

## API Endpoints

### Status

```bash
# Get all agent status
GET /api/status

# Get specific agent
GET /api/status/:agentId

# Update agent status (main endpoint for agents)
POST /api/status/:agentId
{
  "status": "working",     # working | idle | complete | error
  "task": "Building UI",   # Current task description
  "detail": "React components", # Optional detail
  "progress": 75           # Optional progress %
}

# Batch update multiple agents
POST /api/status
{
  "forge": { "status": "working", "task": "API dev" },
  "spark": { "status": "idle" }
}
```

### Activity

```bash
# Get recent activity
GET /api/activity?limit=20

# Log activity
POST /api/activity
{
  "type": "task",      # message | task | commit | cron | alert | system
  "agent": "forge",
  "text": "Started building API",
  "icon": "🔧"         # Optional custom icon
}
```

### Config

```bash
# Get agents config (agents + departments)
GET /api/config
```

## WebSocket

Connect to `ws://localhost:3334` for real-time updates.

**Message types received:**
- `init` - Full state on connect (config, status, activity)
- `status` - Single agent status change
- `status-bulk` - Multiple agents updated
- `activity` - New activity event
- `config` - Config file changed

## Configuration

### agents.json

Edit `agents.json` to add/remove agents. Changes are hot-reloaded.

```json
{
  "departments": {
    "tech": {
      "name": "Technology",
      "color": "#00c8ff",
      "colorBg": "rgba(0,200,255,0.04)",
      "order": 1
    }
  },
  "agents": {
    "spark": {
      "name": "Spark",
      "emoji": "⚡",
      "role": "Frontend",
      "department": "tech",
      "tier": "member",        // leader | chief | head | member
      "reportsTo": "forge"
    }
  },
  "meta": {
    "birthDate": "2026-01-25T23:53:22Z",
    "savingsConfig": {
      "hourlyRate": 100,
      "activeRatio": 0.4
    }
  }
}
```

## Integration with Agents

Agents can update their status via curl:

```bash
# Mark as working
curl -X POST http://localhost:3334/api/status/spark \
  -H "Content-Type: application/json" \
  -d '{"status":"working","task":"Building dashboard"}'

# Mark as idle
curl -X POST http://localhost:3334/api/status/spark \
  -H "Content-Type: application/json" \
  -d '{"status":"idle"}'

# Log activity
curl -X POST http://localhost:3334/api/activity \
  -H "Content-Type: application/json" \
  -d '{"type":"task","agent":"spark","text":"Deployed v2.0"}'
```

## Files

```
face-v2/
├── server.js      # Node.js server with WebSocket
├── index.html     # Dashboard UI
├── agents.json    # Agent configuration (hot-reloaded)
├── status.json    # Current agent status (auto-saved)
├── activity.json  # Activity log (auto-saved)
└── README.md      # This file
```

## Tech Stack

- Node.js + Express
- WebSocket (ws library)
- Tailwind CSS (via CDN)
- Vanilla JavaScript

## Ports

- **3334** - Face v2 (this)
- **3333** - Face v1 (legacy)
