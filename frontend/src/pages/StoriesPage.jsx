import { useEffect, useRef, useState } from 'react';
import { Camera, Plus, Trash2, X } from 'lucide-react';
import {
  createStory,
  deleteStory,
  getMyStories,
  getStories,
  viewStory,
} from '../services/storyApi.js';

function StoriesPage() {
  const [stories, setStories] = useState([]);
  const [myStories, setMyStories] = useState([]);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [activeStory, setActiveStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const refresh = async () => {
    const [feed, own] = await Promise.all([getStories(), getMyStories()]);
    setStories(feed);
    setMyStories(own);
  };

  useEffect(() => {
    let active = true;
    Promise.all([getStories(), getMyStories()])
      .then(([feed, own]) => {
        if (active) {
          setStories(feed);
          setMyStories(own);
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error?.message || requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submitStory = async (event) => {
    event.preventDefault();
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      await createStory(file, caption);
      setFile(null);
      setCaption('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const openStory = async (story) => {
    setError('');
    try {
      const viewed = await viewStory(story.id);
      setActiveStory({ ...story, ...viewed, author: story.author });
      setStories((current) =>
        current.map((entry) =>
          entry.id === story.id
            ? {
                ...entry,
                viewedByMe: true,
                viewerCount: Math.max(entry.viewerCount, story.viewerCount + 1),
              }
            : entry,
        ),
      );
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const removeStory = async (story) => {
    setError('');
    try {
      await deleteStory(story.id);
      setMyStories((current) => current.filter((entry) => entry.id !== story.id));
      setStories((current) => current.filter((entry) => entry.id !== story.id));
      if (activeStory?.id === story.id) setActiveStory(null);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-primary-text">
          Updates
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-heading">Stories</h1>
        <p className="mt-2 text-sm text-text-muted">
          Share an image or video that expires after 24 hours.
        </p>
      </header>

      <form
        onSubmit={submitStory}
        className="space-y-3 rounded-3xl border border-border bg-bg p-5 shadow-sm"
      >
        <label className="block text-sm font-medium text-heading" htmlFor="story-media">
          Add a story
        </label>
        <input
          id="story-media"
          ref={fileInputRef}
          type="file"
          accept="image/*,video/mp4,video/webm,video/quicktime"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          className="block w-full text-sm text-text-muted file:mr-3 file:rounded-xl file:border-0 file:bg-brand-primary-soft file:px-4 file:py-2 file:font-semibold file:text-brand-primary-text"
        />
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={500}
          placeholder="Add a caption (optional)"
          className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none focus:border-brand-primary"
        />
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!file || saving}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
        >
          <Plus size={16} />
          {saving ? 'Sharing…' : 'Share story'}
        </button>
      </form>

      <div className="rounded-3xl border border-border bg-bg p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-heading">Recent stories</h2>
        {loading ? (
          <p className="text-sm text-text-muted">Loading stories…</p>
        ) : stories.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {stories.map((story) => (
              <button
                type="button"
                key={story.id}
                onClick={() => void openStory(story)}
                className="flex items-center gap-3 rounded-2xl border border-border p-3 text-left hover:bg-bg-subtle"
              >
                {story.mediaType === 'image' ? (
                  <img src={story.mediaUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-xl bg-surface">
                    <Camera size={24} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-heading">
                    {story.author.name}
                  </span>
                  <span className="block truncate text-sm text-text-muted">
                    {story.caption || `${story.mediaType} story`}
                  </span>
                  <span className="text-xs text-text-muted">
                    {story.viewedByMe ? 'Viewed' : 'New'} · {story.viewerCount} views
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No active stories from you or your friends.</p>
        )}
      </div>

      {myStories.length > 0 && (
        <div className="rounded-3xl border border-border bg-bg p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-heading">Your active stories</h2>
          <div className="space-y-2">
            {myStories.map((story) => (
              <div
                key={story.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-bg-subtle px-4 py-3"
              >
                <span className="truncate text-sm text-text">
                  {story.caption || `${story.mediaType} story`} · {story.viewerCount} views
                </span>
                <button
                  type="button"
                  aria-label="Delete story"
                  onClick={() => void removeStory(story)}
                  className="rounded-lg p-2 text-text-muted hover:text-error"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeStory && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/90 p-4">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-slate-950 text-white">
            <button
              type="button"
              aria-label="Close story"
              onClick={() => setActiveStory(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2"
            >
              <X size={20} />
            </button>
            {activeStory.mediaType === 'video' ? (
              <video
                src={activeStory.mediaUrl}
                controls
                autoPlay
                className="max-h-[75vh] w-full object-contain"
              />
            ) : (
              <img
                src={activeStory.mediaUrl}
                alt=""
                className="max-h-[75vh] w-full object-contain"
              />
            )}
            <div className="p-4">
              <p className="font-semibold">{activeStory.author?.name}</p>
              {activeStory.caption && (
                <p className="mt-1 text-sm text-slate-200">{activeStory.caption}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default StoriesPage;
