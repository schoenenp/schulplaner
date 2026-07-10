import { PDFDocument } from "pdf-lib";
import { getA4WithBleeding } from "pdf-pipeline";

const COVER_IMAGE_FIELD_NAMES = [
  "COVER_IMAGE",
  "CUSTOM_IMAGE",
  "IMAGE",
] as const;

export async function createCustomCoverPdf(
  templateBytes: Uint8Array,
  imageBytes: Uint8Array,
): Promise<Uint8Array> {
  const coverDoc = await PDFDocument.load(templateBytes);
  const buttonField = findCoverImageButton(coverDoc);
  const embeddedImage = await embedCoverImage(coverDoc, imageBytes);

  if (buttonField) {
    buttonField.setImage(embeddedImage);
  } else {
    drawImageOnFirstPage(coverDoc, embeddedImage);
  }

  normalizeCoverPageCount(coverDoc);

  if (coverDoc.getPageCount() !== 4) {
    throw new Error("Cover module must have exactly 4 pages");
  }

  return coverDoc.save();
}

function drawImageOnFirstPage(
  coverDoc: PDFDocument,
  embeddedImage: Awaited<ReturnType<typeof embedCoverImage>>,
): void {
  const firstPage = coverDoc.getPage(0);
  const pageWidth = firstPage.getWidth();
  const pageHeight = firstPage.getHeight();
  const imageWidth = embeddedImage.width;
  const imageHeight = embeddedImage.height;
  const scale = Math.max(pageWidth / imageWidth, pageHeight / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;

  firstPage.drawImage(embeddedImage, {
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
}

function normalizeCoverPageCount(coverDoc: PDFDocument): void {
  const pageCount = coverDoc.getPageCount();

  for (let i = pageCount - 1; i >= 4; i--) {
    coverDoc.removePage(i);
  }

  const { width, height } = getA4WithBleeding();

  for (let i = coverDoc.getPageCount(); i < 4; i++) {
    coverDoc.addPage([width, height]);
  }
}

function findCoverImageButton(coverDoc: PDFDocument) {
  const form = coverDoc.getForm();

  for (const fieldName of COVER_IMAGE_FIELD_NAMES) {
    try {
      return form.getButton(fieldName);
    } catch {
      continue;
    }
  }

  return null;
}

async function embedCoverImage(coverDoc: PDFDocument, imageBytes: Uint8Array) {
  const signature = Array.from(imageBytes.subarray(0, 8))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (signature.startsWith("89504e47")) {
    return coverDoc.embedPng(imageBytes);
  }

  if (signature.startsWith("ffd8ff")) {
    return coverDoc.embedJpg(imageBytes);
  }

  throw new Error(
    "Unsupported custom cover image format. Use PNG or JPEG for cover uploads.",
  );
}
