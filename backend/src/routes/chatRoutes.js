const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const { uploadMessageFile, validateMessageFile } = require('../middlewares/messageUpload');
const chatController = require('../controllers/chatController');
const {
  createConversationSchema,
  messageSchema,
  uploadMessageSchema,
} = require('../validators/chatSchemas');

const router = express.Router();
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/conversations', authenticate, chatController.getConversations);
router.post(
  '/conversations',
  authenticate,
  messageLimiter,
  validate(createConversationSchema),
  chatController.createConversation,
);
router.get('/conversations/:conversationId/messages', authenticate, chatController.getMessages);
router.post(
  '/messages',
  authenticate,
  messageLimiter,
  validate(messageSchema),
  chatController.sendTextMessage,
);
router.post(
  '/messages/upload',
  authenticate,
  messageLimiter,
  uploadMessageFile,
  validate(uploadMessageSchema),
  validateMessageFile,
  chatController.uploadMessage,
);
router.delete('/messages/:messageId', authenticate, messageLimiter, chatController.deleteMessage);

module.exports = router;
