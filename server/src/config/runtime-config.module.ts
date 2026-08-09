import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService, parseRuntimeEnvironment } from './runtime-config';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (env) => {
        parseRuntimeEnvironment(env);
        return env;
      },
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class RuntimeConfigModule {}
