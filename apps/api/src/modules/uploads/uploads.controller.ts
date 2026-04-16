import { Controller, Post, UseGuards, UseInterceptors, UploadedFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { SkipAudit } from "../../common/decorators/skip-audit.decorator";
import { SkipCsrf } from "../../common/decorators/skip-csrf.decorator";
import { UploadsService, MAX_FILE_SIZE } from "./uploads.service";

@ApiTags("Uploads")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@SkipAudit()
@SkipCsrf() // Frontend uploads use raw FormData fetch without the api client's CSRF header
@Controller("uploads")
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post("document")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE_SIZE } }))
  uploadDocument(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.saveDocument(file);
  }

  @Post("image")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE_SIZE } }))
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.saveImage(file);
  }
}
