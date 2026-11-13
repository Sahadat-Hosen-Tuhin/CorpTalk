import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import AvatarUpload from '../components/AvatarUpload.jsx';
import AuthField from '../components/AuthField.jsx';
import AuthSubmitButton from '../components/AuthSubmitButton.jsx';
import FormAlert from '../components/FormAlert.jsx';
import { getAuthErrorMessage, useAuthStore } from '../stores/authStore.js';
import { profileSchema } from '../validators/authSchemas.js';

function Profile() {
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const uploadAvatar = useAuthStore((state) => state.uploadAvatar);
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name,
      username: user.username || '',
      bio: user.bio || '',
      phone: user.phone || '',
    },
  });

  const onSubmit = async (values) => {
    setProfileError('');
    setProfileSaved(false);
    setSaving(true);
    try {
      const updates = { ...values, phone: values.phone || null };
      if (!updates.username) delete updates.username;
      await updateProfile(updates);
      setProfileSaved(true);
    } catch (error) {
      setProfileError(getAuthErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file) => {
    setAvatarError('');
    setAvatarLoading(true);
    try {
      await uploadAvatar(file);
      return true;
    } catch (error) {
      setAvatarError(getAuthErrorMessage(error));
      return false;
    } finally {
      setAvatarLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-primary-text">
          Your account
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-heading">
          Profile settings
        </h1>
        <p className="mt-2 text-sm text-text-muted">Manage the details your teammates see.</p>
      </header>

      <section className="rounded-3xl border border-border bg-bg p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-heading">Profile photo</h2>
        <p className="mt-1 text-sm text-text-muted">
          Your photo helps teammates recognize you across CorpTalk.
        </p>
        <div className="mt-6">
          <AvatarUpload
            avatar={user.avatar}
            loading={avatarLoading}
            onUpload={handleAvatarUpload}
          />
        </div>
        <div className="mt-4">
          <FormAlert>{avatarError}</FormAlert>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-bg p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-heading">Personal information</h2>
        <p className="mt-1 text-sm text-text-muted">Update your name and contact details.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormAlert>{profileError}</FormAlert>
          <FormAlert success>{profileSaved ? 'Your profile has been saved.' : null}</FormAlert>
          <AuthField
            id="name"
            label="Full name"
            autoComplete="name"
            register={register('name')}
            error={errors.name?.message}
          />
          <AuthField
            id="username"
            label="Username"
            autoComplete="username"
            placeholder="e.g. rahim_01"
            register={register('username')}
            error={errors.username?.message}
          />
          <p className="-mt-3 text-xs text-text-muted">
            Friends can find you by this unique username. You can change it later if available.
          </p>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-heading">
              Work email
            </label>
            <input
              id="email"
              type="email"
              value={user.email}
              readOnly
              className="w-full cursor-not-allowed rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-muted"
            />
          </div>
          <AuthField
            id="phone"
            label="Phone number"
            type="tel"
            autoComplete="tel"
            placeholder="Optional"
            register={register('phone')}
            error={errors.phone?.message}
          />
          <div>
            <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-heading">
              About you
            </label>
            <textarea
              id="bio"
              rows={4}
              maxLength={500}
              placeholder="A short introduction"
              className={`w-full resize-y rounded-xl border bg-bg px-4 py-3 text-sm text-text outline-none transition placeholder:text-text-muted/70 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 ${
                errors.bio ? 'border-error' : 'border-border'
              }`}
              {...register('bio')}
            />
            {errors.bio?.message && (
              <p className="mt-1.5 text-xs text-error">{errors.bio.message}</p>
            )}
          </div>
          <div className="pt-2">
            <AuthSubmitButton loading={saving} loadingLabel="Saving changes…">
              Save profile
            </AuthSubmitButton>
          </div>
        </form>
      </section>
    </section>
  );
}

export default Profile;
