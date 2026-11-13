const express = require('express');
const authenticate = require('../middlewares/authenticate');
const { uploadAvatar, validateAvatarSignature } = require('../middlewares/avatarUpload');
const validate = require('../middlewares/validate');
const authController = require('../controllers/authController');
const { profileSchema } = require('../validators/authSchemas');

const router = express.Router();

router.get('/me', authenticate, authController.getProfile);
router.patch('/me', authenticate, validate(profileSchema), authController.updateProfile);
router.post(
  '/me/avatar',
  authenticate,
  uploadAvatar.single('avatar'),
  validateAvatarSignature,
  authController.uploadAvatar,
);

module.exports = router;
