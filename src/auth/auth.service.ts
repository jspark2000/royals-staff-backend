import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import axios from 'axios';
import { AccessToken } from './interfaces/accessToken.interface';
import { UserProfile } from './interfaces/userProfile.interface';
import { BandList } from './interfaces/bandList.interface';
import { BandUser, TeamRole } from '@prisma/client';
import { SessionInfo } from './interfaces/sessionInfo.interface';
import { BandUserDTO } from './dto/bandUser.dto';
import { AccountUpdateReqeustDTO } from './dto/accountUpdateRequest.dto';

@Injectable()
export class AuthService {
  private readonly getAuthCodeURL = 'https://auth.band.us/oauth2/authorize';
  private readonly getTokenURL = 'https://auth.band.us/oauth2/token';
  private readonly getUserProfileURL = 'https://openapi.band.us/v2/profile';
  private readonly getBandListURL = 'https://openapi.band.us/v2.1/bands';

  constructor(private readonly prismaService: PrismaService) {}

  getOAuth2URL(): string {
    return `${this.getAuthCodeURL}?response_type=code&client_id=${process.env.CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URL}`;
  }

  async getBandUserList(): Promise<BandUserDTO[]> {
    const bandUserList = await this.prismaService.bandUser.findMany({
      select: {
        userKey: true,
        userNickname: true,
        profileUrl: true,
        role: true,
        teamRole: true,
      },
    });

    return bandUserList;
  }

  async deleteBandUser(userKey: string): Promise<{ userNickname: string }> {
    const adminCheck = await this.prismaService.bandUser.findUnique({
      where: {
        userKey,
      },
      select: {
        role: true,
      },
    });

    if (adminCheck.role === 'admin' || adminCheck.role === 'superAdmin') {
      throw new HttpException(
        'admin 이상 권한을 포함하는 변경은 superAdmin 전용 메뉴에서 가능합니다.',
        HttpStatus.FORBIDDEN,
      );
    }

    const deleteResult = await this.prismaService.bandUser.delete({
      where: {
        userKey,
      },
      select: {
        userNickname: true,
      },
    });

    return deleteResult;
  }

  async updateBandUserRole(
    accountDTO: AccountUpdateReqeustDTO,
  ): Promise<{ userNickname: string }> {
    const adminCheck = await this.prismaService.bandUser.findUnique({
      where: {
        userKey: accountDTO.userKey,
      },
      select: {
        role: true,
      },
    });

    if (adminCheck.role === 'admin' || adminCheck.role === 'superAdmin') {
      throw new HttpException(
        'admin 이상 권한을 포함하는 변경은 superAdmin 전용 메뉴에서 가능합니다.',
        HttpStatus.FORBIDDEN,
      );
    }

    const updateResult = await this.prismaService.bandUser.update({
      where: {
        userKey: accountDTO.userKey,
      },
      data: {
        role: accountDTO.role,
        teamRole: TeamRole[accountDTO.teamRole],
      },
      select: {
        userNickname: true,
      },
    });

    if (!updateResult) {
      throw new HttpException(
        '업데이트에 실패했습니다.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return updateResult;
  }

  async loginOrRegister(code: string): Promise<SessionInfo> {
    const token = await this.getAccessToken(code);
    const userProfile = await this.getUserProfile(token);
    const isWhiteList = await this.checkWhiteList(token);
    if (!isWhiteList) {
      throw new HttpException(
        '성균관대 미식축구부 밴드에 가입되어있지 않습니다.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const isRegistered = await this.checkRegistration(userProfile);
    if (!isRegistered) {
      const registerResult = await this.registerUser(userProfile);
      if (!registerResult) {
        throw new HttpException('DB 오류', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }

    const { role, profileUrl, userNickname, teamRole } =
      await this.prismaService.bandUser.findUnique({
        where: {
          userKey: userProfile.result_data.user_key,
        },
        select: {
          role: true,
          profileUrl: true,
          userNickname: true,
          teamRole: true,
        },
      });

    return {
      authed: true,
      key: userProfile.result_data.user_key,
      userInfo: {
        userNickname,
        profileUrl,
        role,
        teamRole,
      },
    };
  }

  private async getAccessToken(code: string): Promise<AccessToken> {
    const accessTokenURL =
      this.getTokenURL + '?grant_type=authorization_code' + '&code=' + code;
    const Authorization =
      'Basic ' + btoa(process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET);
    const headers = {
      Authorization,
    };
    const token: AccessToken = await axios({
      method: 'get',
      url: accessTokenURL,
      headers,
    }).then((response) => {
      return response.data;
    });

    return token;
  }

  private async getUserProfile(token: AccessToken): Promise<UserProfile> {
    const profileURL =
      this.getUserProfileURL + '?access_token=' + token.access_token;

    const userProfile: UserProfile = await axios({
      method: 'get',
      url: profileURL,
    }).then((response) => {
      return response.data;
    });

    if (userProfile.result_data.profile_image_url === '')
      userProfile.result_data.profile_image_url =
        'https://ssl.pstatic.net/cmstatic/webclient/dres/20230116112132/images/template/profile_60x60.png';

    return userProfile;
  }

  private async checkWhiteList(token: AccessToken): Promise<boolean> {
    const bandListURL =
      this.getBandListURL + '?access_token=' + token.access_token;

    const bandList: BandList = await axios({
      method: 'get',
      url: bandListURL,
    }).then((response) => {
      return response.data;
    });

    const bandExist = bandList.result_data.bands.filter(
      (value) => value.band_key === process.env.ROYALS_BAND_KEY,
    );

    if (bandExist.length !== 0) {
      return true;
    } else {
      return false;
    }
  }

  private async checkRegistration(userProfile: UserProfile): Promise<boolean> {
    const userKey = userProfile.result_data.user_key;
    const isRegistered: BandUser = await this.prismaService.bandUser.findUnique(
      {
        where: {
          userKey,
        },
      },
    );

    return isRegistered ? true : false;
  }

  private async registerUser(
    userProfile: UserProfile,
  ): Promise<{ userNickname: string; role: string }> {
    const registerationResult = await this.prismaService.bandUser.create({
      data: {
        userKey: userProfile.result_data.user_key,
        userNickname: userProfile.result_data.name,
        profileUrl:
          userProfile.result_data.profile_image_url ??
          'https://coresos-phinf.pstatic.net/a/30f048/3_2h2Ud018svcxyrfbhxl9z38_2u6v6s.jpg?type=s75',
      },
      select: {
        userNickname: true,
        role: true,
      },
    });

    return registerationResult;
  }
}
