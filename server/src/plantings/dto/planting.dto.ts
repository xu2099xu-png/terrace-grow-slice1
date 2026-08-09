import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsResourceId, IsStrictDate } from '../../http/dto/shared.dto';

export class CreatePlantingDto {
  @IsString()
  @IsResourceId()
  terrace_id!: string;

  @IsString()
  @IsResourceId()
  crop_id!: string;

  @IsOptional()
  @IsString()
  @IsResourceId()
  variety_id?: string | null;

  @IsString()
  @IsResourceId()
  container_type_id!: string;

  @IsString()
  @IsStrictDate()
  start_date!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  client_request_id?: string;
}

export class CompletePlantingActionDto {
  @IsString()
  @IsResourceId()
  action_key!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  client_event_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
