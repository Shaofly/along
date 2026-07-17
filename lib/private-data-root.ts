import path from "node:path";

export function privateDataRoot() {
  return path.resolve(
    /* turbopackIgnore: true */ process.env.PRIVATE_DATA_ROOT ?? ".data",
  );
}
