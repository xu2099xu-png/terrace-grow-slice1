import { IsLatitude, IsLongitude, IsNumber } from 'class-validator';

export class ResolveLocationDto {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @IsLatitude()
  lat!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @IsLongitude()
  lng!: number;
}
