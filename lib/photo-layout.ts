export const PHOTO_LAYOUT_VERSION = 1 as const;
export const PHOTO_LAYOUT_VISIBLE_LIMIT = 9;

type LayoutNode =
  | { kind: "leaf" }
  | { kind: "split"; axis: "horizontal" | "vertical"; first: LayoutNode; second: LayoutNode };

export type PhotoLayoutSpec =
  | {
      version: typeof PHOTO_LAYOUT_VERSION;
      mode: "recursive";
      visibleCount: number;
      topology: string;
    }
  | {
      version: typeof PHOTO_LAYOUT_VERSION;
      mode: "rows";
      visibleCount: number;
      breaks: number[];
    };

export type PhotoLayoutRect = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ResolvedPhotoLayout = {
  width: number;
  height: number;
  rects: PhotoLayoutRect[];
};

type Relation = { a: number; b: number };
type Candidate = { node: LayoutNode; topology: string; score: number };

const clampRatio = (value: number) =>
  Number.isFinite(value) ? Math.min(12, Math.max(0.08, value)) : 1;

export function visiblePhotoRatios(ratios: number[]) {
  return ratios
    .slice(0, PHOTO_LAYOUT_VISIBLE_LIMIT)
    .map(clampRatio);
}

function relation(node: LayoutNode, ratios: number[], gap: number, cursor = { value: 0 }): Relation {
  if (node.kind === "leaf") {
    return { a: ratios[cursor.value++] ?? 1, b: 0 };
  }
  const first = relation(node.first, ratios, gap, cursor);
  const second = relation(node.second, ratios, gap, cursor);
  if (node.axis === "horizontal") {
    return { a: first.a + second.a, b: first.b + second.b + gap };
  }
  const denominator = 1 / first.a + 1 / second.a;
  return {
    a: 1 / denominator,
    b: (first.b / first.a + second.b / second.a - gap) / denominator,
  };
}

function nodeDepth(node: LayoutNode): number {
  return node.kind === "leaf"
    ? 1
    : 1 + Math.max(nodeDepth(node.first), nodeDepth(node.second));
}

function nodeLeafCount(node: LayoutNode): number {
  return node.kind === "leaf"
    ? 1
    : nodeLeafCount(node.first) + nodeLeafCount(node.second);
}

function encodeNode(node: LayoutNode): string {
  if (node.kind === "leaf") return "L";
  return `${node.axis === "horizontal" ? "H" : "V"}(${encodeNode(node.first)},${encodeNode(node.second)})`;
}

function decodeNode(topology: string): LayoutNode | null {
  let cursor = 0;
  function read(): LayoutNode | null {
    const token = topology[cursor++];
    if (token === "L") return { kind: "leaf" };
    if (token !== "H" && token !== "V") return null;
    if (topology[cursor++] !== "(") return null;
    const first = read();
    if (!first || topology[cursor++] !== ",") return null;
    const second = read();
    if (!second || topology[cursor++] !== ")") return null;
    return {
      kind: "split",
      axis: token === "H" ? "horizontal" : "vertical",
      first,
      second,
    };
  }
  const node = read();
  return node && cursor === topology.length ? node : null;
}

function layoutNode(
  node: LayoutNode,
  ratios: number[],
  gap: number,
  x: number,
  y: number,
  width: number,
  height: number,
  rects: PhotoLayoutRect[],
  cursor = { value: 0 },
) {
  if (node.kind === "leaf") {
    rects.push({
      index: cursor.value++,
      x,
      y,
      width: Math.max(1, width),
      height: Math.max(1, height),
    });
    return;
  }
  const firstCursor = { value: cursor.value };
  const firstRelation = relation(node.first, ratios, gap, firstCursor);
  if (node.axis === "horizontal") {
    const firstWidth = firstRelation.a * height + firstRelation.b;
    layoutNode(node.first, ratios, gap, x, y, firstWidth, height, rects, cursor);
    layoutNode(
      node.second,
      ratios,
      gap,
      x + firstWidth + gap,
      y,
      Math.max(1, width - firstWidth - gap),
      height,
      rects,
      cursor,
    );
    return;
  }
  const firstHeight = (width - firstRelation.b) / firstRelation.a;
  layoutNode(node.first, ratios, gap, x, y, width, firstHeight, rects, cursor);
  layoutNode(
    node.second,
    ratios,
    gap,
    x,
    y + firstHeight + gap,
    width,
    Math.max(1, height - firstHeight - gap),
    rects,
    cursor,
  );
}

