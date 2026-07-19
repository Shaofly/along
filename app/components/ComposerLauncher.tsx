"use client";

import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  FullComposer,
  type ComposerTarget,
} from "@/app/components/FullComposer";
import type { DraftParticipant, FriendSummary } from "@/lib/content-types";

export function ComposerLauncher({
  circleMembers = [],
  currentUserId,
  friends,
  label = "发布动态",
  mobileHref,
  returnHref,
  target,
}: {
  circleMembers?: DraftParticipant[];
  currentUserId: string;
  friends: FriendSummary[];
  label?: string;
  mobileHref: string;
  returnHref: string;
  target: ComposerTarget;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [renderComposer, setRenderComposer] = useState(false);

  function launch() {
    if (window.matchMedia("(max-width: 700px)").matches) {
      router.push(mobileHref);
      return;
    }
    setRenderComposer(true);
    setOpen(true);
  }

  return (
    <>
      <button className="primary-soft-action" onClick={launch} type="button">
        <PenLine size={17} />
        {label}
      </button>
      {renderComposer ? (
        <FullComposer
          circleMembers={circleMembers}
          currentUserId={currentUserId}
          friends={friends}
          modalOpen={open}
          onClose={() => setOpen(false)}
          onModalAfterClose={() => setRenderComposer(false)}
          onPublished={() => {
            setOpen(false);
            router.refresh();
          }}
          presentation="modal"
          returnHref={returnHref}
          target={target}
        />
      ) : null}
    </>
  );
}
