const { Readable } = require('node:stream');
const cloudinary = require('cloudinary').v2;
const AppError = require('../utils/AppError');
const { setAvatar } = require('./authService');

const uploadAvatar = async (userId, file) => {
  const {
    CLOUDINARY_CLOUD_NAME: cloudName,
    CLOUDINARY_API_KEY: apiKey,
    CLOUDINARY_API_SECRET: apiSecret,
  } = process.env;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(503, 'AVATAR_STORAGE_NOT_CONFIGURED', 'Avatar storage is not configured');
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  const uploaded = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'corptalk/avatars',
        resource_type: 'image',
        transformation: [{ width: 512, height: 512, crop: 'limit' }],
      },
      (error, result) => {
        if (error) {
          reject(
            new AppError(
              502,
              'AVATAR_UPLOAD_FAILED',
              'Could not upload the image. Please try again',
              {
                cause: error,
              },
            ),
          );
          return;
        }
        resolve(result);
      },
    );
    Readable.from([file.buffer]).pipe(uploadStream);
  });

  const { user, previousPublicId } = await setAvatar(
    userId,
    uploaded.secure_url,
    uploaded.public_id,
  );

  if (previousPublicId) {
    try {
      const cleanup = await cloudinary.uploader.destroy(previousPublicId, {
        resource_type: 'image',
      });
      if (cleanup.result !== 'ok' && cleanup.result !== 'not found') {
        console.warn('Cloudinary returned an unexpected avatar cleanup status', cleanup.result);
      }
    } catch (error) {
      console.warn('Could not remove the previous avatar from Cloudinary', error);
    }
  }

  return user;
};

module.exports = { uploadAvatar };