function computeRecursive(node: LayoutNode, ratios: number[], width: number, gap: number) {
  const root = relation(node, ratios, gap);
  const height = Math.max(1, (width - root.b) / root.a);
  const rects: PhotoLayoutRect[] = [];
  layoutNode(node, ratios, gap, 0, 0, width, height, rects);
  return { width, height, rects };
}

function computeRows(breaks: number[], ratios: number[], width: number, gap: number) {
  const rects: PhotoLayoutRect[] = [];
  let start = 0;
  let y = 0;
  for (const end of breaks) {
    const row = ratios.slice(start, end);
    const rowHeight = Math.max(1, (width - gap * (row.length - 1)) / row.reduce((sum, ratio) => sum + ratio, 0));
    let x = 0;
    row.forEach((ratio, rowIndex) => {
      const itemWidth =
        rowIndex === row.length - 1 ? Math.max(1, width - x) : ratio * rowHeight;
      rects.push({
        index: start + rowIndex,
        x,
        y,
        width: itemWidth,
        height: rowHeight,
      });
      x += itemWidth + gap;
    });
    y += rowHeight + gap;
    start = end;
  }
  return { width, height: Math.max(1, y - gap), rects };
}

function layoutScore(layout: ResolvedPhotoLayout, width: number, depth: number) {
  const minSide = Math.min(...layout.rects.map((rect) => Math.min(rect.width, rect.height)));
  const areas = layout.rects.map((rect) => rect.width * rect.height);
  const meanArea = areas.reduce((sum, area) => sum + area, 0) / areas.length;
  const dispersion =
    areas.reduce((sum, area) => sum + Math.abs(Math.log(area / meanArea)), 0) /
    areas.length;
  const heightRatio = layout.height / width;
  const heightPenalty =
    heightRatio < 0.42
      ? (0.42 - heightRatio) * 5
      : heightRatio > 1.35
        ? (heightRatio - 1.35) * 3
        : 0;
  const smallPenalty = minSide < 54 ? (54 - minSide) / 18 : 0;
  return heightPenalty + smallPenalty + dispersion * 0.58 + Math.max(0, depth - 4) * 0.16;
}

