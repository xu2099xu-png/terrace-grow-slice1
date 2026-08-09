import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { AppConfigService } from '../config/runtime-config';
import { createValidationPipe } from './validation';

export function configureApplication(app: INestApplication): INestApplication {
  const config = app.get(AppConfigService).value;
  const express = app.getHttpAdapter().getInstance();

  express.set('trust proxy', config.appEnv === 'production' ? 1 : false);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.useGlobalPipes(createValidationPipe());
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  return app;
}
