// server.js
// VozChat - servidor WebSocket de sinalização
//
// Instalação:
//   npm install
//
// Execução:
//   npm start
//
// O servidor:
// - cria/gerencia salas em memória;
// - mantém os participantes de cada sala;
// - encaminha offer/answer/ICE entre os navegadores;
// - avisa quando alguém entra/sai.
//
// IMPORTANTE:
// Este servidor NÃO transporta áudio/vídeo.
// O áudio/vídeo usa WebRTC diretamente entre os navegadores.

const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const server = http.createServer((req, res) => {
  let file = req.url === "/" ? "/chamada-7.html" : req.url;

  // Evita path traversal.
  file = path.normalize(file).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(__dirname, file);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      return res.end(err.code === "ENOENT" ? "Not found" : "Server error");
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    };

    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

// roomCode -> Map(clientId, clientInfo)
const rooms = new Map();

// ws -> clientInfo
const clients = new Map();

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcast(room, message, exceptId = null) {
  for (const [id, client] of room.entries()) {
    if (id === exceptId) continue;
    send(client.ws, message);
  }
}

function leaveRoom(ws) {
  const info = clients.get(ws);
  if (!info) return;

  const room = rooms.get(info.room);

  if (room) {
    room.delete(info.id);

    broadcast(room, {
      type: "user-left",
      from: info.id
    }, info.id);

    if (room.size === 0) {
      rooms.delete(info.room);
    }
  }

  clients.delete(ws);
}

wss.on("connection", ws => {
  console.log("[WS] cliente conectado");

  ws.on("message", raw => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, {
        type: "error",
        message: "Mensagem inválida."
      });
      return;
    }

    if (!msg || typeof msg.type !== "string") return;

    // ============================
    // ENTRAR EM UMA SALA
    // ============================

    if (msg.type === "join-room") {
      const id = String(msg.from || "").trim();
      const roomCode = String(msg.room || "").trim().toUpperCase();
      const user = msg.user || {};

      if (!id || !roomCode) {
        send(ws, {
          type: "error",
          message: "ID ou código da sala inválido."
        });
        return;
      }

      if (clients.has(ws)) {
        leaveRoom(ws);
      }

      let room = rooms.get(roomCode);

      if (!room) {
        room = new Map();
        rooms.set(roomCode, room);
      }

      // Impede ID duplicado.
      if (room.has(id)) {
        send(ws, {
          type: "error",
          message: "ID de participante duplicado."
        });
        return;
      }

      // Limite simples para a demo.
      if (room.size >= 8) {
        send(ws, {
          type: "room-full",
          message: "A sala está cheia."
        });
        return;
      }

      const participant = {
        id,
        room: roomCode,
        name: String(user.name || "Participante").slice(0, 20),
        color: String(user.color || "#5865f2"),
        ws
      };

      // Envia a lista dos usuários que já estavam na sala
      // para o novo participante.
      const existingUsers = [...room.values()].map(p => ({
        id: p.id,
        name: p.name,
        color: p.color
      }));

      clients.set(ws, participant);
      room.set(id, participant);

      send(ws, {
        type: "room-users",
        users: existingUsers
      });

      // Avisa os antigos participantes que entrou alguém novo.
      broadcast(room, {
        type: "user-joined",
        user: {
          id: participant.id,
          name: participant.name,
          color: participant.color
        }
      }, id);

      console.log(
        `[ROOM] ${participant.name} entrou em ${roomCode} (${room.size})`
      );

      return;
    }

    const info = clients.get(ws);

    if (!info) {
      send(ws, {
        type: "error",
        message: "Entre em uma sala primeiro."
      });
      return;
    }

    const room = rooms.get(info.room);
    if (!room) return;

    // ============================
    // SINALIZAÇÃO WEBRTC
    // ============================

    if (
      msg.type === "offer" ||
      msg.type === "answer" ||
      msg.type === "ice"
    ) {
      const target = String(msg.to || "").trim();
      const targetClient = room.get(target);

      if (!targetClient) {
        send(ws, {
          type: "peer-unavailable",
          peer: target
        });
        return;
      }

      send(targetClient.ws, {
        ...msg,
        from: info.id
      });

      return;
    }

    // ============================
    // ESTADO DO MICROFONE
    // ============================

    if (msg.type === "mic") {
      broadcast(room, {
        type: "mic",
        from: info.id,
        on: !!msg.on
      }, info.id);

      return;
    }

    // ============================
    // COMPARTILHAMENTO DE TELA
    // ============================

    if (msg.type === "screen") {
      broadcast(room, {
        type: "screen",
        from: info.id,
        on: !!msg.on
      }, info.id);

      return;
    }

    // ============================
    // SAÍDA MANUAL
    // ============================

    if (msg.type === "user-left") {
      leaveRoom(ws);
      return;
    }
  });

  ws.on("close", () => {
    const info = clients.get(ws);

    if (info) {
      console.log(`[WS] ${info.name} desconectou`);
    }

    leaveRoom(ws);
  });

  ws.on("error", err => {
    console.error("[WS] erro:", err.message);
    leaveRoom(ws);
  });
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("=================================");
  console.log(" VozChat Server");
  console.log("=================================");
  console.log(` Local: http://localhost:${PORT}`);
  console.log(` Porta: ${PORT}`);
  console.log("=================================");
  console.log("");
});
