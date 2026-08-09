import { IsOptional, IsString, Matches, registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

export const RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function IsResourceId(options?: ValidationOptions): PropertyDecorator {
  return Matches(RESOURCE_ID_PATTERN, {
    message: '$property must be a valid resource identifier',
    ...options,
  });
}

export function IsStrictDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isStrictDate',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
          const [year, month, day] = value.split('-').map(Number);
          const date = new Date(Date.UTC(year, month - 1, day));
          return date.getUTCFullYear() === year
            && date.getUTCMonth() === month - 1
            && date.getUTCDate() === day;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a real YYYY-MM-DD calendar date`;
        },
      },
    });
  };
}

export class ResourceIdParamsDto {
  @IsString()
  @IsResourceId()
  id!: string;
}

export class OptionalCityQueryDto {
  @IsOptional()
  @IsString()
  @IsResourceId()
  city_code?: string;
}

export class OptionalCropQueryDto {
  @IsOptional()
  @IsString()
  @IsResourceId()
  crop_id?: string;
}
