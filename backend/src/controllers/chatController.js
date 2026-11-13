const authService = require('../services/authService');
const chatService = require('../services/chatService');
const { deleteMessageMedia, uploadMessageMedia } = require('../services/messageMediaService');
const { sendMessagePush } = require('../services/pushService');
const AppError = require('../utils/AppError');

const emitToConversation = (req, conversationId, userIds, event, payload) => {
  const io = req.app.get('io');
  if (!io) return;
  let target = io.to(`conversation:${conversationId}`);
  for (const userId of userIds) {
    target = target.to(`user:${userId}`);
  }
  target.emit(event, payload);
};

const getConversations = async (req, res) => {
  const conversations = await chatService.getConversationList(req.user._id);
  res.status(200).json({ data: { conversations } });
};

const createConversation = async (req, res) => {
  const conversation = await chatService.createOrGetDirectConversation(
    req.user._id,
    req.validatedBody.participantId,
  );
  res.status(200).json({
    data: {
      conversation: {
        id: conversation._id.toString(),
        type: conversation.type,
      },
    },
  });
};

const getMessages = async (req, res) => {
  const result = await chatService.getMessageHistory(
    req.user._id,
    req.params.conversationId,
    req.query.cursor,
  );
  res.status(200).json({ data: result });
};

const notifyParticipants = async (req, conversationId, message) => {
  const { conversation } = await chatService.getConversationForUser(conversationId, req.user._id);
  const userIds = conversation.participants.map((participant) => participant.userId.toString());
  emitToConversation(req, conversationId, userIds, 'message:new', message);
  const recipientId = userIds.find((userId) => userId !== req.user._id.toString());
  if (recipientId) {
    void sendMessagePush({
      recipientId,
      conversationId,
      message,
    }).catch((error) => console.error('Could not send message push notification', error));
  }
};

const sendTextMessage = async (req, res) => {
  const { conversationId, text, replyTo, clientMessageId } = req.validatedBody;
  const result = await chatService.sendTextMessage({
    userId: req.user._id,
    conversationId,
    text,
    replyTo,
    clientMessageId,
  });
  if (!result.reused) await notifyParticipants(req, conversationId, result.message);
  res.status(result.reused ? 200 : 201).json({ data: { message: result.message } });
};

const uploadMessage = async (req, res) => {
  if (!req.file) {
    throw new AppError(400, 'FILE_REQUIRED', 'Choose a file to send');
  }
  const { conversationId, text, replyTo, clientMessageId } = req.validatedBody;
  await chatService.authorizeDirectMessage(req.user._id, conversationId);
  const media = await uploadMessageMedia(req.file);
  const type = req.file.mimetype.startsWith('image/')
    ? 'image'
    : req.file.mimetype.startsWith('video/')
      ? 'video'
      : req.file.mimetype.startsWith('audio/')
        ? 'voice'
        : 'file';
  let result;
  try {
    result = await chatService.saveMediaMessage({
      userId: req.user._id,
      conversationId,
      text,
      replyTo,
      type,
      media,
      clientMessageId,
    });
  } catch (error) {
    try {
      await deleteMessageMedia(media);
    } catch (cleanupError) {
      console.error('Could not clean up an unreferenced uploaded message file', cleanupError);
    }
    throw error;
  }
  if (result.reused) {
    try {
      await deleteMessageMedia(media);
    } catch (error) {
      console.error('Could not clean up a duplicate message upload', error);
    }
  } else {
    await notifyParticipants(req, conversationId, result.message);
  }
  res.status(result.reused ? 200 : 201).json({ data: { message: result.message } });
};

const deleteMessage = async (req, res) => {
  const result = await chatService.deleteMessage(req.user._id, req.params.messageId, req.query.for);
  if (result.deletedMedia) {
    try {
      await deleteMessageMedia(result.deletedMedia);
    } catch (error) {
      console.error('Could not delete message media from Cloudinary', error);
    }
  }
  const { conversation } = await chatService.getConversationForUser(
    result.conversationId,
    req.user._id,
  );
  const userIds = conversation.participants.map((participant) => participant.userId.toString());
  const payload = {
    ...result.message,
    scope: req.query.for,
    deletedBy: req.user._id.toString(),
  };
  if (req.query.for === 'me') {
    req.app.get('io')?.to(`user:${req.user._id}`).emit('message:deleted', payload);
  } else {
    emitToConversation(req, result.conversationId, userIds, 'message:deleted', payload);
  }
  res.status(200).json({ data: { message: result.message } });
};

const updatePushToken = async (req, res) => {
  const { token } = req.validatedBody;
  await authService.updatePushToken(req.user._id, token);
  res.status(200).json({ data: { registered: true } });
};

const removePushToken = async (req, res) => {
  const { token } = req.validatedBody;
  await authService.removePushToken(req.user._id, token);
  res.status(200).json({ data: { removed: true } });
};

module.exports = {
  createConversation,
  deleteMessage,
  getConversations,
  getMessages,
  removePushToken,
  sendTextMessage,
  updatePushToken,
  uploadMessage,
};
