import { Transform } from 'class-transformer';
import {
  IsIn,
  IsString,
  Length,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { IsResourceId } from '../../http/dto/shared.dto';

export type AiContextType = 'perennial_plan' | 'seasonal_item' | 'planting_now';

const CONTEXT_FIELDS: Record<AiContextType, Set<string>> = {
  perennial_plan: new Set([
    'context_type',
    'question',
    'crop_id',
    'selected_container_type_id',
    'selected_variety_id',
  ]),
  seasonal_item: new Set(['context_type', 'question', 'city_code', 'crop_id']),
  planting_now: new Set(['context_type', 'question', 'planting_id']),
};

const REQUIRED_FIELDS: Record<AiContextType, string[]> = {
  perennial_plan: ['context_type', 'question', 'crop_id'],
  seasonal_item: ['context_type', 'question', 'city_code', 'crop_id'],
  planting_now: ['context_type', 'question', 'planting_id'],
};

@ValidatorConstraint({ name: 'exactAiContextFields', async: false })
export class ExactAiContextFieldsConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const body = args.object as Record<string, unknown>;
    const contextType = body.context_type as AiContextType;
    if (!Object.prototype.hasOwnProperty.call(CONTEXT_FIELDS, contextType)) return false;

    const allowed = CONTEXT_FIELDS[contextType];
    const keys = Object.keys(body).filter((key) => body[key] !== undefined);
    if (keys.some((key) => !allowed.has(key))) return false;
    if (REQUIRED_FIELDS[contextType].some((key) => body[key] === undefined)) return false;
    if (body.selected_container_type_id === null || body.selected_variety_id === null) return false;
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const body = args.object as Record<string, unknown>;
    return `request fields do not match context_type ${String(body.context_type)}`;
  }
}

export class AskAiDto {
  @IsString()
  @IsIn(['perennial_plan', 'seasonal_item', 'planting_now'])
  @Validate(ExactAiContextFieldsConstraint)
  context_type!: AiContextType;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 300)
  question!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsResourceId()
  crop_id?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsResourceId()
  city_code?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsResourceId()
  planting_id?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsResourceId()
  selected_container_type_id?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsResourceId()
  selected_variety_id?: string;
}
