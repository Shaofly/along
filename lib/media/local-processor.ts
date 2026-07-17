import "server-only";

import sharp from "sharp";

import type {
  BufferedVariant,
  ImageProcessor,
} from "@/lib/media/contracts";

const MAX_INPUT_PIXELS = 50_000_000;

function requiredDimension(value: number | undefined, label: string) {
  if (!value || value <= 0) throw new Error(`无法读取图片${label}。`);
  return value;
}

async function webpVariant(
  input: Buffer,
  variantType: "thumbnail" | "preview",
  maxEdge: number,
  quality: number,
): Promise<BufferedVariant> {
  const { data, info } = await sharp(input, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColorspace("srgb")
    .webp({ quality, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });

  return {
    variantType,
    bytes: data,
    extension: "webp",
    mimeType: "image/webp",
    width: info.width,
    height: info.height,
  };
}

export class LocalSharpProcessor implements ImageProcessor<Buffer, BufferedVariant> {
  readonly provider = "local-sharp" as const;

  async inspect(input: Buffer) {
    const metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    const width = requiredDimension(metadata.width, "宽度");
    const height = requiredDimension(metadata.height, "高度");
    const format = metadata.format;
    const mimeType = format === "jpeg" ? "image/jpeg" : `image/${format ?? "unknown"}`;
    return { mimeType, width, height, hasAlpha: Boolean(metadata.hasAlpha) };
  }

  async process(input: Buffer) {
    const source = await this.inspect(input);
    const [thumbnail, preview] = await Promise.all([
      webpVariant(input, "thumbnail", 720, 82),
      webpVariant(input, "preview", 1920, 88),
    ]);

    const base = sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .toColorspace("srgb");
    const hdResult = source.hasAlpha
      ? await base.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true })
      : await base.jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer({ resolveWithObject: true });
    const hd: BufferedVariant = {
      variantType: "hd",
      bytes: hdResult.data,
      extension: source.hasAlpha ? "png" : "jpg",
      mimeType: source.hasAlpha ? "image/png" : "image/jpeg",
      width: hdResult.info.width,
      height: hdResult.info.height,
    };

    return [thumbnail, preview, hd];
  }
}
