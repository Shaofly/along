export type PostVisibility = "friends" | "selected" | "private";

export type FeedPost = {
  id: string;
  body: string;
  visibility: PostVisibility;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    image: string | null;
  };
  media: Array<{
    id: string;
    originalName: string;
    mimeType: string;
  }>;
  viewerIds: string[];
};

export type FriendSummary = {
  id: string;
  name: string;
  image: string | null;
};
