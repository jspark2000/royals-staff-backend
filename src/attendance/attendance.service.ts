import {
  HttpException,
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GoogleSheet, Location } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AttendanceCheckDTO } from './dto/attendanceCheck.dto';
import { AttendanceDateDTO } from './dto/attendanceDate.dto';
import { AttendanceDeleteDTO } from './dto/attendanceDelete.dto';
import { attendanceRegisterDTO } from './dto/attendanceRegister.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prismaService: PrismaService) {}

  async getAttendanceDateList() {
    const result = await this.prismaService.attendance.findMany({
      select: {
        date: true,
        isGame: true,
      },
      orderBy: {
        date: 'desc',
      },
      take: 10,
      distinct: ['date'],
    });

    if (result.length === 0) {
      throw new HttpException(
        '불러올 출석 명단이 없습니다.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return result;
  }

  async getAttendances(attendanceDTO: AttendanceDateDTO) {
    const attendances = await this.prismaService.attendance.findMany({
      where: {
        date: attendanceDTO.date,
      },
      select: {
        id: true,
        date: true,
        location: true,
        survey: true,
        late: true,
        reason: true,
        checked: true,
        People: {
          select: {
            name: true,
            studentNo: true,
            offPosition: true,
            defPosition: true,
          },
        },
      },
      orderBy: [
        {
          People: {
            studentNo: 'asc',
          },
        },
        {
          People: {
            name: 'asc',
          },
        },
      ],
    });

    if (attendances.length === 0) {
      throw new HttpException(
        '해당하는 날짜의 출석 정보가 없습니다.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return attendances.map((attendance) => {
      return {
        id: attendance.id,
        date: attendance.date,
        location: attendance.location,
        survey: attendance.survey,
        late: attendance.late,
        checked: attendance.checked,
        reason: attendance.reason,
        name: attendance.People.name,
        studentNo: attendance.People.studentNo,
        offPosition: attendance.People.offPosition,
        defPosition: attendance.People.defPosition,
      };
    });
  }

  async getGoogleSheetList(): Promise<GoogleSheet[]> {
    const googleSheetList = await this.prismaService.googleSheet.findMany({
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (googleSheetList.length === 0) {
      throw new UnprocessableEntityException(
        '불러올 GoogleSheet 정보가 없습니다.',
      );
    }

    return googleSheetList;
  }

  async registerAttendances(
    attendanceDTO: attendanceRegisterDTO[],
  ): Promise<{ count: number }> {
    attendanceDTO.forEach(
      (attendance) => (attendance.date = new Date(attendance.date)),
    );
    let count = 0;

    for (let i = 0; i < attendanceDTO.length; i++) {
      const attendance = attendanceDTO[i];
      const uid = await this.prismaService.people.findUnique({
        where: {
          name_studentNo: {
            name: attendance.name,
            studentNo: attendance.studentNo,
          },
        },
        select: {
          uid: true,
        },
      });

      if (uid) {
        const result = await this.prismaService.attendance.upsert({
          where: {
            uid_date: {
              uid: uid.uid,
              date: attendance.date,
            },
          },
          create: {
            People: {
              connect: {
                uid: uid.uid,
              },
            },
            date: attendance.date,
            location: Location[attendance.location],
            survey: attendance.survey,
            late: attendance.late,
            checked: false,
            reason: attendance.reason,
          },
          update: {
            survey: attendance.survey,
            late: attendance.late,
            checked: false,
          },
        });

        if (result) {
          count++;
        }
      }
    }
    return { count };
  }

  async checkAttendance(attendanceDTO: AttendanceCheckDTO) {
    const result = await this.prismaService.attendance.update({
      where: {
        id: attendanceDTO.id,
      },
      data: {
        location: Location[attendanceDTO.location],
        survey: attendanceDTO.survey,
        late: attendanceDTO.late,
        checked: attendanceDTO.checked,
      },
      select: {
        id: true,
      },
    });

    if (!result) {
      throw new UnprocessableEntityException(
        '해당 출석 정보가 존재하지 않습니다.',
      );
    }

    return result;
  }

  async deleteAttendances(
    attendanceDTO: AttendanceDeleteDTO,
  ): Promise<{ count: number }> {
    const result = await this.prismaService.attendance.deleteMany({
      where: {
        date: attendanceDTO.date,
      },
    });

    return result;
  }
}
