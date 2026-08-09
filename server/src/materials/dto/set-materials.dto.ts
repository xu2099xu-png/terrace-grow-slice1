import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator';
import { IsResourceId } from '../../http/dto/shared.dto';

export class SetMaterialsDto {
  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsString({ each: true })
  @IsResourceId({ each: true })
  material_ids!: string[];
}
