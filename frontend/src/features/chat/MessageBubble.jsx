import { Check, CheckCheck, Clock3, Copy, Reply, Trash2 } from 'lucide-react';
import { format, isSameDay } from 'date-fns';

const getStatusIcon = (status) => {
  if (status === 'seen') return <CheckCheck size={14} className="text-info" />;
  if (status === 'delivered') return <CheckCheck size={14} />;
  if (status === 'sent') return <Check size={14} />;
  return <Clock3 size={14} />;
};

function MessageBubble({ message, previousMessage, own, onCopy, onDelete, onReply, onRetry }) {
  const sentAt = new Date(message.createdAt);
  const showDate = !previousMessage || !isSameDay(sentAt, new Date(previousMessage.createdAt));
  const deletedForMe = message.deletedFor?.some((id) => id.toString() === message.currentUserId);

  return (
    <div>
      {showDate && (
        <div className="my-5 text-center text-xs font-medium text-text-muted">
          {format(sentAt, 'EEEE, MMMM d')}
        </div>
      )}
      {message.type === 'system' ? (
        <p className="my-3 text-center text-xs text-text-muted">{message.text}</p>
      ) : (
        <div className={`group flex ${own ? 'justify-end' : 'justify-start'}`}>
          <article
            className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%] ${
              own
                ? 'rounded-br-md bg-brand-primary-soft text-heading'
                : 'rounded-bl-md border border-border bg-bg text-text'
            }`}
          >
            {message.replyTo && (
              <div className="mb-2 border-l-2 border-brand-primary pl-2 text-xs text-text-muted">
                <span className="font-semibold">{message.replyTo.senderName}</span>
                <p className="truncate">{message.replyTo.text || 'Attachment'}</p>
              </div>
            )}
            {message.deletedForAll || deletedForMe ? (
              <p className="text-sm italic text-text-muted">Message deleted</p>
            ) : (
              <>
                {message.text && (
                  <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
                )}
                {message.media?.url && (
                  <div className={message.text ? 'mt-2' : ''}>
                    {message.type === 'image' ? (
                      <a href={message.media.url} target="_blank" rel="noreferrer">
                        <img
                          src={message.media.url}
                          alt={message.media.originalName || 'Shared image'}
                          className="max-h-80 max-w-full rounded-xl object-contain"
                        />
                      </a>
                    ) : message.type === 'video' ? (
                      <video controls preload="metadata" className="max-h-80 max-w-full rounded-xl">
                        <source
                          src={message.media.url}
                          type={message.media.mimeType || undefined}
                        />
                      </video>
                    ) : message.type === 'voice' ? (
                      <audio controls preload="metadata" className="max-w-full">
                        <source
                          src={message.media.url}
                          type={message.media.mimeType || undefined}
                        />
                      </audio>
                    ) : (
                      <a
                        href={message.media.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-xl border border-border bg-bg-subtle px-3 py-2 text-sm font-medium underline"
                      >
                        {message.media.originalName || 'Download file'}
                      </a>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-text-muted">
              {message.failed ? (
                <button
                  type="button"
                  className="text-error underline"
                  onClick={() => onRetry(message)}
                >
                  Failed · retry
                </button>
              ) : (
                <>
                  <span>{format(sentAt, 'p')}</span>
                  {own && getStatusIcon(message.status)}
                </>
              )}
            </div>
            {!message.deletedForAll && !deletedForMe && (
              <div className="mt-1 flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                {message.text && (
                  <button
                    type="button"
                    aria-label="Copy message text"
                    className="text-text-muted hover:text-heading"
                    onClick={() => onCopy(message.text)}
                  >
                    <Copy size={14} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Reply to message"
                  className="text-text-muted hover:text-heading"
                  onClick={() => onReply(message)}
                >
                  <Reply size={14} />
                </button>
                <button
                  type="button"
                  aria-label={own ? 'Delete for me or everyone' : 'Delete for me'}
                  className="text-text-muted hover:text-error"
                  onClick={() => onDelete(message, own)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </article>
        </div>
      )}
    </div>
  );
}

export default MessageBubble;
