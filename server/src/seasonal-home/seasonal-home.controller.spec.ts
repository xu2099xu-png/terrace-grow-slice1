import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createValidationPipe } from '../http/validation';
import { OptionalAuthGuard } from '../seasons/optional-auth.guard';
import { SeasonalHomeController } from './seasonal-home.controller';
import { SeasonalHomeService } from './seasonal-home.service';

describe('SeasonalHomeController', () => {
  let app: INestApplication | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('returns frozen validation shape for invalid admin_code', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SeasonalHomeController],
      providers: [{
        provide: SeasonalHomeService,
        useValue: { home: vi.fn() },
      }],
    })
      .overrideGuard(OptionalAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().userId = null;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/api/seasonal/home?admin_code=abc')
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
    });
    expect(res.body.errors).toEqual([
      expect.objectContaining({
        path: 'admin_code',
        code: 'matches',
      }),
    ]);
  });

  it('passes optional anonymous user id through as null', async () => {
    const home = vi.fn(async () => ({ ok: true }));
    const moduleRef = await Test.createTestingModule({
      controllers: [SeasonalHomeController],
      providers: [{
        provide: SeasonalHomeService,
        useValue: { home },
      }],
    })
      .overrideGuard(OptionalAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().userId = null;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    await app.init();

    await request(app.getHttpServer())
      .get('/api/seasonal/home?admin_code=110101')
      .expect(200, { ok: true });

    expect(home).toHaveBeenCalledWith('110101', null);
  });
});
