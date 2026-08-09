import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString } from 'class-validator';
import { IsResourceId } from '../../http/dto/shared.dto';

export class CalculateSoilDto {
  @IsString()
  @IsResourceId()
  crop_id!: string;

  @IsString()
  @IsResourceId()
  container_type_id!: string;

  @IsOptional()
  @IsString()
  @IsResourceId()
  selected_variety_id?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsString({ each: true })
  @IsResourceId({ each: true })
  material_ids?: string[];
}
