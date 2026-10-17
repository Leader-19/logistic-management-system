import { resolve } from "node:path";

/** Use a path anchored to the backend package, independent of process.cwd(). */
export function storagePath(...segments: string[]): string {
  return resolve(__dirname, "../../storage", ...segments);
}