const mongoose = require('mongoose');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 20,
      match: /^[a-z0-9_]{3,20}$/,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 32,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    avatar: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: null,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['everyone', 'friends'],
        default: 'everyone',
      },
      lastSeenVisibility: {
        type: String,
        enum: ['everyone', 'friends', 'nobody'],
        default: 'everyone',
      },
      readReceipts: {
        type: Boolean,
        default: true,
      },
      showOnlineStatus: {
        type: Boolean,
        default: true,
      },
      allowFriendRequests: {
        type: Boolean,
        default: true,
      },
    },
    settings: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system',
      },
      notificationsEnabled: {
        type: Boolean,
        default: true,
      },
      aiFeaturesEnabled: {
        type: Boolean,
        default: false,
      },
      timezone: {
        type: String,
        trim: true,
        maxlength: 64,
        default: 'UTC',
      },
      language: {
        type: String,
        trim: true,
        maxlength: 16,
        default: 'en',
      },
    },
  },
  {
    timestamps: true,
    strict: 'throw',
    optimisticConcurrency: true,
  },
);

userSchema.index({ email: 1 }, { unique: true, name: 'email_unique' });
userSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $type: 'string' } },
    name: 'phone_unique_when_present',
  },
);
userSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: { username: { $type: 'string' } },
    name: 'username_unique_when_present',
  },
);
userSchema.index({ name: 'text' }, { name: 'name_text_search' });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
