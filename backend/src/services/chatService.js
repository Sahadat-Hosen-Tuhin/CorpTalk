const mongoose = require('mongoose');
const Block = require('../models/block');
const Conversation = require('../models/conversation');
const Friendship = require('../models/friendship');
const Message = require('../models/message');
const User = require('../models/user');
const AppError = require('../utils/AppError');

const PAGE_SIZE = 30;

const messageError = () =>
  new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found in this conversation');
const conversationError = () =>
  new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');

const getDirectKey = (firstId, secondId) => {
  const ids = [firstId.toString().toLowerCase(), secondId.toString().toLowerCase()].sort();
  return ids.join(':');
};

const ensureNotBlocked = async (firstId, secondId) => {
  const blocked = await Block.exists({
    $or: [
      { blocker: firstId, blocked: secondId },
      { blocker: secondId, blocked: firstId },
    ],
  });
  if (blocked) {
    throw new AppError(403, 'CHAT_BLOCKED', 'This conversation is not available');
  }
};

const ensureFriendship = async (firstId, secondId) => {
  const [pairLow, pairHigh] = [
    firstId.toString().toLowerCase(),
    secondId.toString().toLowerCase(),
  ].sort();
  const friendship = await Friendship.findOne({
    pairLow,
    pairHigh,
    status: 'accepted',
  }).select('_id');
  if (!friendship) {
    throw new AppError(403, 'FRIENDSHIP_REQUIRED', 'You can only chat with an accepted friend');
  }
};

const getConversationForUser = async (conversationId, userId) => {
  if (!mongoose.isValidObjectId(conversationId)) {
    throw conversationError();
  }
  const conversation = await Conversation.findOne({
    _id: conversationId,
    type: 'direct',
    'participants.userId': userId,
  });
  if (!conversation) {
    throw conversationError();
  }
  const otherParticipant = conversation.participants.find(
    (participant) => participant.userId.toString() !== userId.toString(),
  );
  if (!otherParticipant) {
    throw conversationError();
  }
  await ensureNotBlocked(userId, otherParticipant.userId);
  return { conversation, otherUserId: otherParticipant.userId };
};

const ensureCanSend = async (conversation, senderId) => {
  const recipient = conversation.participants.find(
    (participant) => participant.userId.toString() !== senderId.toString(),
  );
  if (!recipient) {
    throw conversationError();
  }
  await ensureNotBlocked(senderId, recipient.userId);
  await ensureFriendship(senderId, recipient.userId);
  return recipient.userId;
};

const authorizeDirectMessage = async (userId, conversationId) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  await ensureCanSend(conversation, userId);
};

const serializeMessage = (message) => {
  const value = typeof message.toObject === 'function' ? message.toObject() : message;
  return {
    ...value,
    _id: value._id.toString(),
    conversationId: value.conversationId.toString(),
    sender:
      value.sender && typeof value.sender === 'object'
        ? {
            id: value.sender._id.toString(),
            name: value.sender.name,
            avatar: value.sender.avatar,
          }
        : value.sender?.toString() || null,
    replyTo:
      value.replyTo && typeof value.replyTo === 'object'
        ? {
            id: value.replyTo._id.toString(),
            text: value.replyTo.deletedForAll ? 'Message deleted' : value.replyTo.text,
            type: value.replyTo.type,
            senderName: value.replyTo.sender?.name || '',
          }
        : value.replyTo?.toString() || null,
  };
};

const getConversationList = async (userId) => {
  const blocks = await Block.find({
    $or: [{ blocker: userId }, { blocked: userId }],
  }).select('blocker blocked');
  const blockedUserIds = new Set(
    blocks.map((block) =>
      block.blocker.toString() === userId.toString()
        ? block.blocked.toString()
        : block.blocker.toString(),
    ),
  );
  const conversations = await Conversation.find({
    type: 'direct',
    'participants.userId': userId,
  })
    .sort({ updatedAt: -1 })
    .populate('participants.userId', 'name username avatar isOnline lastSeen privacy')
    .lean();
  const acceptedFriendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  }).select('requester recipient');
  const acceptedFriendIds = new Set(
    acceptedFriendships.map((friendship) =>
      friendship.requester.toString() === userId.toString()
        ? friendship.recipient.toString()
        : friendship.requester.toString(),
    ),
  );

  return conversations
    .filter(
      (conversation) =>
        conversation.participants.length === 2 &&
        conversation.participants.every((participant) => participant.userId),
    )
    .map((conversation) => {
      const current = conversation.participants.find(
        (participant) => participant.userId._id.toString() === userId.toString(),
      );
      const other = conversation.participants.find(
        (participant) => participant.userId._id.toString() !== userId.toString(),
      );
      if (!current || !other) return null;
      const user = other.userId;
      if (blockedUserIds.has(user._id.toString())) return null;
      const blocked =
        user.privacy?.showOnlineStatus === false
          ? { isOnline: false, lastSeen: null }
          : {
              isOnline: Boolean(user.isOnline),
              lastSeen:
                user.privacy?.lastSeenVisibility === 'nobody' ||
                (user.privacy?.lastSeenVisibility === 'friends' &&
                  !acceptedFriendIds.has(user._id.toString()))
                  ? null
                  : user.lastSeen,
            };
      return {
        id: conversation._id.toString(),
        type: conversation.type,
        participant: {
          id: user._id.toString(),
          name: user.name,
          username: user.username || null,
          avatar: user.avatar,
          ...blocked,
        },
        lastMessage: conversation.lastMessage,
        unreadCount: current.unreadCount,
        canSend:
          acceptedFriendIds.has(user._id.toString()) && !blockedUserIds.has(user._id.toString()),
        updatedAt: conversation.updatedAt,
      };
    })
    .filter(Boolean);
};

