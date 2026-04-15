import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, JwtPayload } from "../../common/decorators/current-user.decorator";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";

@ApiTags("Users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll(@CurrentUser() caller: JwtPayload) {
    return this.usersService.findAll(caller);
  }

  @Get(":id")
  findOne(@CurrentUser() caller: JwtPayload, @Param("id") id: string) {
    return this.usersService.findOne(caller, id);
  }

  @Post()
  create(@CurrentUser() caller: JwtPayload, @Body() dto: CreateUserDto) {
    return this.usersService.create(caller, dto);
  }

  @Patch(":id")
  update(@CurrentUser() caller: JwtPayload, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(caller, id, dto);
  }

  @Patch(":id/password")
  changePassword(
    @CurrentUser() caller: JwtPayload,
    @Param("id") id: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(caller, id, dto.password);
  }

  @Delete(":id")
  remove(@CurrentUser() caller: JwtPayload, @Param("id") id: string) {
    return this.usersService.softDelete(caller, id);
  }
}
