import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AnonymousAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  device_id!: string;
}
