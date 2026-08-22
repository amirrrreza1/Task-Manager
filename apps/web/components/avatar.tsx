'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Avatar as AppicaAvatar, AvatarFallback, AvatarImage } from '@appica/ui-react/avatar';
import { useAuth } from './auth-provider';

const avatarObjectUrls = new Map<string, string>();
const avatarInflight = new Map<string, Promise<string | null>>();
const avatarListeners = new Set<(userId: string) => void>();

export function invalidateAvatarCache(userId: string) {
  const existing = avatarObjectUrls.get(userId);
  if (existing) {
    URL.revokeObjectURL(existing);
    avatarObjectUrls.delete(userId);
  }
  avatarInflight.delete(userId);
  for (const listener of avatarListeners) listener(userId);
}

function firstLetter(name: string) {
  const letter = [...name.trim()][0];
  return letter ? letter.toUpperCase() : '?';
}

function loadAvatar(
  userId: string,
  requestBlob: (path: string) => Promise<Blob>,
): Promise<string | null> {
  const cached = avatarObjectUrls.get(userId);
  if (cached) return Promise.resolve(cached);
  const pending = avatarInflight.get(userId);
  if (pending) return pending;

  const request = requestBlob(`/users/${userId}/avatar`)
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const previous = avatarObjectUrls.get(userId);
      if (previous) URL.revokeObjectURL(previous);
      avatarObjectUrls.set(userId, url);
      return url;
    })
    .catch(() => null)
    .finally(() => {
      avatarInflight.delete(userId);
    });

  avatarInflight.set(userId, request);
  return request;
}

function useAvatarSrc(userId: string | undefined, hasAvatar: boolean | undefined) {
  const { requestBlob } = useAuth();
  const [src, setSrc] = useState<string | null>(() =>
    userId && hasAvatar ? (avatarObjectUrls.get(userId) ?? null) : null,
  );
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onInvalidate = (id: string) => {
      if (id === userId) setVersion((current) => current + 1);
    };
    avatarListeners.add(onInvalidate);
    return () => {
      avatarListeners.delete(onInvalidate);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !hasAvatar) {
      setSrc(null);
      return;
    }

    let cancelled = false;
    void loadAvatar(userId, requestBlob).then((url) => {
      if (!cancelled) setSrc(url);
    });

    return () => {
      cancelled = true;
    };
  }, [userId, hasAvatar, requestBlob, version]);

  return src;
}

export function Avatar({
  name,
  size = 42,
  initialsSize,
  userId,
  hasAvatar = false,
  color,
  title,
}: {
  name: string;
  size?: number;
  initialsSize?: number;
  userId?: string;
  hasAvatar?: boolean;
  color?: string | null;
  title?: string | false;
}) {
  const src = useAvatarSrc(userId, hasAvatar);
  const style = {
    width: size,
    height: size,
    fontSize: initialsSize ?? Math.max(16, Math.round(size * 0.6)),
    ...(color ? { backgroundColor: color } : {}),
  } as CSSProperties;

  return (
    <AppicaAvatar
      className="avatar"
      size={size}
      style={style}
      aria-label={`${name}'s avatar`}
      title={title === false ? undefined : (title ?? name)}
    >
      {src ? <AvatarImage alt="" src={src} /> : null}
      <AvatarFallback>{firstLetter(name)}</AvatarFallback>
    </AppicaAvatar>
  );
}
