"use client";

/* eslint-disable @next/next/no-img-element -- Local previews use browser object URLs. */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SegmentedControl } from "@/app/components/SegmentedControl";
import { DissolveTextarea } from "@/app/components/DissolveField";
import {
  appendUniqueFiles,
  uploadMediaFiles,
  type UploadProgress,
} from "@/app/components/media-upload";
import { TextStateSwap } from "@/app/components/TextStateSwap";

const managementOptions = [
  { value: "creator", label: "仅我管理" },
  { value: "circle", label: "共同管理" },
] as const;

export function CircleComposer({ circleId, circleName }: { circleId: string; circleName: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [managementMode, setManagementMode] = useState<"creator" | "circle">("creator");
  const [pending, setPending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState("");
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  useEffect(
    () => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)),
    [previews],
  );

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() && files.length === 0) return;
    setPending(true);
    setError("");
    const uploadedIds: string[] = [];
    try {
      if (files.length) setUploadProgress({ percent: 0, phase: "uploading" });
      const uploaded = await uploadMediaFiles(files, setUploadProgress);
      uploadedIds.push(...uploaded.map((media) => media.id));
      setUploadProgress(null);
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          circleId,
          managementMode,
          visibility: "private",
          viewerIds: [],
          mediaIds: uploadedIds,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "发布失败。");
      setBody("");
      setFiles([]);
      setManagementMode("creator");
      router.refresh();
    } catch (publishError) {
      await Promise.all(uploadedIds.map((id) => fetch(`/api/media/${id}`, { method: "DELETE" })));
      setError(publishError instanceof Error ? publishError.message : "发布失败。");
    } finally {
      setUploadProgress(null);
      setPending(false);
    }
  }

  return (
    <form className="circle-composer" onSubmit={publish}>
      <div className="composer-context">
        <span>{circleName}</span>
        <small>仅当前有权访问这个圈子的成员可见</small>
      </div>
      <DissolveTextarea
        aria-label="圈子动态正文"
        maxLength={5000}
        onValueChange={setBody}
        placeholder="把一起经历的一点小事，留在这里……"
        value={body}
        wrapperClassName="composer-writing-surface"
      />
      {previews.length ? (
        <div className="upload-previews">
          {previews.map((preview, index) => (
            <figure key={`${preview.file.name}-${preview.file.lastModified}-${index}`}>
              <img alt="待发布预览" src={preview.url} />
              <button
                aria-label={`移除图片 ${preview.file.name}`}
                className="remove-preview"
                onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                type="button"
              ><span aria-hidden="true">×</span></button>
            </figure>
          ))}
        </div>
      ) : null}
      <div className="circle-composer-settings">
        <span>管理方式</span>
        <SegmentedControl
          ariaLabel="圈子动态管理方式"
          className="segmented-control--compact"
          onValueChange={setManagementMode}
          options={managementOptions}
          value={managementMode}
        />
      </div>
      {error ? <p className="composer-error">{error}</p> : null}
      <div className="composer-tools">
        <label className="photo-input">
          添加照片
          <input
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            onChange={(event) => {
              const result = appendUniqueFiles(files, event.target.files, 20);
              setFiles(result.files);
              setError(result.omitted > 0 ? "已忽略重复图片，或已达到每条动态 20 张的上限。" : "");
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
        <span>{files.length ? `${files.length} / 20 张` : `${circleName} · ${managementMode === "circle" ? "共同管理" : "仅我管理"}`}</span>
        <button className="publish-button" disabled={pending || (!body.trim() && files.length === 0)} type="submit">
          <TextStateSwap
            labels={["留在圈子里", "正在上传 100%", "正在处理", "正在发布"]}
            text={uploadProgress
              ? uploadProgress.phase === "processing"
                ? "正在处理"
                : `正在上传 ${uploadProgress.percent}%`
              : pending ? "正在发布" : "留在圈子里"}
          />
        </button>
      </div>
    </form>
  );
}
