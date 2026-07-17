import "server-only";

export const MEDIA_VARIANTS = ["thumbnail", "preview", "hd"] as const;

export type MediaVariantType = (typeof MEDIA_VARIANTS)[number];

export type StoredObject = {
  storageKey: string;
  byteSize: number;
  etag: string;
};

export type BufferedVariant = {
  variantType: MediaVariantType;
  bytes: Buffer;
  extension: string;
  mimeType: string;
  width: number;
  height: number;
};

export type RemoteMediaSource = {
  storageKey: string;
  mimeType: string;
  byteSize: number;
};

export type PersistedVariant = {
  variantType: MediaVariantType;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  etag?: string;
};

export interface ObjectStorage<TBody = Buffer> {
  put(storageKey: string, body: TBody): Promise<StoredObject>;
  read(storageKey: string): Promise<TBody>;
  delete(storageKey: string): Promise<void>;
}

export interface ImageProcessor<TInput, TVariant> {
  readonly provider: "local-sharp" | "tencent-ci";
  inspect(input: TInput): Promise<{
    mimeType: string;
    width: number;
    height: number;
    hasAlpha: boolean;
  }>;
  process(input: TInput): Promise<TVariant[]>;
}
