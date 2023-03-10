import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Req,
  Res,
  UnauthorizedException
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { Request, Response } from 'express'
import { Roles } from 'src/common/decorators/roles.decorator'
import { AuthService } from './auth.service'
import {
  AUTH_TYPE,
  REFRESH_TOKEN_COOKIE_OPTIONS
} from './constants/jwt.constants'
import { Public } from './decorators/public.decorator'
import { AuthenticatedRequest } from './interfaces/authenticated-request.interface'
import { JwtTokens } from './interfaces/jwt.interface'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  setJwtResponse = (res: Response, jwtTokens: JwtTokens) => {
    res.setHeader('authorization', `${AUTH_TYPE} ${jwtTokens.accessToken}`)
    res.cookie(
      'refresh_token',
      jwtTokens.refreshToken,
      REFRESH_TOKEN_COOKIE_OPTIONS
    )
  }

  @Public()
  @Get('login')
  getLoginPage(@Res() res: Response) {
    const oauth2URL: string = this.authService.getOAuth2URL()
    return res.render('pages/auth/login', { oauth2URL })
  }

  @Public()
  @Post('login/callback')
  async login(
    @Body('code') code: string,
    @Res({ passthrough: true }) res: Response
  ) {
    try {
      const token: JwtTokens = await this.authService.loginOrRegister(code)
      this.setJwtResponse(res, token)
    } catch (error) {
      console.log(error)
      throw new HttpException('로그인 실패', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Public()
  @Get('reissue')
  async reIssueJwtTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = req.cookies['refresh_token']
    if (!refreshToken) throw new UnauthorizedException('Invalid Token')
    try {
      const newJwtTokens: JwtTokens = await this.authService.updateJwtTokens(
        refreshToken
      )
      this.setJwtResponse(res, newJwtTokens)
      return
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }
      throw new UnauthorizedException(error.message)
    }
  }

  @Post('logout')
  @Roles(Role.Newbie)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    try {
      await this.authService.deleteRefreshToken(req.user.userKey)
      res.clearCookie('refresh_token', REFRESH_TOKEN_COOKIE_OPTIONS)
      return
    } catch (error) {
      throw new InternalServerErrorException()
    }
  }

  @Get('role')
  @Roles(Role.Newbie)
  async getRole(@Req() req: AuthenticatedRequest) {
    return { role: req.user.role }
  }

  // only used for thunder-client test
  @Public()
  @Post('fake/login')
  async fakeLogin(
    @Body('userKey') userKey: string,
    @Body('secret') secret: string,
    @Res({ passthrough: true }) res: Response
  ) {
    try {
      const token: JwtTokens = await this.authService.fakeLogin(userKey, secret)
      this.setJwtResponse(res, token)
    } catch (error) {
      throw new HttpException(
        '[TEST] 로그인 실패',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