function generateRecursiveCandidates(ratios: number[]) {
  const cache = new Map<string, Candidate[]>();
  function build(start: number, end: number): Candidate[] {
    const cacheKey = `${start}:${end}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    if (end - start === 1) {
      const leaf = { kind: "leaf" } as const;
      const result = [{ node: leaf, topology: "L", score: 0 }];
      cache.set(cacheKey, result);
      return result;
    }
    const candidates: Candidate[] = [];
    for (let split = start + 1; split < end; split += 1) {
      for (const first of build(start, split)) {
        for (const second of build(split, end)) {
          for (const axis of ["horizontal", "vertical"] as const) {
            const node: LayoutNode = { kind: "split", axis, first: first.node, second: second.node };
            const topology = encodeNode(node);
            const sample = computeRecursive(node, ratios.slice(start, end), 480, 8);
            candidates.push({
              node,
              topology,
              score: layoutScore(sample, 480, nodeDepth(node)),
            });
          }
        }
      }
    }
    const unique = [...new Map(candidates.map((candidate) => [candidate.topology, candidate])).values()]
      .sort((left, right) => left.score - right.score || left.topology.localeCompare(right.topology))
      .slice(0, 24);
    cache.set(cacheKey, unique);
    return unique;
  }
  return build(0, ratios.length);
}

function generateRowBreaks(count: number) {
  const results: number[][] = [];
  function visit(start: number, breaks: number[]) {
    if (start === count) {
      results.push(breaks);
      return;
    }
    for (let size = 1; size <= Math.min(4, count - start); size += 1) {
      visit(start + size, [...breaks, start + size]);
    }
  }
  visit(0, []);
  return results;
}

export function isPhotoLayoutSpecValid(
  spec: PhotoLayoutSpec | null | undefined,
  visibleCount: number,
) {
  if (
    !spec ||
    spec.version !== PHOTO_LAYOUT_VERSION ||
    spec.visibleCount !== visibleCount ||
    visibleCount < 1 ||
    visibleCount > PHOTO_LAYOUT_VISIBLE_LIMIT
  ) {
    return false;
  }
  if (spec.mode === "recursive") {
    const node = decodeNode(spec.topology);
    return Boolean(node && nodeLeafCount(node) === visibleCount);
  }
  return (
    spec.breaks.length > 0 &&
    spec.breaks.at(-1) === visibleCount &&
    spec.breaks.every((value, index) => value > (spec.breaks[index - 1] ?? 0))
  );
}

export function generatePhotoLayoutCandidates(inputRatios: number[]): PhotoLayoutSpec[] {
  const ratios = visiblePhotoRatios(inputRatios);
  if (!ratios.length) return [];
  if (ratios.length === 1) {
    return [{ version: PHOTO_LAYOUT_VERSION, mode: "recursive", visibleCount: 1, topology: "L" }];
  }
  const recursive = generateRecursiveCandidates(ratios).map((candidate) => ({
    spec: {
      version: PHOTO_LAYOUT_VERSION,
      mode: "recursive",
      visibleCount: ratios.length,
      topology: candidate.topology,
    } as PhotoLayoutSpec,
    score: candidate.score,
  }));
  const rows = generateRowBreaks(ratios.length).map((breaks) => {
    const layout = computeRows(breaks, ratios, 480, 8);
    return {
      spec: {
        version: PHOTO_LAYOUT_VERSION,
        mode: "rows",
        visibleCount: ratios.length,
        breaks,
      } as PhotoLayoutSpec,
      score: layoutScore(layout, 480, breaks.length + 1) + 0.12,
    };
  });
  const sorted = [...recursive, ...rows].sort((left, right) => left.score - right.score);
  const selected: PhotoLayoutSpec[] = [];
  for (const candidate of sorted) {
    const key =
      candidate.spec.mode === "recursive"
        ? candidate.spec.topology.slice(0, 3)
        : `rows:${candidate.spec.breaks.length}`;
    const distinct = selected.every((spec) => {
      const existingKey =
        spec.mode === "recursive" ? spec.topology.slice(0, 3) : `rows:${spec.breaks.length}`;
      return existingKey !== key;
    });
    if (distinct || selected.length === 0) selected.push(candidate.spec);
    if (selected.length === 3) break;
  }
  return selected.length ? selected : [sorted[0].spec];
}

export function createPhotoLayoutOptions(
  inputRatios: number[],
  preferred?: PhotoLayoutSpec | null,
) {
  const normalized = normalizePhotoLayout(preferred, inputRatios);
  if (!normalized) return [];
  const normalizedKey = JSON.stringify(normalized);
  return [
    normalized,
    ...generatePhotoLayoutCandidates(inputRatios).filter(
      (candidate) => JSON.stringify(candidate) !== normalizedKey,
    ),
  ].slice(0, 3);
}

export function normalizePhotoLayout(
  spec: PhotoLayoutSpec | null | undefined,
  inputRatios: number[],
) {
  const ratios = visiblePhotoRatios(inputRatios);
  if (!ratios.length) return null;
  return isPhotoLayoutSpecValid(spec, ratios.length)
    ? spec!
    : generatePhotoLayoutCandidates(ratios)[0];
}

export function computePhotoLayout(
  spec: PhotoLayoutSpec,
  inputRatios: number[],
  width: number,
  gap = 8,
): ResolvedPhotoLayout {
  const ratios = visiblePhotoRatios(inputRatios);
  const safeWidth = Math.max(1, width);
  const normalized = normalizePhotoLayout(spec, ratios);
  if (!normalized) return { width: safeWidth, height: 0, rects: [] };
  if (normalized.mode === "rows") {
    return computeRows(normalized.breaks, ratios, safeWidth, gap);
  }
  const node = decodeNode(normalized.topology);
  return node
    ? computeRecursive(node, ratios, safeWidth, gap)
    : computeRows([ratios.length], ratios, safeWidth, gap);
}
