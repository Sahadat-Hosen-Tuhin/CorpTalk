const toPublicUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  phone: user.phone || null,
  avatar: user.avatar,
  bio: user.bio,
  isVerified: user.isVerified,
  isOnline: user.isOnline,
  lastSeen: user.lastSeen,
  privacy: user.privacy,
  settings: user.settings,
  createdAt: user.createdAt,
});

module.exports = toPublicUser;
