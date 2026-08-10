import { IsString, Matches } from 'class-validator';

export class SeasonalHomeQueryDto {
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'admin_code must be a 6-digit administrative code',
  })
  admin_code!: string;
}
