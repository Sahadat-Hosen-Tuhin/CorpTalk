const http = require('node:http');
const { io: createClient } = require('socket.io-client');
const createSocketServer = require('../src/sockets');

describe('Socket.IO foundation', () => {
  let httpServer;
  let ioServer;
  let client;

  beforeEach(async () => {
    httpServer = http.createServer();
    ioServer = createSocketServer(httpServer);

    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', resolve);
    });
  });

  afterEach(async () => {
    if (client) {
      client.disconnect();
      client = undefined;
    }

    if (ioServer) {
      await new Promise((resolve) => ioServer.close(resolve));
      ioServer = undefined;
    }
  });

  test('connects a client and responds to a health ping', async () => {
    const address = httpServer.address();
    client = createClient(`http://127.0.0.1:${address.port}`, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
    });

    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
      client.connect();
    });

    const response = await new Promise((resolve, reject) => {
      client.timeout(2000).emit('health:ping', { source: 'test' }, (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      });
    });

    expect(response).toMatchObject({
      event: 'health:pong',
      ok: true,
    });
    expect(Number.isNaN(Date.parse(response.timestamp))).toBe(false);
  });
});
