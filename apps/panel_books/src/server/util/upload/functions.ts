import "server-only";
import { uploadStorageFiles } from "books-storage";

export interface FileItem {
  name: string;
  src: string;
  type: FileType;
  size: number;
  /** PDF page count captured at upload; absent for images. */
  pageCount?: number;
  /** CDN src of the print-quality grayscale variant, when one was created. */
  srcGrayscale?: string;
}

type FileType = "PDF" | "IMAGE_PNG" | "IMAGE_JPEG";

export async function uploadData(files: { data: Buffer; name: string }[]): Promise<FileItem[]> {
  return uploadStorageFiles(files);
}
