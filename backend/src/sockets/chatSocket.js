const { messageSchema, objectId } = require('../validators/chatSchemas');
const chatService = require('../services/chatService');
const { sendMessagePush } = require('../services/pushService');

const emitToParticipants = (io, conversation, event, payload) => {
  let target = io.to(`conversation:${conversation._id}`);
  for (const participant of conversation.participants) {
    target = target.to(`user:${participant.userId}`);
  }
  target.emit(event, payload);
};

const reportSocketError = (socket, acknowledge, error) => {
  if (!(error && error.statusCode)) {
    console.error('Chat socket event failed', error);
  }
  if (typeof acknowledge === 'function') {
    acknowledge({
      error: {
        code: error.code || 'CHAT_EVENT_FAILED',
        message: error.statusCode ? error.message : 'Could not complete the chat action',
      },
    });
  }
};

const checkMessageRate = (socket) => {
  const now = Date.now();
  if (!socket.data.messageWindowStart || now - socket.data.messageWindowStart >= 60_000) {
    socket.data.messageWindowStart = now;
    socket.data.messageCount = 0;
  }
  socket.data.messageCount += 1;
  return socket.data.messageCount <= 60;
};

const attachChatSocket = (io, socket) => {
  const userId = socket.data.user._id;

  socket.on('chat:leave', (payload, acknowledge) => {
    const parsed = objectId.safeParse(payload?.conversationId);
    if (!parsed.success) {
      if (typeof acknowledge === 'function') {
        acknowledge({
          error: {
            code: 'INVALID_CONVERSATION_ID',
            message: 'A valid conversation ID is required',
          },
        });
      }
      return;
    }
    socket.leave(`conversation:${parsed.data}`);
    if (typeof acknowledge === 'function') acknowledge({ data: { left: true } });
  });

  socket.on('chat:join', async (payload, acknowledge) => {
    try {
      const parsed = objectId.safeParse(payload?.conversationId);
      if (!parsed.success) {
        throw Object.assign(new Error('A valid conversation ID is required'), {
          statusCode: 400,
          code: 'INVALID_CONVERSATION_ID',
        });
      }
      const { conversation } = await chatService.getConversationForUser(parsed.data, userId);
      socket.join(`conversation:${conversation._id}`);
      const delivery = await chatService.markDelivered(userId, conversation._id);
      if (delivery.count) {
        emitToParticipants(io, conversation, 'message:delivered', {
          conversationId: conversation._id.toString(),
          userId: userId.toString(),
          count: delivery.count,
          at: delivery.at,
        });
      }
      if (typeof acknowledge === 'function') acknowledge({ data: { joined: true } });
    } catch (error) {
      reportSocketError(socket, acknowledge, error);
    }
  });

  socket.on('message:send', async (payload, acknowledge) => {
    try {
      if (!checkMessageRate(socket)) {
        throw Object.assign(new Error('Too many messages. Try again shortly'), {
          statusCode: 429,
          code: 'MESSAGE_RATE_LIMITED',
        });
      }
      const parsed = messageSchema.safeParse(payload);
      if (!parsed.success) {
        throw Object.assign(
          new Error(parsed.error.issues.map((issue) => issue.message).join('; ')),
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
          },
        );
      }
      const result = await chatService.sendTextMessage({
        userId,
        ...parsed.data,
      });
      const { conversation } = await chatService.getConversationForUser(
        parsed.data.conversationId,
        userId,
      );
      if (!result.reused) {
        emitToParticipants(io, conversation, 'message:new', result.message);
        emitToParticipants(io, conversation, 'conversation:updated', {
          id: conversation._id.toString(),
          lastMessage: result.message,
        });
        const recipientId = conversation.participants
          .map((participant) => participant.userId.toString())
          .find((participantId) => participantId !== userId.toString());
        if (recipientId) {
          void sendMessagePush({
            recipientId,
            conversationId: conversation._id,
            message: result.message,
          }).catch((error) => console.error('Could not send message push notification', error));
        }
      }
      if (typeof acknowledge === 'function') {
        acknowledge({ data: { message: result.message, reused: result.reused } });
      }
    } catch (error) {
      reportSocketError(socket, acknowledge, error);
    }
  });

  socket.on('message:seen', async (payload, acknowledge) => {
    try {
      const parsed = objectId.safeParse(payload?.conversationId);
      if (!parsed.success) {
        throw Object.assign(new Error('A valid conversation ID is required'), {
          statusCode: 400,
          code: 'INVALID_CONVERSATION_ID',
        });
      }
      const { conversation } = await chatService.getConversationForUser(parsed.data, userId);
      const result = await chatService.markSeen(userId, conversation._id);
      if (result.count) {
        emitToParticipants(io, conversation, 'message:seen', {
          conversationId: conversation._id.toString(),
          userId: userId.toString(),
          count: result.count,
          at: result.at,
        });
      }
      if (typeof acknowledge === 'function') acknowledge({ data: result });
    } catch (error) {
      reportSocketError(socket, acknowledge, error);
    }
  });
};

module.exports = attachChatSocket;
