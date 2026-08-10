import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsResourceId } from '../../http/dto/shared.dto';

export class UpsertTerraceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @IsResourceId()
  cityCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'regionAdminCode must be a 6-digit administrative code',
  })
  regionAdminCode?: string;

  @IsOptional()
  @IsBoolean()
  needsDistrictConfirmation?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'SHORT', 'MEDIUM', 'LONG', 'UNKNOWN', 'UNSURE'])
  sunExposureLevel?: string;

  @IsOptional()
  @IsString()
  @IsIn(['south', 'east', 'west', 'north', 'unknown'])
  sunOrientationRaw?: string;

  @IsOptional()
  @IsString()
  @IsIn(['morning', 'afternoon', 'allday', 'rarely', 'unknown'])
  sunTimeObsRaw?: string;

  @IsOptional()
  @IsString()
  @IsIn(['south', 'east', 'west', 'north', 'unknown'])
  orientation?: string;

  @IsBoolean()
  rainExposed!: boolean;
}
