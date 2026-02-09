# Deploy FACE (The Batcave) to Render

## Quick Deploy (5 minutes)

### Step 1: Go to Render Dashboard
https://dashboard.render.com/

### Step 2: Create New Web Service
1. Click **"New +"** → **"Web Service"**
2. Choose **"Deploy from GitHub"**
3. Select your repo (or connect GitHub first)

### Step 3: Configure
| Setting | Value |
|---------|-------|
| Name | `the-batcave` |
| Environment | `Node` |
| Region | `Oregon` |
| Branch | `main` |
| Root Directory | `face-package/face-v2` (or wherever the files are) |
| Build Command | `npm install` |
| Start Command | `npm start` |

### Step 4: Add Environment Variables (optional)
```
PORT=10000
NODE_ENV=production
```

### Step 5: Create Web Service
Wait 2-3 minutes for deployment.

---

## Your Permanent URL Will Be:
```
https://the-batcave.onrender.com
```

---

## Option 2: Deploy with Vercel (Even Easier)

Since FACE is mostly frontend, we can convert it to static and deploy to Vercel:

1. I can modify FACE to use client-side polling instead of WebSocket
2. Deploy to Vercel (like Nexvoy)
3. URL: `https://batcave.vercel.app`

---

## Option 3: Keep Using Tunnels (Temporary)

Every time you restart the server, run:
```bash
cd ~/face-package/face-v2
cloudflared tunnel --url http://localhost:3334
```

**Which do you prefer?**
- **Render** = Permanent backend URL, always on
- **Vercel** = Static site, super fast, but no real-time WebSocket
- **Tunnel** = Keep current setup, free but temporary URLs

I recommend **Render** for the full experience with real-time updates! 🦇
