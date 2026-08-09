import { IsIn, IsOptional, IsString } from 'class-validator';
import { IsResourceId } from '../../http/dto/shared.dto';

export class CatalogQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['seasonal', 'perennial'])
  life_type?: string;
}

export class CropDetailQueryDto {
  @IsOptional()
  @IsString()
  @IsResourceId()
  city_code?: string;
}
