import { Injectable, BadRequestException } from "@nestjs/common";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { extname } from "path";

// Must match the static-assets path in main.ts: join(__dirname, '..', 'uploads')
// main.ts __dirname = dist/, so it serves from <project>/uploads/
// This file compiles to dist/modules/uploads/, so we go up 3 levels to <project>/
const UPLOADS_ROOT = join(__dirname, "..", "..", "..", "uploads");

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_DOC_MIMES = new Set([
  "application/pdf",
  "application/xml",
  "text/xml",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_DOC_EXTS = new Set([".pdf", ".xml", ".jpg", ".jpeg", ".png", ".webp"]);

@Injectable()
export class UploadsService {
  async saveDocument(file: Express.Multer.File) {
    this.validateFile(file, ALLOWED_DOC_MIMES, ALLOWED_DOC_EXTS);

    const dir = join(UPLOADS_ROOT, "documents");
    await mkdir(dir, { recursive: true });

    const ext = this.safeExtension(file.originalname, ALLOWED_DOC_EXTS);
    const uniqueName = `${randomUUID()}${ext}`;
    await writeFile(join(dir, uniqueName), file.buffer);

    return {
      filename: file.originalname,
      url: `/uploads/documents/${uniqueName}`,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
  }

  async saveImage(file: Express.Multer.File) {
    this.validateFile(file, ALLOWED_IMAGE_MIMES, ALLOWED_IMAGE_EXTS);

    const dir = join(UPLOADS_ROOT, "images");
    await mkdir(dir, { recursive: true });

    const ext = this.safeExtension(file.originalname, ALLOWED_IMAGE_EXTS);
    const uniqueName = `${randomUUID()}${ext}`;
    await writeFile(join(dir, uniqueName), file.buffer);

    return {
      url: `/uploads/images/${uniqueName}`,
    };
  }

  private validateFile(
    file: Express.Multer.File,
    allowedMimes: Set<string>,
    allowedExts: Set<string>,
  ) {
    if (!file) {
      throw new BadRequestException("No file provided");
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException("File exceeds 5 MB limit");
    }
    if (!allowedMimes.has(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`);
    }
    const ext = extname(file.originalname).toLowerCase();
    if (!allowedExts.has(ext)) {
      throw new BadRequestException(`File extension ${ext} is not allowed`);
    }
  }

  /** Return a safe extension from the allowlist, falling back to the first allowed ext. */
  private safeExtension(originalname: string, allowedExts: Set<string>): string {
    const ext = extname(originalname).toLowerCase();
    if (allowedExts.has(ext)) return ext;
    return allowedExts.values().next().value!;
  }
}
