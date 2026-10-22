# Drawo Collaboration WebSocket Server

A lightweight, stateless real-time relay server powered by Node.js and Socket.io for **Drawo** whiteboard live collaboration.

## Why this server is needed
Drawo whiteboards use **Zero-Knowledge End-to-End Encryption (E2EE)**. All elements, strokes, and cursor coordinates are encrypted directly in the user's browser before leaving the device. 

This relay server:
* **Never decrypts or stores drawings** (it only sees encrypted binary payloads and initialization vectors).
* **Requires zero database** (state is maintained between active peer clients).
* **Routes WebSockets** between participants sharing the same room link (`#room=<id>,<key>`).

---

## 1. Local Testing
```bash
cd collab-server
npm install
npm start
```
The server will start on `http://localhost:8080`.

---

## 2. One-Click Free Deployment Options

### Option A: Render (Free)
1. Go to [render.com](https://render.com) and create a **New Web Service**.
2. Connect your GitHub repository (`drawo-v1`).
3. Set:
   * **Root Directory**: `collab-server`
   * **Build Command**: `npm install`
   * **Start Command**: `node index.js`
   * **Environment Variable**: `CORS_ORIGIN=*` (or `https://drawo.vicheachheng.site`)
4. Click **Deploy**. Render gives you a free HTTPS URL like: `https://drawo-collab.onrender.com`.

### Option B: Railway (Free / Cheap)
1. Go to [railway.app](https://railway.app) $\rightarrow$ **New Project** $\rightarrow$ **Deploy from GitHub repo**.
2. Set Root Directory to `collab-server`.
3. Add Environment Variable:
   * `PORT=8080`
   * `CORS_ORIGIN=*`
4. Generate a public domain (e.g. `https://drawo-collab.up.railway.app`).

---

## 3. Connecting Drawo Frontend to your Server

Once deployed, update your frontend environment variables:
1. In your Vercel Dashboard for `drawo-v1`:
   * Go to **Settings** $\rightarrow$ **Environment Variables**.
   * Add / Update:
     ```
     VITE_APP_WS_SERVER_URL=https://your-deployed-relay-url.onrender.com
     ```
2. Redeploy the frontend.
3. Open `https://drawo.vicheachheng.site/`, click **Start session**, and share the link! Multi-user drawing and cursors will sync instantly.
