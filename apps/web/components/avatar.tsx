import type { CSSProperties } from 'react';

function colorFromSeed(seed: string, offset: number) {
  const slice = seed.slice(offset, offset + 6).padEnd(6, '7');
  const number = Number.parseInt(slice, 16) || 0;
  return `hsl(${number % 360} 62% ${offset === 0 ? '48%' : '38%'})`;
}

export function Avatar({ seed, name, size = 42 }: { seed: string; name: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const style = {
    '--avatar-a': colorFromSeed(seed, 0),
    '--avatar-b': colorFromSeed(seed, 8),
    width: size,
    height: size,
    fontSize: Math.max(11, Math.round(size * 0.34)),
  } as CSSProperties;

  return (
    <span className="avatar" style={style} aria-label={`${name}'s avatar`} role="img">
      <span aria-hidden="true">{initials || '?'}</span>
    </span>
  );
}
