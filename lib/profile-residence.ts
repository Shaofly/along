export type ProfileResidenceMode = "domestic" | "overseas";

export const mainlandResidenceRegions = [
  "北京",
  "天津",
  "河北",
  "山西",
  "内蒙古",
  "辽宁",
  "吉林",
  "黑龙江",
  "上海",
  "江苏",
  "浙江",
  "安徽",
  "福建",
  "江西",
  "山东",
  "河南",
  "湖北",
  "湖南",
  "广东",
  "广西",
  "海南",
  "重庆",
  "四川",
  "贵州",
  "云南",
  "西藏",
  "陕西",
  "甘肃",
  "青海",
  "宁夏",
  "新疆",
  "香港",
  "澳门",
  "台湾",
] as const;

const mainlandResidenceRegionSet = new Set<string>(
  mainlandResidenceRegions,
);

function cleanResidencePart(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeProfileResidence(value: string) {
  const parts = value
    .split(/\s*[·・•]\s*/)
    .map(cleanResidencePart)
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function formatProfileResidence(
  primary: string,
  secondary: string,
) {
  return normalizeProfileResidence(
    [cleanResidencePart(primary), cleanResidencePart(secondary)]
      .filter(Boolean)
      .join(" · "),
  ) ?? "";
}

export function parseProfileResidence(value: string | null | undefined): {
  mode: ProfileResidenceMode;
  primary: string;
  secondary: string;
} {
  const normalized = normalizeProfileResidence(value ?? "");
  if (!normalized) {
    return { mode: "domestic", primary: "", secondary: "" };
  }
  const [primary, ...remaining] = normalized.split(" · ");
  return {
    mode: mainlandResidenceRegionSet.has(primary)
      ? "domestic"
      : "overseas",
    primary,
    secondary: remaining.join(" · "),
  };
}