const createOrGetDirectConversation = async (userId, participantId) => {
  if (!mongoose.isValidObjectId(participantId) || userId.toString() === participantId.toString()) {
    throw new AppError(400, 'INVALID_PARTICIPANT', 'Choose another valid user');
  }
  const otherUser = await User.findById(participantId).select('_id');
  if (!otherUser) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  await ensureNotBlocked(userId, participantId);
  await ensureFriendship(userId, participantId);

  const directKey = getDirectKey(userId, participantId);
  try {
    return await Conversation.findOneAndUpdate(
      { directKey },
      {
        $setOnInsert: {
          type: 'direct',
          directKey,
          participants: [{ userId }, { userId: participantId }],
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const conversation = await Conversation.findOne({ directKey });
    if (!conversation) throw error;
    return conversation;
  }
};

const getMessageHistory = async (userId, conversationId, cursor) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const query = { conversationId: conversation._id, deletedFor: { $ne: userId } };
  if (cursor) {
    if (!mongoose.isValidObjectId(cursor)) {
      throw new AppError(400, 'INVALID_CURSOR', 'The message cursor is invalid');
    }
    const cursorMessage = await Message.findOne({
      _id: cursor,
      conversationId: conversation._id,
    }).select('createdAt');
    if (!cursorMessage) {
      throw new AppError(400, 'INVALID_CURSOR', 'The message cursor is invalid');
    }
    query.$or = [
      { createdAt: { $lt: cursorMessage.createdAt } },
      { createdAt: cursorMessage.createdAt, _id: { $lt: cursorMessage._id } },
    ];
  }
  const documents = await Message.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(PAGE_SIZE + 1)
    .populate('sender', 'name avatar')
    .populate({
      path: 'replyTo',
      select: 'text type deletedForAll sender',
      populate: { path: 'sender', select: 'name' },
    });
  const hasMore = documents.length > PAGE_SIZE;
  const page = documents.slice(0, PAGE_SIZE);
  const nextCursor = hasMore ? page[page.length - 1]._id.toString() : null;
  return { messages: page.reverse().map(serializeMessage), nextCursor, hasMore };
};

const saveMessage = async ({
  userId,
  conversation,
  recipientId,
  text,
  replyTo,
  media,
  type,
  clientMessageId,
}) => {
  if (clientMessageId) {
    const existing = await Message.findOne({
      conversationId: conversation._id,
      sender: userId,
      clientMessageId,
    })
      .populate('sender', 'name avatar')
      .populate({
        path: 'replyTo',
        select: 'text type deletedForAll sender',
        populate: { path: 'sender', select: 'name' },
      });
    if (existing) return { message: serializeMessage(existing), reused: true };
  }

  let repliedMessage = null;
  if (replyTo) {
    repliedMessage = await Message.findOne({
      _id: replyTo,
      conversationId: conversation._id,
      deletedForAll: false,
    });
    if (!repliedMessage) {
      throw new AppError(400, 'INVALID_REPLY_TARGET', 'The replied-to message is unavailable');
    }
  }
  let message;
  try {
    message = await Message.create({
      conversationId: conversation._id,
      sender: userId,
      type,
      text: text || '',
      media: media || null,
      replyTo: repliedMessage?._id || null,
      clientMessageId: clientMessageId || null,
      receipts: [{ userId: recipientId }],
    });
  } catch (error) {
    if (error.code !== 11000 || !clientMessageId) throw error;
    const existing = await Message.findOne({
      conversationId: conversation._id,
      sender: userId,
      clientMessageId,
    })
      .populate('sender', 'name avatar')
      .populate({
        path: 'replyTo',
        select: 'text type deletedForAll sender',
        populate: { path: 'sender', select: 'name' },
      });
    if (!existing) throw error;
    return { message: serializeMessage(existing), reused: true };
  }
  const preview = text?.trim()
    ? text.trim().slice(0, 200)
    : {
        image: 'Photo',
        video: 'Video',
        voice: 'Voice message',
        file: media?.originalName || 'File',
      }[type];
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessage: {
          messageId: message._id,
          senderId: userId,
          preview,
          type,
          sentAt: message.createdAt,
        },
      },
      $inc: { 'participants.$[recipient].unreadCount': 1 },
    },
    { arrayFilters: [{ 'recipient.userId': recipientId }] },
  );
  await message.populate([
    { path: 'sender', select: 'name avatar' },
    {
      path: 'replyTo',
      select: 'text type deletedForAll sender',
      populate: { path: 'sender', select: 'name' },
    },
  ]);
  return { message: serializeMessage(message), reused: false };
};

