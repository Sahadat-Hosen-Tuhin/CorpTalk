process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-for-corptalk-chat-tests';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-corptalk-chat-tests';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.BCRYPT_SALT_ROUNDS = '10';
jest.setTimeout(30000);

jest.mock('../src/services/emailService', () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/pushService', () => ({
  sendFriendRequestPush: jest.fn().mockResolvedValue(undefined),
  sendMessagePush: jest.fn().mockResolvedValue(undefined),
}));

const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const { io: createClient } = require('socket.io-client');
const createApp = require('../src/app');
const createSocketServer = require('../src/sockets');
const Block = require('../src/models/block');
const Conversation = require('../src/models/conversation');
const Friendship = require('../src/models/friendship');
const Message = require('../src/models/message');
const Otp = require('../src/models/otp');
const RefreshSession = require('../src/models/refreshSession');
const User = require('../src/models/user');
const { sendOtpEmail } = require('../src/services/emailService');
const { sendFriendRequestPush, sendMessagePush } = require('../src/services/pushService');

const MONGODB_MEMORY_SERVER_VERSION = '7.0.14';
const app = createApp();
app.set('trust proxy', 'loopback');
let mongo;
let httpServer;
let ioServer;
let clients = [];
let signupSequence = 1;

const latestCode = () => sendOtpEmail.mock.calls[sendOtpEmail.mock.calls.length - 1][0].code;

const registerAndLogin = async (email, name) => {
  const testIp = `192.0.2.${signupSequence++}`;
  const signup = await request(app)
    .post('/api/v1/auth/signup')
    .send({
      name,
      email,
      password: 'strong-test-password',
    })
    .set('X-Forwarded-For', testIp);
  expect(signup.status).toBe(201);
  const verification = await request(app)
    .post('/api/v1/auth/verify-otp')
    .set('X-Forwarded-For', testIp)
    .send({ email, code: latestCode() });
  expect(verification.status).toBe(200);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', testIp)
    .send({ email, password: 'strong-test-password' });
  expect(login.status).toBe(200);
  return { token: login.body.data.accessToken, userId: login.body.data.user.id };
};

const makeFriends = async (firstId, secondId) => {
  const [pairLow, pairHigh] = [firstId, secondId].sort();
  await Friendship.create({
    requester: firstId,
    recipient: secondId,
    pairLow,
    pairHigh,
    status: 'accepted',
    respondedAt: new Date(),
  });
};

const connectClient = async (token) => {
  const address = httpServer.address();
  const client = createClient(`http://127.0.0.1:${address.port}`, {
    auth: { token },
    autoConnect: false,
    reconnection: false,
    transports: ['websocket'],
  });
  clients.push(client);
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
    client.connect();
  });
  return client;
};

const waitForEvent = (client, eventName) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(eventName, listener);
      reject(new Error(`${eventName} event timed out`));
    }, 3000);
    const listener = (payload) => {
      clearTimeout(timer);
      client.off(eventName, listener);
      resolve(payload);
    };
    client.on(eventName, listener);
  });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { version: MONGODB_MEMORY_SERVER_VERSION },
  });
  await mongoose.connect(mongo.getUri(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all([
    Block.init(),
    Conversation.init(),
    Friendship.init(),
    Message.init(),
    Otp.init(),
    RefreshSession.init(),
    User.init(),
  ]);
});

beforeEach(async () => {
  sendOtpEmail.mockClear();
  sendFriendRequestPush.mockClear();
  sendMessagePush.mockClear();
  await Promise.all([
    Block.deleteMany({}),
    Conversation.deleteMany({}),
    Friendship.deleteMany({}),
    Message.deleteMany({}),
    Otp.deleteMany({}),
    RefreshSession.deleteMany({}),
    User.deleteMany({}),
  ]);
  httpServer = http.createServer(app);
  ioServer = createSocketServer(httpServer);
  app.set('io', ioServer);
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });
});

afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  clients = [];
  if (ioServer) {
    await new Promise((resolve) => ioServer.close(resolve));
    ioServer = undefined;
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('direct messaging API and sockets', () => {
  test('supports username search, friend requests, acceptance, and unfriend without deleting history', async () => {
    const first = await registerAndLogin('friends.first@example.com', 'First Friend');
    const second = await registerAndLogin('friends.second@example.com', 'Second Friend');
    const setFirstUsername = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ username: 'first_friend' });
    const setSecondUsername = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${second.token}`)
      .send({ username: 'second_friend' });
    expect(setFirstUsername.status).toBe(200);
    expect(setSecondUsername.status).toBe(200);

    const search = await request(app)
      .get('/api/v1/users/search')
      .query({ username: '@second_friend' })
      .set('Authorization', `Bearer ${first.token}`);
    expect(search.status).toBe(200);
    expect(search.body.data.users[0]).toMatchObject({
      id: second.userId,
      username: 'second_friend',
      name: 'Second Friend',
    });
    expect(search.body.data.users[0]).not.toHaveProperty('email');
    expect(search.body.data.users[0]).not.toHaveProperty('phone');

    const secondSocket = await connectClient(second.token);
    const friendRequestEvent = waitForEvent(secondSocket, 'friend:request');
    const sent = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: second.userId });
    expect(sent.status).toBe(201);
    const requestId = sent.body.data.request.id;
    expect(sendFriendRequestPush.mock.calls[0][0].recipientId.toString()).toBe(second.userId);
    await expect(friendRequestEvent).resolves.toMatchObject({
      user: { id: first.userId, username: 'first_friend' },
    });

    const incoming = await request(app)
      .get('/api/v1/friends/requests')
      .set('Authorization', `Bearer ${second.token}`);
    expect(incoming.body.data.incoming[0]).toMatchObject({
      id: requestId,
      user: { id: first.userId, username: 'first_friend' },
    });
    const firstSocket = await connectClient(first.token);
    const acceptedEvent = waitForEvent(firstSocket, 'friend:accepted');
    const duplicate = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: second.userId });
    expect(duplicate.status).toBe(409);

    const accepted = await request(app)
      .post(`/api/v1/friends/requests/${requestId}/accept`)
      .set('Authorization', `Bearer ${second.token}`);
    expect(accepted.status).toBe(200);
    const conversationId = accepted.body.data.conversationId;
    await expect(acceptedEvent).resolves.toMatchObject({
      friendId: second.userId,
      conversationId,
    });
    expect(await Conversation.findById(conversationId)).not.toBeNull();
    const friendList = await request(app)
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${first.token}`);
    expect(friendList.body.data.friends).toHaveLength(1);

    const message = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ conversationId, text: 'History stays after unfriend' });
    expect(message.status).toBe(201);
    const removed = await request(app)
      .delete(`/api/v1/friends/${second.userId}`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(removed.status).toBe(200);

    const history = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(history.body.data.messages).toHaveLength(1);
    const blockedSend = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ conversationId, text: 'Cannot send after unfriend' });
    expect(blockedSend.status).toBe(403);
    const conversations = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${first.token}`);
    expect(conversations.body.data.conversations[0].canSend).toBe(false);
  });

  test('sends live online and offline presence only to accepted friends', async () => {
    const first = await registerAndLogin('presence.first@example.com', 'Presence First');
    const second = await registerAndLogin('presence.second@example.com', 'Presence Second');
    const stranger = await registerAndLogin('presence.stranger@example.com', 'Presence Stranger');
    await makeFriends(first.userId, second.userId);

    const firstSocket = await connectClient(first.token);
    const onlineEvent = waitForEvent(firstSocket, 'presence:update');
    const secondSocket = await connectClient(second.token);
    await expect(onlineEvent).resolves.toMatchObject({
      userId: second.userId,
      online: true,
    });
    const offlineEvent = waitForEvent(firstSocket, 'presence:update');
    secondSocket.disconnect();
    await expect(offlineEvent).resolves.toMatchObject({
      userId: second.userId,
      online: false,
    });

    const strangerSocket = await connectClient(stranger.token);
    const privatePresence = waitForEvent(strangerSocket, 'presence:update');
    const reconnectEvent = waitForEvent(firstSocket, 'presence:update');
    await connectClient(second.token);
    await expect(reconnectEvent).resolves.toMatchObject({
      userId: second.userId,
      online: true,
    });
    await expect(privatePresence).rejects.toThrow('presence:update event timed out');
  });

  test('rejects friend requests and enforces the seven-day cooldown after three rejections', async () => {
    const first = await registerAndLogin('friends.sender@example.com', 'Sender');
    const second = await registerAndLogin('friends.receiver@example.com', 'Receiver');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const sent = await request(app)
        .post('/api/v1/friends/request')
        .set('Authorization', `Bearer ${first.token}`)
        .send({ userId: second.userId });
      expect(sent.status).toBe(201);
      const rejected = await request(app)
        .post(`/api/v1/friends/requests/${sent.body.data.request.id}/reject`)
        .set('Authorization', `Bearer ${second.token}`);
      expect(rejected.status).toBe(200);
    }

    const cooldown = await Friendship.findOne({
      requester: first.userId,
      recipient: second.userId,
    });
    expect(cooldown.rejectionCount).toBe(3);
    expect(cooldown.cooldownUntil.getTime()).toBeGreaterThan(Date.now());
    const denied = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: second.userId });
    expect(denied.status).toBe(429);
    expect(denied.body.error.code).toBe('FRIEND_REQUEST_COOLDOWN');
  });

  test('prevents self requests and lets only the requester cancel a pending request', async () => {
    const first = await registerAndLogin('friends.cancel-first@example.com', 'Cancel First');
    const second = await registerAndLogin('friends.cancel-second@example.com', 'Cancel Second');
    const selfRequest = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: first.userId });
    expect(selfRequest.status).toBe(400);

    const sent = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: second.userId });
    const requestId = sent.body.data.request.id;
    const recipientCancel = await request(app)
      .delete(`/api/v1/friends/requests/${requestId}`)
      .set('Authorization', `Bearer ${second.token}`);
    expect(recipientCancel.status).toBe(404);
    const senderAccept = await request(app)
      .post(`/api/v1/friends/requests/${requestId}/accept`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(senderAccept.status).toBe(404);

    const cancelled = await request(app)
      .delete(`/api/v1/friends/requests/${requestId}`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(cancelled.status).toBe(200);
    const incoming = await request(app)
      .get('/api/v1/friends/requests')
      .set('Authorization', `Bearer ${second.token}`);
    expect(incoming.body.data.incoming).toHaveLength(0);
    const repeatCancel = await request(app)
      .delete(`/api/v1/friends/requests/${requestId}`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(repeatCancel.status).toBe(404);
  });

  test('prevents friend requests when privacy settings disable them and supports block cleanup', async () => {
    const first = await registerAndLogin('friends.blocker@example.com', 'Blocker');
    const second = await registerAndLogin('friends.blocked@example.com', 'Blocked');
    await User.updateOne(
      { _id: second.userId },
      { $set: { 'privacy.allowFriendRequests': false } },
    );
    const denied = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: second.userId });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FRIEND_REQUESTS_DISABLED');

    await User.updateOne({ _id: second.userId }, { $set: { 'privacy.allowFriendRequests': true } });
    await makeFriends(first.userId, second.userId);
    const blocked = await request(app)
      .post(`/api/v1/friends/${second.userId}/block`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(blocked.status).toBe(200);
    expect(await Friendship.countDocuments({ status: 'accepted' })).toBe(0);
    const visibleFriends = await request(app)
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${first.token}`);
    expect(visibleFriends.body.data.friends).toHaveLength(0);
    const blockedUsers = await request(app)
      .get('/api/v1/friends/blocked')
      .set('Authorization', `Bearer ${first.token}`);
    expect(blockedUsers.body.data.blocked).toMatchObject([{ id: second.userId }]);
    const unblocked = await request(app)
      .delete(`/api/v1/friends/${second.userId}/block`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(unblocked.status).toBe(200);
    const blockedAfterRemoval = await request(app)
      .get('/api/v1/friends/blocked')
      .set('Authorization', `Bearer ${first.token}`);
    expect(blockedAfterRemoval.body.data.blocked).toHaveLength(0);
  });

  test('sends idempotent messages, paginates history, and tracks delivered/seen receipts', async () => {
    const first = await registerAndLogin('chat.first@example.com', 'First User');
    const second = await registerAndLogin('chat.second@example.com', 'Second User');
    await makeFriends(first.userId, second.userId);

    const create = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ participantId: second.userId });
    expect(create.status).toBe(200);
    const conversationId = create.body.data.conversation.id;
    const friendList = await request(app)
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${first.token}`);
    expect(friendList.body.data.friends[0]).toMatchObject({
      id: second.userId,
      name: 'Second User',
    });
    expect(friendList.body.data.friends[0]).not.toHaveProperty('email');
    const restMessage = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({
        conversationId,
        text: 'Delivered after reconnect',
        clientMessageId: 'message-rest-1',
      });
    expect(restMessage.status).toBe(201);
    expect(sendMessagePush).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: second.userId, conversationId }),
    );
    const unreadBeforeJoin = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${second.token}`);
    expect(unreadBeforeJoin.body.data.conversations[0].unreadCount).toBe(1);

    const secondSocket = await connectClient(second.token);
    const firstSocket = await connectClient(first.token);
    const deliveryEvent = waitForEvent(firstSocket, 'message:delivered');
    const joined = await new Promise((resolve, reject) => {
      secondSocket
        .timeout(3000)
        .emit('chat:join', { conversationId }, (error, response) =>
          error ? reject(error) : resolve(response),
        );
    });
    expect(joined.data.joined).toBe(true);
    await expect(deliveryEvent).resolves.toMatchObject({ count: 1 });
    const deliveredMessage = await Message.findById(restMessage.body.data.message._id);
    expect(deliveredMessage.status).toBe('delivered');
    const unreadAfterDelivery = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${second.token}`);
    expect(unreadAfterDelivery.body.data.conversations[0].unreadCount).toBe(1);

    const incoming = waitForEvent(secondSocket, 'message:new');
    const messageResponse = await new Promise((resolve, reject) => {
      firstSocket.timeout(3000).emit(
        'message:send',
        {
          conversationId,
          text: 'Hello from CorpTalk',
          replyTo: restMessage.body.data.message._id,
          clientMessageId: 'message-first-1',
        },
        (error, response) => (error ? reject(error) : resolve(response)),
      );
    });
    expect(messageResponse.data.message).toMatchObject({
      text: 'Hello from CorpTalk',
      status: 'sent',
    });
    expect(messageResponse.data.message.replyTo.id).toBe(restMessage.body.data.message._id);
    await expect(incoming).resolves.toMatchObject({
      text: 'Hello from CorpTalk',
      conversationId,
    });

    const duplicate = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({
        conversationId,
        text: 'Hello from CorpTalk',
        clientMessageId: 'message-first-1',
      });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.message._id).toBe(messageResponse.data.message._id);

    const seenEvent = waitForEvent(firstSocket, 'message:seen');
    const seen = await new Promise((resolve, reject) => {
      secondSocket
        .timeout(3000)
        .emit('message:seen', { conversationId }, (error, response) =>
          error ? reject(error) : resolve(response),
        );
    });
    expect(seen.data.count).toBe(2);
    await expect(seenEvent).resolves.toMatchObject({ count: 2 });
    const stored = await Message.findById(messageResponse.data.message._id);
    expect(stored.status).toBe('seen');
    const deliveredThenSeen = await Message.findById(restMessage.body.data.message._id);
    expect(deliveredThenSeen.status).toBe('seen');

    const conversation = await Conversation.findById(conversationId);
    const recipient = conversation.participants.find(
      (participant) => participant.userId.toString() === second.userId,
    );
    expect(recipient.unreadCount).toBe(0);

    const inserted = Array.from({ length: 35 }, (_, index) => ({
      conversationId,
      sender: first.userId,
      type: 'text',
      text: `History ${index}`,
      status: 'sent',
      receipts: [{ userId: second.userId }],
      createdAt: new Date(Date.now() - (35 - index) * 1000),
    }));
    await Message.insertMany(inserted);
    const firstPage = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.messages).toHaveLength(30);
    expect(firstPage.body.data.hasMore).toBe(true);
    const olderPage = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .query({ cursor: firstPage.body.data.nextCursor })
      .set('Authorization', `Bearer ${first.token}`);
    expect(olderPage.status).toBe(200);
    expect(olderPage.body.data.messages).toHaveLength(7);
    expect(olderPage.body.data.hasMore).toBe(false);
    expect(new Date(olderPage.body.data.messages[5].createdAt).getTime()).toBeLessThan(
      new Date(firstPage.body.data.messages[0].createdAt).getTime(),
    );
  });

  test('enforces friendship and block restrictions and supports message delete scopes', async () => {
    const first = await registerAndLogin('chat.owner@example.com', 'Owner');
    const second = await registerAndLogin('chat.friend@example.com', 'Friend');
    const denied = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ participantId: second.userId });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FRIENDSHIP_REQUIRED');

    await makeFriends(first.userId, second.userId);
    const create = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ participantId: second.userId });
    const conversationId = create.body.data.conversation.id;
    const message = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ conversationId, text: 'Delete this message' });
    const messageId = message.body.data.message._id;

    const forbiddenDelete = await request(app)
      .delete(`/api/v1/messages/${messageId}`)
      .query({ for: 'all' })
      .set('Authorization', `Bearer ${second.token}`);
    expect(forbiddenDelete.status).toBe(403);

    const deleteForMe = await request(app)
      .delete(`/api/v1/messages/${messageId}`)
      .query({ for: 'me' })
      .set('Authorization', `Bearer ${second.token}`);
    expect(deleteForMe.status).toBe(200);
    let friendConversations = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${second.token}`);
    expect(friendConversations.body.data.conversations[0].unreadCount).toBe(0);

    const unreadMessage = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ conversationId, text: 'Remove for everyone', clientMessageId: 'delete-everyone-1' });
    const unreadMessageId = unreadMessage.body.data.message._id;
    friendConversations = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${second.token}`);
    expect(friendConversations.body.data.conversations[0].unreadCount).toBe(1);

    const deleteForAll = await request(app)
      .delete(`/api/v1/messages/${unreadMessageId}`)
      .query({ for: 'all' })
      .set('Authorization', `Bearer ${first.token}`);
    expect(deleteForAll.status).toBe(200);
    expect(deleteForAll.body.data.message).toMatchObject({
      deletedForAll: true,
      text: '',
    });
    friendConversations = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${second.token}`);
    expect(friendConversations.body.data.conversations[0].unreadCount).toBe(0);

    await Block.create({ blocker: first.userId, blocked: second.userId });
    const blockedHistory = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${second.token}`);
    expect(blockedHistory.status).toBe(403);
    expect(blockedHistory.body.error.code).toBe('CHAT_BLOCKED');
  });

  test('rejects invalid media signatures before sending files to storage', async () => {
    const first = await registerAndLogin('chat.upload@example.com', 'Uploader');
    const second = await registerAndLogin('chat.receiver@example.com', 'Receiver');
    await makeFriends(first.userId, second.userId);
    const create = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ participantId: second.userId });
    const response = await request(app)
      .post('/api/v1/messages/upload')
      .set('Authorization', `Bearer ${first.token}`)
      .field('conversationId', create.body.data.conversation.id)
      .attach('file', Buffer.from('not an image'), {
        filename: 'invalid.png',
        contentType: 'image/png',
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_MEDIA_FILE');
  });

  test('stores push tokens privately and allows clients to remove them', async () => {
    const user = await registerAndLogin('chat.push@example.com', 'Push User');
    const token = 'firebase-web-registration-token';
    const registered = await request(app)
      .post('/api/v1/users/me/push-token')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ token });
    expect(registered.status).toBe(200);
    const stored = await User.findById(user.userId).select('+pushTokens');
    expect(stored.pushTokens).toContain(token);

    const profile = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${user.token}`);
    expect(profile.body.data.user).not.toHaveProperty('pushTokens');

    const removed = await request(app)
      .delete('/api/v1/users/me/push-token')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ token });
    expect(removed.status).toBe(200);
    const afterRemoval = await User.findById(user.userId).select('+pushTokens');
    expect(afterRemoval.pushTokens).not.toContain(token);
  });
});
