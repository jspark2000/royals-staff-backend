import { Type } from 'class-transformer'
import { IsDate, IsNumber, IsString } from 'class-validator'

export class RegisterAttendanceRequestDTO {
  @IsString()
  columnNames: string

  @IsString()
  attendances: string

  @IsNumber()
  @Type(() => Number)
  attendances_len: number

  @IsDate()
  @Type(() => Date)
  createdAt: Date

  @IsString()
  sheetName: string
}
