import { describe, expect, it } from 'vitest';
import router from './index';
import CropDetail from '../views/CropDetail.vue';
import PerennialPlan from '../views/PerennialPlan.vue';
import LocationPickerPage from '../views/LocationPickerPage.vue';

describe('router Slice 6 IA compatibility', () => {
  it('keeps new IA routes and legacy deep links together', () => {
    const byPath = new Map(router.getRoutes().map((route) => [route.path, route]));

    for (const path of [
      '/',
      '/seasonal',
      '/location',
      '/perennial',
      '/perennial/:plantId',
      '/perennial/:plantId/plan',
      '/profile',
      '/plan/:cropId',
      '/crops/:id',
      '/mine',
      '/terrace',
    ]) {
      expect(byPath.has(path)).toBe(true);
    }

    expect(byPath.get('/perennial/:plantId')?.components?.default).toBe(CropDetail);
    expect(byPath.get('/perennial/:plantId/plan')?.components?.default).toBe(PerennialPlan);
    expect(byPath.get('/location')?.components?.default).toBe(LocationPickerPage);
    expect(byPath.get('/profile')?.redirect).toBe('/mine');
  });
});
