import { IsOptional, IsString } from 'class-validator';
import { IsResourceId } from '../../http/dto/shared.dto';

export class PerennialRecommendationDto {
  @IsString()
  @IsResourceId()
  crop_id!: string;

  @IsOptional()
  @IsString()
  @IsResourceId()
  selected_container_type_id?: string;

  @IsOptional()
  @IsString()
  @IsResourceId()
  selected_variety_id?: string;
}
