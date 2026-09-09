import { readFileSync, type PathOrFileDescriptor } from "node:fs";

export function readWithUnixLineEndings(source: PathOrFileDescriptor): string {
  return readFileSync(source, "utf8").replace(/\r\n/g, "\n");
}
