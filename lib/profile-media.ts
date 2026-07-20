export const PROFILE_MEDIA_SCALE_BASE = 10_000;
export const PROFILE_MEDIA_SCALE_DB_MAX = 100_000;
export const PROFILE_AVATAR_SCALE_MAX = 30_000;
export const PROFILE_COVER_SCALE_MAX = 20_000;

export function clampProfileMediaScale(scale: number, maxScale: number) {
  return Math.round(
    Math.min(maxScale, Math.max(PROFILE_MEDIA_SCALE_BASE, scale)),
  );
}

export function profileMediaImageStyle({
  focusX,
  focusY,
  scale,
}: {
  focusX: number;
  focusY: number;
  scale: number;
}) {
  const normalizedScale = Math.max(
    PROFILE_MEDIA_SCALE_BASE,
    scale,
  ) / PROFILE_MEDIA_SCALE_BASE;
  return {
    objectPosition: `${focusX / 100}% ${focusY / 100}%`,
    transform: `scale(${normalizedScale})`,
    transformOrigin: `${focusX / 100}% ${focusY / 100}%`,
  };
}
