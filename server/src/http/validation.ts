import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

interface StableValidationError {
  path: string;
  code: string;
  message: string;
}

function flattenErrors(errors: ValidationError[], parent = ''): StableValidationError[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(([code, message]) => ({
      path,
      code,
      message,
    }));
    return [...own, ...flattenErrors(error.children ?? [], path)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: false,
    exceptionFactory: (errors) => new BadRequestException({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      errors: flattenErrors(errors),
    }),
  });
}
