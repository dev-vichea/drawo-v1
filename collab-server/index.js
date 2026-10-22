const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);

const PORT = process.env.PORT || 8080;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN === "*" ? "*" : CORS_ORIGIN.split(",").map(s => s.trim()),
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: 1e7, // 10MB
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Drawo Collaboration Relay",
    activeSockets: io.engine.clientsCount,
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

io.on("connection", (socket) => {
  console.log(`[Collab] Client connected: ${socket.id}`);
  // 1. Send init-room to prompt the client to join a specific roomId
  socket.emit("init-room");

  // 2. Client sends join-room with the roomId from the URL hash
  socket.on("join-room", async (roomId) => {
    if (!roomId) return;
    socket.join(roomId);

    const roomSockets = await io.in(roomId).allSockets();
    const clients = Array.from(roomSockets);
    console.log(`[Collab] Socket ${socket.id} joined room ${roomId} (Total in room: ${clients.length})`);

    if (clients.length === 1) {
      // First client in this room: let them know they are the host/seed
      socket.emit("first-in-room");
    } else {
      // Subsequent clients: inform existing clients so they send their current scene snapshot
      socket.to(roomId).emit("new-user", socket.id);
    }

    // Broadcast updated active client list to everyone in the room
    io.in(roomId).emit("room-user-change", clients);
  });

  // 3. Reliable server broadcast for elements, shapes, and scene updates
  socket.on("server-broadcast", (roomId, encryptedData, iv) => {
    socket.to(roomId).emit("client-broadcast", encryptedData, iv);
  });

  // 4. Volatile broadcast for high-frequency cursor/pointer coordinates and idle statuses
  socket.on("server-volatile-broadcast", (roomId, encryptedData, iv) => {
    socket.volatile.to(roomId).emit("client-broadcast", encryptedData, iv);
  });

  // 5. Follow collaborator feature
  socket.on("user-follow", (payload) => {
    const userToFollow = payload?.userToFollow;
    if (userToFollow) {
      socket.to(userToFollow).emit("user-follow-room-change", [socket.id]);
    }
  });

  // 6. Handle participant leaving/disconnecting
  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        const remainingClients = Array.from(io.sockets.adapter.rooms.get(room) || []).filter(
          (id) => id !== socket.id,
        );
        socket.to(room).emit("room-user-change", remainingClients);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Drawo Relay] WebSocket collaboration server running on port ${PORT}`);
  console.log(`[Drawo Relay] CORS allowed origins: ${CORS_ORIGIN}`);
});
