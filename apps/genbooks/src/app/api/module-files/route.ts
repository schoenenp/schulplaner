import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

import { createGrayscaleVariant } from "@/util/pdf/grayscale-variant";
import { env } from "@/env";
import { auth } from "@/server/auth";
import { Naming } from "@/util/naming";
import { handleBookPart } from "@/util/book/functions";
import { createCustomCoverPdf } from "@/util/pdf/custom-cover";
import { validatePDFUpload } from "@/util/pdf/functions";
import { uploadData, type FileItem } from "@/util/upload/functions";
import {
  MAX_UPLOAD_FILE_BYTES,
  uploadLimitMessage,
} from "@/util/upload/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadRole = "file" | "thumbnail" | "grayscale";
type UploadItem = {
  role: UploadRole;
  data: Buffer;
  name: string;
};

const COVER_TYPE = "umschlag";
const CUSTOM_COVER_FILE_PREFIX = "file_custom_cover_";
const CUSTOM_COVER_THUMB_PREFIX = "thumb_custom_cover_";

function getFormFile(formData: FormData, key: UploadRole): File | undefined {
  const value = formData.get(key);
  return value instanceof File ? value : undefined;
}

async function toUploadItem(file: File, role: UploadRole): Promise<UploadItem> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const baseName = Naming.file(getUploadExtension(file));
  return {
    role,
    data: buffer,
    name: role === "thumbnail" ? `thumb_${baseName}` : baseName,
  };
}

function isCoverType(type: FormDataEntryValue | null): boolean {
  return typeof type === "string" && type.toLowerCase() === COVER_TYPE;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function getUploadExtension(file: File): string {
  switch (file.type) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      if (file.type.includes("jpeg") || file.type.includes("jpg")) {
        return "jpg";
      }
      return "pdf";
  }
}

async function getCustomCoverTemplateBytes(): Promise<Uint8Array> {
  if (!env.CUSTOM_COVER_TEMPLATE_URL) {
    throw new Error(
      "Missing CUSTOM_COVER_TEMPLATE_URL for image-based cover modules",
    );
  }

  const response = await fetch(env.CUSTOM_COVER_TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch custom cover template: ${response.status}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function createCustomCoverUploadItems(file: File): Promise<UploadItem[]> {
  const imageBuffer = Buffer.from(await file.arrayBuffer());
  const coverPdfBytes = await createCustomCoverPdf(
    await getCustomCoverTemplateBytes(),
    imageBuffer,
  );

  return [
    {
      role: "file",
      data: Buffer.from(coverPdfBytes),
      name: `${CUSTOM_COVER_FILE_PREFIX}${Naming.file("pdf")}`,
    },
    {
      role: "thumbnail",
      data: imageBuffer,
      name: `${CUSTOM_COVER_THUMB_PREFIX}${Naming.file(getUploadExtension(file))}`,
    },
  ];
}

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const type = formData.get("type");
  const file = getFormFile(formData, "file");
  const thumbnail = getFormFile(formData, "thumbnail");

  if (!file && !thumbnail) {
    return NextResponse.json({ message: "No files provided" }, { status: 400 });
  }

  for (const provided of [file, thumbnail]) {
    if (provided && provided.size > MAX_UPLOAD_FILE_BYTES) {
      return NextResponse.json(
        { message: uploadLimitMessage(provided.name) },
        { status: 413 },
      );
    }
  }

  const isImageBasedCover = Boolean(
    file && isCoverType(type) && isImageFile(file),
  );

  let uploadItems: UploadItem[];
  try {
    uploadItems = isImageBasedCover
      ? await createCustomCoverUploadItems(file!)
      : await Promise.all(
          (
            [
              file ? toUploadItem(file, "file") : undefined,
              thumbnail ? toUploadItem(thumbnail, "thumbnail") : undefined,
            ] as const
          ).filter((item) => item !== undefined),
        );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to prepare upload",
      },
      { status: 400 },
    );
  }

  const bookPart = handleBookPart(typeof type === "string" ? type : "");
  let filePageCount: number | undefined;

  if (file && !isImageBasedCover) {
    const fileItem = uploadItems.find((item) => item.role === "file");
    const { valid, message, pageCount } = await validatePDFUpload(
      fileItem?.data ?? Buffer.from(await file.arrayBuffer()),
      bookPart,
    );

    if (!valid) {
      return NextResponse.json(
        { message: message ?? "Invalid PDF upload" },
        { status: 400 },
      );
    }
    filePageCount = pageCount;
  } else if (isImageBasedCover) {
    // The generated cover PDF was not validated above; count it directly so
    // the stored page count stays complete. Missing counts only cost a
    // fallback download during price estimation, so failures are tolerable.
    const fileItem = uploadItems.find((item) => item.role === "file");
    if (fileItem) {
      try {
        const coverDoc = await PDFDocument.load(new Uint8Array(fileItem.data));
        filePageCount = coverDoc.getPageCount();
      } catch {
        filePageCount = undefined;
      }
    }
  }

  // Print-quality grayscale variant, converted once at upload so book
  // generation can skip the grayscale API entirely. Cover modules are
  // re-filled with text at generation time and bindings carry no pages, so
  // only content modules get a stored variant.
  const wantsGrayscaleVariant =
    Boolean(file) &&
    !isImageBasedCover &&
    (bookPart === "DEFAULT" || bookPart === "PLANNER");
  if (wantsGrayscaleVariant) {
    const fileItem = uploadItems.find((item) => item.role === "file");
    if (fileItem) {
      const grayscaleBytes = await createGrayscaleVariant(
        new Uint8Array(fileItem.data),
      );
      if (grayscaleBytes) {
        uploadItems.push({
          role: "grayscale",
          data: Buffer.from(grayscaleBytes),
          name: `gray_${fileItem.name}`,
        });
      }
    }
  }

  try {
    const uploadedFiles = await uploadData(uploadItems);
    const response: { file?: FileItem; thumbnail?: FileItem } = {};
    let grayscaleSrc: string | undefined;

    uploadItems.forEach((item, index) => {
      const uploaded = uploadedFiles[index];
      if (!uploaded) return;
      if (item.role === "file") {
        response.file =
          filePageCount !== undefined
            ? { ...uploaded, pageCount: filePageCount }
            : uploaded;
      } else if (item.role === "grayscale") {
        grayscaleSrc = uploaded.src;
      } else {
        response.thumbnail = uploaded;
      }
    });

    if (response.file && grayscaleSrc) {
      response.file = { ...response.file, srcGrayscale: grayscaleSrc };
    }

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message: `File upload failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 },
    );
  }
}
