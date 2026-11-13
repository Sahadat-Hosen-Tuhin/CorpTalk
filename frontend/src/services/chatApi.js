import { apiClient } from './apiClient.js';

export const getConversations = async () => {
  const response = await apiClient.get('/conversations');
  return response.data.data.conversations;
};

export const getFriends = async (search = '') => {
  const response = await apiClient.get('/friends', { params: search ? { q: search } : {} });
  return response.data.data.friends;
};

export const searchUsers = async (username) => {
  const response = await apiClient.get('/users/search', { params: { username } });
  return response.data.data.users;
};

export const getFriendRequests = async () => {
  const response = await apiClient.get('/friends/requests');
  return response.data.data;
};

export const getBlockedUsers = async () => {
  const response = await apiClient.get('/friends/blocked');
  return response.data.data.blocked;
};

export const sendFriendRequest = async (userId) => {
  const response = await apiClient.post('/friends/request', { userId });
  return response.data.data.request;
};

export const acceptFriendRequest = async (requestId) => {
  const response = await apiClient.post(`/friends/requests/${requestId}/accept`);
  return response.data.data;
};

export const rejectFriendRequest = async (requestId) => {
  const response = await apiClient.post(`/friends/requests/${requestId}/reject`);
  return response.data.data;
};

export const cancelFriendRequest = async (requestId) => {
  await apiClient.delete(`/friends/requests/${requestId}`);
};

export const removeFriend = async (friendId) => {
  await apiClient.delete(`/friends/${friendId}`);
};

export const blockFriend = async (friendId) => {
  await apiClient.post(`/friends/${friendId}/block`);
};

export const unblockFriend = async (friendId) => {
  await apiClient.delete(`/friends/${friendId}/block`);
};

export const createDirectConversation = async (participantId) => {
  const response = await apiClient.post('/conversations', { participantId });
  return response.data.data.conversation;
};

export const getMessages = async (conversationId, cursor) => {
  const response = await apiClient.get(`/conversations/${conversationId}/messages`, {
    params: cursor ? { cursor } : {},
  });
  return response.data.data;
};

export const sendMessageFile = async (conversationId, file, options = {}) => {
  const formData = new FormData();
  formData.append('conversationId', conversationId);
  if (options.text) formData.append('text', options.text);
  if (options.replyTo) formData.append('replyTo', options.replyTo);
  if (options.clientMessageId) formData.append('clientMessageId', options.clientMessageId);
  formData.append('file', file);
  const response = await apiClient.post('/messages/upload', formData);
  return response.data.data.message;
};

export const deleteMessage = async (messageId, scope) => {
  const response = await apiClient.delete(`/messages/${messageId}`, {
    params: { for: scope },
  });
  return response.data.data.message;
};

export const registerPushToken = async (token) => {
  await apiClient.post('/users/me/push-token', { token });
};
