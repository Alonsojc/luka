import { Controller, Post, UseGuards, UseInterceptors, UploadedFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { SkipAudit } from "../../common/decorators/skip-audit.decorator";
import { UploadsService } from "./uploads.service";

@ApiTags("Uploads")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@SkipAudit()
@Controller("uploads")
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post("document")
  @UseInterceptors(FileInterceptor("file"))
  uploadDocument(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.saveDocument(file);
  }

  @Post("image")
  @UseInterceptors(FileInterceptor("file"))
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.saveImage(file);
  }
}
