export const circleThemes = [
  { value: "peach", label: "桃杏" },
  { value: "sage", label: "鼠尾草" },
  { value: "mist", label: "雾蓝" },
  { value: "lavender", label: "淡紫" },
  { value: "apricot", label: "杏黄" },
  { value: "teal", label: "青绿" },
] as const;

export type CircleTheme = (typeof circleThemes)[number]["value"];

export const defaultCircleTheme: CircleTheme = "peach";

export function circleThemeClass(theme: CircleTheme) {
  return `circle-theme-${theme}`;
}
