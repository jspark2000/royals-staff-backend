import { Controller, Get, Param, Req } from '@nestjs/common';
import { AuthenticatedRequest } from 'src/auth/interfaces/authenticated-request.interface';
import { BandService } from './band.service';

@Controller('band')
export class BandController {
  constructor(private readonly bandService: BandService) {}

  @Get('user/list')
  async getBandUserList() {
    return await this.bandService.getBandUserList();
  }

  @Get('profile')
  async getMyProfile(@Req() req: AuthenticatedRequest) {
    return await this.bandService.getBandProfile(req.user.userKey);
  }

  @Get('profile/:userKey')
  async getProfile(@Param('userKey') userKey: string) {
    return await this.bandService.getBandProfile(userKey);
  }
}