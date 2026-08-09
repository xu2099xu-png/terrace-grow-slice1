import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/runtime-config';
import { configureApplication } from './http/application';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApplication(app);
  const port = app.get(AppConfigService).value.port;
  await app.listen(port);
  console.log(`Server running on port ${port}`);
}
bootstrap();
