import type { PhotoLayoutSpec } from "@/lib/photo-layout";
import type { CircleTheme } from "@/lib/circle-theme";

export type PostVisibility = "friends" | "selected" | "private";
export type ProfileTheme = "sage" | "rose" | "mist" | "apricot" | "ink";
export type ProfileInfoVisibility = "all" | "selected" | "private";
export type ProfileViewMode = "all" | "personal" | "shared" | "private";

export type DraftMedia = {
  id: string;
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
};

export type DraftParticipant = {
  id: string;
  name: string;
  realName: string;
  isActive: boolean;
};

export type DraftCircleTarget = {
  id: string;
  name: string;
  status: "active" | "frozen" | "dissolved";
  isActiveMember: boolean;
};

export type DraftSummary = {
  id: string;
  body: string;
  visibility: PostVisibility;
  circleId: string | null;
  circle: DraftCircleTarget | null;
  managementMode: "creator" | "circle";
  media: DraftMedia[];
  mediaCount: number;
  photoLayout: PhotoLayoutSpec | null;
  canPublish: boolean;
  unavailableReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DraftDetail = DraftSummary & {
  viewerIds: string[];
  participants: DraftParticipant[];
  circleMembers: DraftParticipant[];
};

export type FeedPost = {
  id: string;
  body: string;
  visibility: PostVisibility;
  publicationStatus: "publishing" | "published" | "failed";
  publicationError: string | null;
  photoLayout: PhotoLayoutSpec | null;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    image: string | null;
  };
  circle: {
    id: string;
    name: string;
  } | null;
  managementMode: "creator" | "circle";
  lastEditor: {
    id: string;
    name: string;
  } | null;
  canEdit: boolean;
  canDelete: boolean;
  isHistorical: boolean;
  media: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    width: number;
    height: number;
  }>;
  viewerIds: string[];
  participantIds: string[];
  participants: DraftParticipant[];
  circleMembers: DraftParticipant[];
};

export type CircleSummary = {
  id: string;
  name: string;
  description: string;
  theme: CircleTheme;
  coverImage: string | null;
  updatedAt: string;
  status: "active" | "frozen" | "dissolved";
  isActive: boolean;
  isArchived?: boolean;
  capturedAt?: string | null;
  frozenAt?: string | null;
  deleteAt?: string | null;
  canRestore?: boolean;
  members: Array<{
    id: string;
    name: string;
    realName: string;
    image: string | null;
  }>;
  unread: {
    posts: number;
    comments: number;
    replies: number;
    changes: number;
    total: number;
  };
};

export type FriendSummary = {
  id: string;
  name: string;
  realName: string | null;
  nickname: string | null;
  identityName: string;
  displayName: string;
  identityProtected: boolean;
  remark: string | null;
  image: string | null;
  bio: string;
};

export type ProfilePageData = {
  id: string;
  name: string;
  realName: string | null;
  nickname: string | null;
  identityProtected: boolean;
  image: string | null;
  legacyImage: string | null;
  bio: string;
  email: string | null;
  personalInfo: {
    gender: string | null;
    residence: string | null;
    phone: string | null;
    contactEmail: string | null;
    school: string | null;
  } | null;
  personalInfoSettings: {
    visibility: ProfileInfoVisibility;
    lastSharedVisibility: Exclude<ProfileInfoVisibility, "private"> | null;
    selectedFriendIds: string[];
  } | null;
  theme: ProfileTheme;
  avatar: {
    mediaId: string | null;
    src: string | null;
    focusX: number;
    focusY: number;
    scale: number;
  };
  cover: {
    mediaId: string | null;
    src: string | null;
    focusX: number;
    focusY: number;
    scale: number;
  } | null;
  createdAt: string;
  isSelf: boolean;
  audience: "self" | "friend" | "circle";
  isLimitedByCircle: boolean;
  posts: FeedPost[];
  nextCursor: string | null;
  view: ProfileViewMode;
};
