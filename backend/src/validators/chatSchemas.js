const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'A valid ID is required');
const clientMessageId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, 'A valid message ID is required');

const createConversationSchema = z.object({ participantId: objectId }).strict();
const messageSchema = z
  .object({
    conversationId: objectId,
    text: z.string().trim().min(1).max(10000),
    replyTo: objectId.optional(),
    clientMessageId: clientMessageId.optional(),
  })
  .strict();
const uploadMessageSchema = z
  .object({
    conversationId: objectId,
    text: z.string().trim().max(10000).optional(),
    replyTo: objectId.optional(),
    clientMessageId: clientMessageId.optional(),
  })
  .strict();
const pushTokenSchema = z.object({ token: z.string().trim().min(1).max(4096) }).strict();

module.exports = {
  createConversationSchema,
  messageSchema,
  objectId,
  pushTokenSchema,
  uploadMessageSchema,
};
