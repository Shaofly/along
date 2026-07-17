export type UploadedMedia = {
  id: string;
  originalName: string;
  mimeType: string;
};

export type UploadProgress = {
  percent: number;
  phase: "uploading" | "processing";
};

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function appendUniqueFiles(current: File[], selected: FileList | null, limit: number) {
  if (!selected || limit <= current.length) {
    return { files: current, omitted: selected?.length ?? 0 };
  }

  const keys = new Set(current.map(fileKey));
  const files = [...current];
  let omitted = 0;

  for (const file of Array.from(selected)) {
    const key = fileKey(file);
    if (keys.has(key) || files.length >= limit) {
      omitted += 1;
      continue;
    }
    keys.add(key);
    files.push(file);
  }

  return { files, omitted };
}

function uploadOne(
  file: File,
  completedBytes: number,
  totalBytes: number,
  onProgress: (progress: UploadProgress) => void,
) {
  return new Promise<UploadedMedia>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    formData.set("file", file);

    request.open("POST", "/api/media");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      const currentFileBytes = event.lengthComputable && event.total > 0
        ? (event.loaded / event.total) * file.size
        : 0;
      const loaded = completedBytes + currentFileBytes;
      onProgress({
        percent: Math.min(99, Math.round((loaded / totalBytes) * 100)),
        phase: "uploading",
      });
    });
    request.upload.addEventListener("load", () => {
      const percent = Math.round(((completedBytes + file.size) / totalBytes) * 100);
      onProgress({ percent, phase: percent >= 100 ? "processing" : "uploading" });
    });
    request.addEventListener("load", () => {
      const result = (request.response ?? {}) as {
        id?: string;
        name?: string;
        mimeType?: string;
        error?: string;
      };
      if (request.status < 200 || request.status >= 300 || !result.id) {
        reject(new Error(result.error ?? "图片上传失败。"));
        return;
      }
      resolve({
        id: result.id,
        originalName: result.name ?? file.name,
        mimeType: result.mimeType ?? file.type,
      });
    });
    request.addEventListener("error", () => reject(new Error("网络中断，图片上传失败。")));
    request.addEventListener("abort", () => reject(new Error("图片上传已取消。")));
    request.send(formData);
  });
}

export async function uploadMediaFiles(
  files: File[],
  onProgress: (progress: UploadProgress) => void,
) {
  if (files.length === 0) return [];

  const totalBytes = Math.max(1, files.reduce((total, file) => total + file.size, 0));
  const uploaded: UploadedMedia[] = [];
  let completedBytes = 0;

  try {
    for (const file of files) {
      const media = await uploadOne(file, completedBytes, totalBytes, onProgress);
      uploaded.push(media);
      completedBytes += file.size;
    }
  } catch (error) {
    await Promise.all(uploaded.map((media) => fetch(`/api/media/${media.id}`, { method: "DELETE" })));
    throw error;
  }

  onProgress({ percent: 100, phase: "processing" });
  return uploaded;
}
