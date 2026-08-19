export interface FileInfo {
  is_dir: boolean;
  path: string;
}

export interface BackendProtocol {
  edit(
    filePath: string,
    oldString: string,
    newString: string,
  ): Promise<{ error?: string }>;
  ls(directoryPath: string): Promise<{ error?: string; files?: FileInfo[] }>;
  readRaw(filePath: string): Promise<{
    data?: { content?: string | string[] | Uint8Array };
    error?: string;
  }>;
  write(filePath: string, content: string): Promise<{ error?: string }>;
}
