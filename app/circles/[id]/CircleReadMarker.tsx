"use client";

import { useEffect } from "react";

export function CircleReadMarker({ circleId }: { circleId: string }) {
  useEffect(() => {
    void fetch(`/api/circles/${circleId}/read`, { method: "POST", keepalive: true });
  }, [circleId]);

  return null;
}
