import "server-only";

import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { privateDataRoot } from "@/lib/private-data-root";

function storedPath(storageKey: string) {
  return path.join(privateDataRoot(), "uploads", storageKey);
}

export function readStoredFile(storageKey: string) {
  return readFile(
    /* turbopackIgnore: true */ storedPath(storageKey),
  );
}

export async function deleteStoredFile(storageKey: string) {
  await rm(
    /* turbopackIgnore: true */ storedPath(storageKey),
    { force: true },
  );
}
