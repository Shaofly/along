/* eslint-disable @next/next/no-img-element -- Avatars can use authenticated media routes. */

import type { CSSProperties } from "react";

export function UserAvatar({
  className,
  image,
  imageStyle,
  name,
}: {
  className?: string;
  image: string | null;
  imageStyle?: CSSProperties;
  name: string;
}) {
  if (image) {
    return (
      <img
        alt=""
        className={className}
        decoding="async"
        src={image}
        style={imageStyle}
      />
    );
  }
  return (
    <span aria-hidden="true" className={className}>
      {Array.from(name.trim())[0] ?? "圆"}
    </span>
  );
}
