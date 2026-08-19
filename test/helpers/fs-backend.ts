import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BackendProtocol } from "../../src/agent/backend-protocol.ts";

export class TestFilesystemBackend implements BackendProtocol {
  constructor(readonly rootDir: string) {}

  async edit(filePath: string, oldString: string, newString: string) {
    const target = this.resolve(filePath);
    const content = await readFile(target, "utf8");
    if (!content.includes(oldString)) return { error: "text not found" };
    await writeFile(target, content.replace(oldString, newString), "utf8");
    return {};
  }

  async ls(directoryPath: string) {
    try {
      const entries = await readdir(this.resolve(directoryPath), {
        withFileTypes: true,
      });
      return {
        files: entries.map((entry) => ({
          is_dir: entry.isDirectory(),
          path: path.posix.join(directoryPath, entry.name),
        })),
      };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async readRaw(filePath: string) {
    try {
      return { data: { content: await readFile(this.resolve(filePath), "utf8") } };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async write(filePath: string, content: string) {
    const target = this.resolve(filePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    return {};
  }

  private resolve(filePath: string): string {
    return path.join(this.rootDir, filePath.replace(/^\/+/, ""));
  }
}