const sendTextMessage = async ({ userId, conversationId, text, replyTo, clientMessageId }) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const recipientId = await ensureCanSend(conversation, userId);
  return saveMessage({
    userId,
    conversation,
    recipientId,
    text,
    replyTo,
    type: 'text',
    clientMessageId,
  });
};

const saveMediaMessage = async ({
  userId,
  conversationId,
  text,
  replyTo,
  type,
  media,
  clientMessageId,
}) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const recipientId = await ensureCanSend(conversation, userId);
  return saveMessage({
    userId,
    conversation,
    recipientId,
    text,
    replyTo,
    type,
    media,
    clientMessageId,
  });
};

const markDelivered = async (userId, conversationId) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const now = new Date();
  const result = await Message.updateMany(
    {
      conversationId: conversation._id,
      sender: { $ne: userId },
      'receipts.userId': userId,
      'receipts.deliveredAt': null,
    },
    {
      $set: {
        'receipts.$[receipt].deliveredAt': now,
        status: 'delivered',
      },
    },
    { arrayFilters: [{ 'receipt.userId': userId, 'receipt.deliveredAt': null }] },
  );
  return { count: result.modifiedCount, at: now };
};

const markSeen = async (userId, conversationId) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const now = new Date();
  const result = await Message.updateMany(
    {
      conversationId: conversation._id,
      sender: { $ne: userId },
      'receipts.userId': userId,
      'receipts.readAt': null,
    },
    {
      $set: {
        'receipts.$[receipt].deliveredAt': now,
        'receipts.$[receipt].readAt': now,
        status: 'seen',
      },
    },
    { arrayFilters: [{ 'receipt.userId': userId, 'receipt.readAt': null }] },
  );
  await Conversation.updateOne(
    { _id: conversation._id, 'participants.userId': userId },
    {
      $set: {
        'participants.$.unreadCount': 0,
        'participants.$.lastReadAt': now,
      },
    },
  );
  return { count: result.modifiedCount, at: now };
};

const deleteMessage = async (userId, messageId, scope) => {
  if (!mongoose.isValidObjectId(messageId) || !['me', 'all'].includes(scope)) {
    throw new AppError(400, 'INVALID_DELETE_REQUEST', 'Choose a valid message and delete scope');
  }
  const message = await Message.findById(messageId);
  if (!message) throw messageError();
  const { conversation, otherUserId } = await getConversationForUser(
    message.conversationId,
    userId,
  );
  const deletedMedia = scope === 'all' ? message.media?.toObject?.() || message.media : null;
  if (scope === 'all') {
    if (message.sender?.toString() !== userId.toString()) {
      throw new AppError(
        403,
        'MESSAGE_DELETE_FORBIDDEN',
        'Only the sender can delete this for all',
      );
    }
    message.deletedForAll = true;
    message.text = '';
    message.media = null;
  } else if (!message.deletedFor.some((id) => id.toString() === userId.toString())) {
    message.deletedFor.push(userId);
  }
  await message.save();
  if (scope === 'all') {
    const recipientReceipt = message.receipts.find(
      (receipt) => receipt.userId.toString() === otherUserId.toString(),
    );
    if (recipientReceipt && !recipientReceipt.readAt) {
      const unreadCount = await Message.countDocuments({
        conversationId: conversation._id,
        sender: { $ne: otherUserId },
        'receipts.userId': otherUserId,
        'receipts.readAt': null,
        deletedFor: { $ne: otherUserId },
        deletedForAll: false,
      });
      await Conversation.updateOne(
        { _id: conversation._id, 'participants.userId': otherUserId },
        { $set: { 'participants.$.unreadCount': unreadCount } },
      );
    }
    await Conversation.updateOne(
      { _id: conversation._id, 'lastMessage.messageId': message._id },
      { $set: { 'lastMessage.preview': 'Message deleted', 'lastMessage.type': 'system' } },
    );
  } else if (
    message.sender?.toString() !== userId.toString() &&
    message.receipts.some(
      (receipt) => receipt.userId.toString() === userId.toString() && !receipt.readAt,
    )
  ) {
    const unreadCount = await Message.countDocuments({
      conversationId: conversation._id,
      sender: { $ne: userId },
      'receipts.userId': userId,
      'receipts.readAt': null,
      deletedFor: { $ne: userId },
      deletedForAll: false,
    });
    await Conversation.updateOne(
      { _id: conversation._id, 'participants.userId': userId },
      { $set: { 'participants.$.unreadCount': unreadCount } },
    );
  }
  await message.populate('sender', 'name avatar');
  return {
    message: serializeMessage(message),
    conversationId: conversation._id.toString(),
    deletedMedia,
  };
};

module.exports = {
  createOrGetDirectConversation,
  authorizeDirectMessage,
  deleteMessage,
  getConversationForUser,
  getConversationList,
  getMessageHistory,
  markDelivered,
  markSeen,
  saveMediaMessage,
  sendTextMessage,
};
