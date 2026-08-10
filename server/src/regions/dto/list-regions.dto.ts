import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { RegionLevel } from '../region.types';

export class ListRegionsQueryDto {
  @IsIn(['province', 'city', 'district'])
  level!: RegionLevel;

  @IsOptional()
  @Transform(({ value }) => value === 'null' ? null : value)
  @IsString()
  @Matches(/^\d{6}$/)
  parent_admin_code?: string | null;
}
