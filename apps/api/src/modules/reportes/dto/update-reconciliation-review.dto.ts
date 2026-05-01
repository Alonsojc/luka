import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateReconciliationReviewDto {
  @IsIn(["OPEN", "REVIEWED", "RESOLVED", "IGNORED"])
  reviewStatus: "OPEN" | "REVIEWED" | "RESOLVED" | "IGNORED";

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsString()
  issueArea?: string;

  @IsOptional()
  @IsString()
  issueType?: string;

  @IsOptional()
  @IsString()
  issueStatus?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  productSku?: string;
}
