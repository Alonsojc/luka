import { Injectable, BadRequestException } from "@nestjs/common";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { extname } from "path";

const UPLOADS_ROOT = join(__dirname, "..", "..", "uploads");

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/xml",
  "text/xml",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class UploadsService {
  async saveDocument(file: Express.Multer.File) {
    this.validateFile(file, ALLOWED_DOC_TYPES);

    const dir = join(UPLOADS_ROOT, "documents");
    await mkdir(dir, { recursive: true });

    const uniqueName = `${randomUUID()}${extname(file.originalname)}`;
    await writeFile(join(dir, uniqueName), file.buffer);

    return {
      filename: file.originalname,
      url: `/uploads/documents/${uniqueName}`,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
  }

  async saveImage(file: Express.Multer.File) {
    this.validateFile(file, ALLOWED_IMAGE_TYPES);

    const dir = join(UPLOADS_ROOT, "images");
    await mkdir(dir, { recursive: true });

    const uniqueName = `${randomUUID()}${extname(file.originalname)}`;
    await writeFile(join(dir, uniqueName), file.buffer);

    return {
      url: `/uploads/images/${uniqueName}`,
    };
  }

  private validateFile(file: Express.Multer.File, allowedTypes: string[]) {
    if (!file) {
      throw new BadRequestException("No file provided");
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException("File exceeds 5 MB limit");
    }
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`);
    }
  }
}
