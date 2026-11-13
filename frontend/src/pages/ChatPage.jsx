import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Bell,
  Check,
  MessageCircle,
  MoreHorizontal,
  Search,
  Send,
  UserRound,
  UserRoundMinus,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ChatComposer from '../features/chat/ChatComposer.jsx';
import MessageBubble from '../features/chat/MessageBubble.jsx';
import {
  createDirectConversation,
  acceptFriendRequest,
  blockFriend,
  cancelFriendRequest,
  deleteMessage,
  getConversations,
  getBlockedUsers,
  getFriendRequests,
  getFriends,
  getMessages,
  rejectFriendRequest,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  sendMessageFile,
  unblockFriend,
} from '../services/chatApi.js';
import { emitChatEvent, createChatSocket } from '../services/chatSocket.js';
import { apiClient, getAccessToken } from '../services/apiClient.js';
import { useAuthStore } from '../stores/authStore.js';

const makeClientMessageId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `message_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const sortMessages = (messages) =>
  [...messages].sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt));

function ChatPage() {
  const { conversationId: routeConversationId } = useParams();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const [conversations, setConversations] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [friendsTab, setFriendsTab] = useState(
    searchParams.get('tab') === 'requests' ? 'requests' : 'friends',
  );
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(routeConversationId || '');
  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(Boolean(routeConversationId));
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [error, setError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const scrollRef = useRef(null);
  const socketRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  const searchRef = useRef(search);
  const retryActionsRef = useRef(new Map());
  const previewUrlsRef = useRef(new Map());
  const loadingOlderRef = useRef(false);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId),
    [conversations, selectedId],
  );
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter(
      (conversation) =>
        conversation.participant.name.toLowerCase().includes(query) ||
        conversation.participant.username?.toLowerCase().includes(query) ||
        conversation.lastMessage?.preview?.toLowerCase().includes(query),
    );
  }, [conversations, search]);
  const filteredFriends = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return friends;
    return friends.filter(
      (friend) =>
        friend.name.toLowerCase().includes(query) || friend.username?.toLowerCase().includes(query),
    );
  }, [friends, search]);

  const refreshLists = useCallback(async () => {
    const [conversationList, friendList, requests, blocked] = await Promise.all([
      getConversations(),
      getFriends(),
      getFriendRequests(),
      getBlockedUsers(),
    ]);
    setConversations(conversationList);
    setFriends(friendList);
    setFriendRequests(requests);
    setBlockedUsers(blocked);
  }, []);

  const refreshSearchResults = useCallback(async () => {
    const query = searchRef.current.trim().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/i.test(query)) {
      setSearchResults([]);
      return;
    }
    setSearchResults(await searchUsers(query));
  }, []);

  const handlePresence = ({ userId, online, lastSeen }) => {
    const updatePresence = (person) =>
      person.id === userId ? { ...person, isOnline: online, lastSeen } : person;
    setFriends((current) => current.map(updatePresence));
    setConversations((current) =>
      current.map((conversation) => ({
        ...conversation,
        participant: updatePresence(conversation.participant),
      })),
    );
  };

  const performFriendAction = async (action, refreshSearch = false) => {
    setError('');
    try {
      await action();
      await refreshLists();
      if (refreshSearch) await refreshSearchResults();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  useEffect(() => {
    const query = search.trim().replace(/^@/, '');
    if (friendsTab !== 'friends' || !/^[a-z0-9_]{3,20}$/i.test(query)) {
      setSearchResults([]);
      return undefined;
    }
    let active = true;
    const timeout = setTimeout(() => {
      searchUsers(query)
        .then((users) => {
          if (active) setSearchResults(users);
        })
        .catch((requestError) => {
          if (active) setError(requestError.response?.data?.error?.message || requestError.message);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [friendsTab, search]);

  useEffect(() => {
    let active = true;
    Promise.all([getConversations(), getFriends(), getFriendRequests(), getBlockedUsers()])
      .then(([conversationList, friendList, requests, blocked]) => {
        if (!active) return;
        setConversations(conversationList);
        setFriends(friendList);
        setFriendRequests(requests);
        setBlockedUsers(blocked);
        if (routeConversationId) {
          setMessages([]);
          setLoadingMessages(true);
          stickToBottomRef.current = true;
          setSelectedId(routeConversationId);
        } else if (conversationList[0]) {
          setMessages([]);
          setLoadingMessages(true);
          stickToBottomRef.current = true;
          setSelectedId(conversationList[0].id);
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error?.message || requestError.message);
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => {
      active = false;
    };
  }, [refreshLists, routeConversationId]);

  useEffect(() => {
    let socket;
    try {
      socket = createChatSocket();
      socketRef.current = socket;
    } catch (socketError) {
      setTimeout(() => setError(socketError.message), 0);
      return undefined;
    }

    const refresh = () => {
      void refreshLists().catch((requestError) => setError(requestError.message));
      void refreshSearchResults().catch((requestError) => setError(requestError.message));
    };

    const handleConnect = () => {
      setSocketConnected(true);
      const activeId = selectedIdRef.current;
      if (activeId) {
        void emitChatEvent(socket, 'chat:join', { conversationId: activeId })
          .then(() => emitChatEvent(socket, 'message:seen', { conversationId: activeId }))
          .catch((socketError) => setError(socketError.message));
      }
    };
    const handleDisconnect = () => setSocketConnected(false);
    const handleNewMessage = (message) => {
      if (message.conversationId === selectedIdRef.current) {
        setMessages((current) => upsertMessage(current, message));
      }
      refresh();
    };
    const handleDelivery = ({ userId, count }) => {
      if (!count || userId === user.id) return;
      setMessages((current) =>
        current.map((message) =>
          isOwnMessage(message, user.id) && message.status !== 'seen'
            ? { ...message, status: 'delivered' }
            : message,
        ),
      );
    };
    const handleSeen = ({ userId, count }) => {
      if (!count || userId === user.id) return;
      setMessages((current) =>
        current.map((message) =>
          isOwnMessage(message, user.id) ? { ...message, status: 'seen' } : message,
        ),
      );
    };
    const handleDeleted = (message) => {
      if (message.conversationId !== selectedIdRef.current) return;
      if (message.scope === 'me' && message.deletedBy !== user.id) return;
      setMessages((current) => {
        if (message.scope === 'me') {
          return current.filter((item) => item._id !== message._id);
        }
        return upsertMessage(current, message);
      });
    };
    const refreshSocketAuth = () => {
      socket.auth = { token: getAccessToken() };
      socket.disconnect();
      socket.connect();
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('message:new', handleNewMessage);
    socket.on('conversation:updated', refresh);
    socket.on('message:delivered', handleDelivery);
    socket.on('message:seen', handleSeen);
    socket.on('message:deleted', handleDeleted);
    socket.on('presence:update', handlePresence);
    socket.on('friend:request', refresh);
    socket.on('friend:accepted', refresh);
    socket.on('friend:removed', refresh);
    window.addEventListener('corptalk:auth-refreshed', refreshSocketAuth);

    return () => {
      window.removeEventListener('corptalk:auth-refreshed', refreshSocketAuth);
      if (selectedIdRef.current) {
        socket.emit('chat:leave', { conversationId: selectedIdRef.current });
      }
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [refreshLists, refreshSearchResults, user.id]);

  useEffect(() => {
    if (!selectedId) return undefined;
    let active = true;
    getMessages(selectedId)
      .then((result) => {
        if (!active) return;
        setMessages(result.messages.map((message) => ({ ...message, currentUserId: user.id })));
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
        const socket = socketRef.current;
        if (socket?.connected) {
          void emitChatEvent(socket, 'chat:join', { conversationId: selectedId })
            .then(() => emitChatEvent(socket, 'message:seen', { conversationId: selectedId }))
            .then(() => {
              setConversations((current) =>
                current.map((item) =>
                  item.id === selectedId ? { ...item, unreadCount: 0 } : item,
                ),
              );
            })
            .catch((socketError) => setError(socketError.message));
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error?.message || requestError.message);
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId, user.id]);

  useEffect(
    () => () => {
      for (const url of previewUrlsRef.current.values()) URL.revokeObjectURL(url);
    },
    [],
  );

  useEffect(() => {
    if (!stickToBottomRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  const selectFriend = async (friend) => {
    setError('');
    try {
      const conversation = await createDirectConversation(friend.id);
      await refreshLists();
      if (selectedIdRef.current && socketRef.current?.connected) {
        socketRef.current.emit('chat:leave', { conversationId: selectedIdRef.current });
      }
      setMessages([]);
      setLoadingMessages(true);
      stickToBottomRef.current = true;
      setSelectedId(conversation.id);
      setSidebarVisible(false);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const selectConversation = (conversationId) => {
    if (selectedIdRef.current && socketRef.current?.connected) {
      socketRef.current.emit('chat:leave', { conversationId: selectedIdRef.current });
    }
    setMessages([]);
    setLoadingMessages(true);
    stickToBottomRef.current = true;
    setSelectedId(conversationId);
    setSidebarVisible(false);
  };

  const addMessage = (message) => {
    if (message.conversationId !== selectedIdRef.current) return;
    setMessages((current) => upsertMessage(current, { ...message, currentUserId: user.id }));
  };

  const sendText = async (
    text,
    clientMessageId = makeClientMessageId(),
    isRetry = false,
    targetConversationId = selectedId,
    replyMessageId = replyTo?.id || replyTo?._id,
  ) => {
    if (!targetConversationId) return;
    if (!isRetry) {
      addMessage({
        _id: clientMessageId,
        clientMessageId,
        conversationId: targetConversationId,
        sender: { id: user.id, name: user.name, avatar: user.avatar },
        text,
        type: 'text',
        status: 'sent',
        createdAt: new Date().toISOString(),
      });
    } else {
      setMessages((current) =>
        current.map((message) =>
          message.clientMessageId === clientMessageId ? { ...message, failed: false } : message,
        ),
      );
    }
    retryActionsRef.current.set(clientMessageId, () =>
      sendText(text, clientMessageId, true, targetConversationId, replyMessageId),
    );
    setError('');
    try {
      let message;
      if (socketRef.current?.connected) {
        const result = await emitChatEvent(socketRef.current, 'message:send', {
          conversationId: targetConversationId,
          text,
          replyTo: replyMessageId,
          clientMessageId,
        });
        message = result.message;
      } else {
        const response = await apiClient.post('/messages', {
          conversationId: targetConversationId,
          text,
          replyTo: replyMessageId,
          clientMessageId,
        });
        message = response.data.data.message;
      }
      addMessage(message);
      retryActionsRef.current.delete(clientMessageId);
      await refreshLists();
    } catch (requestError) {
      if (selectedIdRef.current === targetConversationId) {
        setMessages((current) =>
          current.map((message) =>
            message.clientMessageId === clientMessageId ? { ...message, failed: true } : message,
          ),
        );
        setError(requestError.response?.data?.error?.message || requestError.message);
      }
    }
  };

  const sendFile = async (
    file,
    caption = '',
    clientMessageId = makeClientMessageId(),
    isRetry = false,
    targetConversationId = selectedId,
    replyMessageId = replyTo?.id || replyTo?._id,
  ) => {
    if (!targetConversationId) return;
    if (!isRetry) {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.set(clientMessageId, previewUrl);
      addMessage({
        _id: clientMessageId,
        clientMessageId,
        conversationId: targetConversationId,
        sender: { id: user.id, name: user.name, avatar: user.avatar },
        text: caption,
        type: file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('video/')
            ? 'video'
            : file.type.startsWith('audio/')
              ? 'voice'
              : 'file',
        media: {
          url: previewUrl,
          mimeType: file.type,
          originalName: file.name,
          sizeBytes: file.size,
        },
        status: 'sent',
        createdAt: new Date().toISOString(),
      });
    } else {
      setMessages((current) =>
        current.map((message) =>
          message.clientMessageId === clientMessageId ? { ...message, failed: false } : message,
        ),
      );
    }
    retryActionsRef.current.set(clientMessageId, () =>
      sendFile(file, caption, clientMessageId, true, targetConversationId, replyMessageId),
    );
    setError('');
    try {
      const message = await sendMessageFile(targetConversationId, file, {
        text: caption,
        replyTo: replyMessageId,
        clientMessageId,
      });
      const previewUrl = previewUrlsRef.current.get(clientMessageId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(clientMessageId);
      addMessage(message);
      retryActionsRef.current.delete(clientMessageId);
      await refreshLists();
    } catch (requestError) {
      if (selectedIdRef.current === targetConversationId) {
        setMessages((current) =>
          current.map((message) =>
            message.clientMessageId === clientMessageId ? { ...message, failed: true } : message,
          ),
        );
        setError(requestError.response?.data?.error?.message || requestError.message);
      }
    }
  };

  const loadOlderMessages = async () => {
    if (!selectedId || !hasMore || !nextCursor || loadingOlderRef.current) return;
    const scroller = scrollRef.current;
    const oldHeight = scroller?.scrollHeight || 0;
    loadingOlderRef.current = true;
    try {
      const result = await getMessages(selectedId, nextCursor);
      setMessages((current) => {
        const combined = [...result.messages, ...current];
        return sortMessages(
          combined.filter(
            (message, index) =>
              combined.findIndex((candidate) => candidate._id === message._id) === index,
          ),
        ).map((message) => ({ ...message, currentUserId: user.id }));
      });
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          if (scroller) scroller.scrollTop = scroller.scrollHeight - oldHeight;
          resolve();
        });
      });
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    } finally {
      loadingOlderRef.current = false;
    }
  };

  const handleDelete = async (message, own) => {
    const scope =
      own &&
      window.confirm('Delete this message for everyone? Choose Cancel to delete it only for you.')
        ? 'all'
        : 'me';
    try {
      const deleted = await deleteMessage(message._id, scope);
      if (scope === 'me') {
        setMessages((current) => current.filter((item) => item._id !== message._id));
      } else {
        addMessage(deleted);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const handleEnableNotifications = async () => {
    setError('');
    try {
      const { enablePushNotifications: enable } = await import('../services/pushNotifications.js');
      await enable();
      setNotificationsEnabled(true);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <section className="flex h-[calc(100vh-11rem)] min-h-[34rem] overflow-hidden rounded-3xl border border-border bg-bg shadow-sm">
      <aside
        className={`w-full shrink-0 border-r border-border bg-bg sm:w-80 ${
          sidebarVisible || !selectedId ? 'block' : 'hidden sm:block'
        }`}
      >
        <div className="border-b border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary-text">
                Messages
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-heading">Chats</h1>
            </div>
            <button
              type="button"
              onClick={handleEnableNotifications}
              title="Enable offline notifications"
              aria-label="Enable offline notifications"
              className="rounded-full p-2 text-text-muted hover:bg-surface hover:text-heading"
            >
              <Bell size={19} className={notificationsEnabled ? 'text-brand-primary' : ''} />
            </button>
          </div>
          <label className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-bg-subtle px-3 py-2.5">
            <Search size={17} className="text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              placeholder="Search chats, friends, or @username"
              aria-label="Search chats, friends, or username"
            />
          </label>
          <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <span
              className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-success' : 'bg-warning'}`}
            />
            {socketConnected ? 'Live connection' : 'Connecting…'}
          </div>
        </div>
        <div className="h-[calc(100%-8.7rem)] overflow-y-auto">
          <h2 className="px-5 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Conversations
          </h2>
          {loadingList ? (
            <p className="px-5 py-4 text-sm text-text-muted">Loading chats…</p>
          ) : filteredConversations.length ? (
            filteredConversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => selectConversation(conversation.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-subtle ${
                  selectedId === conversation.id ? 'bg-brand-primary-soft' : ''
                }`}
              >
                <Avatar user={conversation.participant} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-heading">
                      {conversation.participant.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-text-muted">
                      {conversation.lastMessage?.sentAt
                        ? formatDistanceToNow(new Date(conversation.lastMessage.sentAt), {
                            addSuffix: false,
                          })
                        : ''}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-text-muted">
                      {conversation.lastMessage?.preview || 'Start a conversation'}
                    </span>
                    {conversation.unreadCount > 0 && (
                      <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-semibold text-on-primary">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <p className="px-5 py-3 text-sm text-text-muted">No conversations yet.</p>
          )}
          <div
            className="mt-4 flex border-b border-border px-3"
            role="tablist"
            aria-label="Friends"
          >
            {['friends', 'requests'].map((tab) => (
              <button
                type="button"
                key={tab}
                role="tab"
                aria-selected={friendsTab === tab}
                onClick={() => setFriendsTab(tab)}
                className={`flex-1 border-b-2 px-2 py-2 text-sm font-medium capitalize ${
                  friendsTab === tab
                    ? 'border-brand-primary text-brand-primary-text'
                    : 'border-transparent text-text-muted hover:text-heading'
                }`}
              >
                {tab}
                {tab === 'requests' && friendRequests.incoming.length > 0 && (
                  <span className="ml-1 rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] text-on-primary">
                    {friendRequests.incoming.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          {friendsTab === 'friends' ? (
            <>
              {search && /^[a-z0-9_@]{3,21}$/i.test(search.trim()) && (
                <section aria-label="Username search results">
                  <h2 className="px-5 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Find by username
                  </h2>
                  {searchResults.length ? (
                    searchResults.map((person) => {
                      const relationship = person.relationship;
                      const cooldownActive =
                        relationship?.cooldownUntil &&
                        new Date(relationship.cooldownUntil) > new Date();
                      return (
                        <div
                          key={person.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-bg-subtle"
                        >
                          <Avatar user={person} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading">
                            {person.name}
                            <span className="block truncate text-xs font-normal text-text-muted">
                              @{person.username}
                            </span>
                          </span>
                          {relationship?.status === 'accepted' ? (
                            <span className="text-xs text-text-muted">Friends</span>
                          ) : relationship?.status === 'pending' &&
                            relationship.direction === 'outgoing' ? (
                            <span className="text-xs text-text-muted">Sent</span>
                          ) : relationship?.status === 'pending' ? (
                            <button
                              type="button"
                              className="rounded-lg bg-brand-primary px-2 py-1 text-xs text-on-primary"
                              onClick={() =>
                                void performFriendAction(
                                  () => acceptFriendRequest(relationship.requestId),
                                  true,
                                )
                              }
                            >
                              Accept
                            </button>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Add ${person.name}`}
                              title={
                                cooldownActive
                                  ? 'Friend requests are temporarily limited'
                                  : 'Add friend'
                              }
                              disabled={Boolean(cooldownActive)}
                              className="rounded-lg p-2 text-brand-primary-text hover:bg-brand-primary-soft disabled:opacity-40"
                              onClick={() =>
                                void performFriendAction(() => sendFriendRequest(person.id), true)
                              }
                            >
                              <UserRoundPlus size={17} />
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Block ${person.name}`}
                            title="Block"
                            onClick={() =>
                              window.confirm(`Block ${person.name}?`) &&
                              void performFriendAction(() => blockFriend(person.id), true)
                            }
                            className="rounded-lg p-2 text-text-muted hover:bg-surface hover:text-error"
                          >
                            <Ban size={16} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="px-5 py-2 text-sm text-text-muted">
                      No available user found. Search their exact username.
                    </p>
                  )}
                </section>
              )}
              <h2 className="px-5 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Friends
              </h2>
              {filteredFriends.length ? (
                filteredFriends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-bg-subtle"
                  >
                    <Avatar user={friend} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading">
                      {friend.name}
                      {friend.username && (
                        <span className="block truncate text-xs font-normal text-text-muted">
                          @{friend.username}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      aria-label={`Chat with ${friend.name}`}
                      title="Message"
                      onClick={() => void selectFriend(friend)}
                      className="rounded-lg p-2 text-text-muted hover:bg-brand-primary-soft hover:text-brand-primary-text"
                    >
                      <Send size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Unfriend ${friend.name}`}
                      title="Unfriend"
                      onClick={() =>
                        window.confirm(`Remove ${friend.name} from your friends?`) &&
                        void performFriendAction(() => removeFriend(friend.id))
                      }
                      className="rounded-lg p-2 text-text-muted hover:bg-surface hover:text-error"
                    >
                      <UserRoundMinus size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Block ${friend.name}`}
                      title="Block"
                      onClick={() =>
                        window.confirm(`Block ${friend.name}? This also removes the friendship.`) &&
                        void performFriendAction(() => blockFriend(friend.id))
                      }
                      className="rounded-lg p-2 text-text-muted hover:bg-surface hover:text-error"
                    >
                      <Ban size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-5 py-3 text-sm text-text-muted">
                  No accepted friends yet. Search for a username to add a friend.
                </p>
              )}
            </>
          ) : (
            <section aria-label="Friend requests" className="pb-4">
              <h2 className="px-5 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Incoming
              </h2>
              {friendRequests.incoming.length ? (
                friendRequests.incoming.map((request) => (
                  <div key={request.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar user={request.user} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading">
                      {request.user.name}
                      <span className="block truncate text-xs font-normal text-text-muted">
                        @{request.user.username}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Accept ${request.user.name}`}
                      title="Accept"
                      onClick={() =>
                        void performFriendAction(() => acceptFriendRequest(request.id))
                      }
                      className="rounded-lg p-2 text-success hover:bg-surface"
                    >
                      <Check size={17} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Reject ${request.user.name}`}
                      title="Reject"
                      onClick={() =>
                        void performFriendAction(() => rejectFriendRequest(request.id))
                      }
                      className="rounded-lg p-2 text-error hover:bg-surface"
                    >
                      <X size={17} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-5 py-2 text-sm text-text-muted">No incoming requests.</p>
              )}
              <h2 className="px-5 pb-2 pt-5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Sent
              </h2>
              {friendRequests.outgoing.length ? (
                friendRequests.outgoing.map((request) => (
                  <div key={request.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar user={request.user} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading">
                      {request.user.name}
                      <span className="block truncate text-xs font-normal text-text-muted">
                        @{request.user.username}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-surface"
                      onClick={() =>
                        void performFriendAction(() => cancelFriendRequest(request.id))
                      }
                    >
                      Cancel
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-5 py-2 text-sm text-text-muted">No sent requests.</p>
              )}
              <h2 className="px-5 pb-2 pt-5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Blocked
              </h2>
              {blockedUsers.length ? (
                blockedUsers.map((blocked) => (
                  <div key={blocked.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar user={blocked} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading">
                      {blocked.name}
                      {blocked.username && (
                        <span className="block truncate text-xs font-normal text-text-muted">
                          @{blocked.username}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-surface"
                      onClick={() => void performFriendAction(() => unblockFriend(blocked.id))}
                    >
                      Unblock
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-5 py-2 text-sm text-text-muted">No blocked users.</p>
              )}
            </section>
          )}
        </div>
      </aside>

      <div className={`min-w-0 flex-1 flex-col ${sidebarVisible ? 'hidden sm:flex' : 'flex'}`}>
        {activeConversation ? (
          <>
            <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
              <button
                type="button"
                className="rounded-full p-2 text-text-muted hover:bg-surface sm:hidden"
                aria-label="Back to chat list"
                onClick={() => setSidebarVisible(true)}
              >
                <ArrowLeft size={19} />
              </button>
              <Avatar user={activeConversation.participant} large />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold text-heading">
                  {activeConversation.participant.name}
                </h2>
                <p className="text-xs text-text-muted">
                  {activeConversation.participant.isOnline
                    ? 'Online'
                    : activeConversation.participant.lastSeen
                      ? `Last seen ${formatDistanceToNow(new Date(activeConversation.participant.lastSeen), { addSuffix: true })}`
                      : 'Offline'}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-text-muted hover:bg-surface"
                aria-label="Conversation options"
                onClick={() => setError('Conversation details will be available in a later phase.')}
              >
                <MoreHorizontal size={20} />
              </button>
            </header>

            {error && (
              <div
                role="alert"
                className="border-b border-error/20 bg-error/5 px-4 py-2 text-sm text-error"
              >
                {error}
              </div>
            )}
            {!activeConversation.canSend && (
              <div
                role="status"
                className="border-b border-border bg-bg-subtle px-4 py-2 text-sm text-text-muted"
              >
                You can view this chat history, but messaging is unavailable because you are no
                longer friends.
              </div>
            )}

            <div
              ref={scrollRef}
              onScroll={(event) => {
                const element = event.currentTarget;
                stickToBottomRef.current =
                  element.scrollHeight - element.scrollTop - element.clientHeight < 100;
                if (event.currentTarget.scrollTop < 50) void loadOlderMessages();
              }}
              className="flex-1 overflow-y-auto px-4 py-4 sm:px-6"
            >
              {hasMore && (
                <button
                  type="button"
                  className="mx-auto mb-4 block text-xs font-medium text-brand-primary-text underline"
                  onClick={() => void loadOlderMessages()}
                >
                  {loadingMessages ? 'Loading…' : 'Load earlier messages'}
                </button>
              )}
              {loadingMessages ? (
                <p className="py-10 text-center text-sm text-text-muted">Loading messages…</p>
              ) : messages.length ? (
                messages.map((message, index) => (
                  <MessageBubble
                    key={message._id}
                    message={{ ...message, currentUserId: user.id }}
                    previousMessage={messages[index - 1]}
                    own={isOwnMessage(message, user.id)}
                    onReply={(selectedMessage) =>
                      setReplyTo({
                        ...selectedMessage,
                        id: selectedMessage._id,
                        senderName: isOwnMessage(selectedMessage, user.id)
                          ? 'yourself'
                          : activeConversation.participant.name,
                      })
                    }
                    onCopy={(text) => {
                      if (!navigator.clipboard?.writeText) {
                        setError('Clipboard access is not available in this browser.');
                      } else {
                        void navigator.clipboard.writeText(text).catch((copyError) => {
                          setError(copyError.message || 'Could not copy message text');
                        });
                      }
                    }}
                    onDelete={handleDelete}
                    onRetry={(message) => {
                      const retry = retryActionsRef.current.get(message.clientMessageId);
                      if (retry) void retry();
                    }}
                  />
                ))
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <MessageCircle size={34} className="text-brand-primary" />
                  <p className="mt-3 font-medium text-heading">Start the conversation</p>
                  <p className="mt-1 text-sm text-text-muted">
                    Send a message, photo, file, or voice note.
                  </p>
                </div>
              )}
            </div>

            <ChatComposer
              disabled={!activeConversation.canSend}
              onSendText={(text) => void sendText(text)}
              onSendFile={(file, caption) => void sendFile(file, caption)}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="rounded-3xl bg-brand-primary-soft p-5 text-brand-primary">
              <UserRound size={32} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-heading">Your messages</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">
              Choose a conversation or an accepted friend. The friend request flow is part of Phase
              1.5.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Avatar({ user, large = false }) {
  const sizeClass = large ? 'h-11 w-11' : 'h-10 w-10';
  return (
    <span className="relative inline-flex shrink-0">
      {user.avatar ? (
        <img src={user.avatar} alt="" className={`${sizeClass} rounded-full object-cover`} />
      ) : (
        <span
          className={`flex ${sizeClass} items-center justify-center rounded-full bg-brand-primary-soft font-semibold text-brand-primary-text ${
            large ? 'text-sm' : 'text-xs'
          }`}
        >
          {user.name?.slice(0, 1).toUpperCase() || '?'}
        </span>
      )}
      {user.isOnline && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-bg bg-success" />
      )}
    </span>
  );
}

function isOwnMessage(message, userId) {
  const senderId = typeof message.sender === 'object' ? message.sender?.id : message.sender;
  return senderId?.toString() === userId.toString();
}

function upsertMessage(messages, message) {
  const index = messages.findIndex(
    (candidate) =>
      candidate._id === message._id ||
      (message.clientMessageId && candidate.clientMessageId === message.clientMessageId),
  );
  const updated =
    index < 0
      ? [...messages, message]
      : messages.map((candidate, itemIndex) => (itemIndex === index ? message : candidate));
  return sortMessages(updated);
}

export default ChatPage;
