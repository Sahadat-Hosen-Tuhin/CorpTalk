const { Server } = require('socket.io');
const { getAllowedOrigins } = require('../config/cors');

const createSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    socket.on('health:ping', (_payload, acknowledge) => {
      if (typeof acknowledge !== 'function') {
        return;
      }

      acknowledge({
        event: 'health:pong',
        ok: true,
        timestamp: new Date().toISOString(),
      });
    });
  });

  return io;
};

module.exports = createSocketServer;
