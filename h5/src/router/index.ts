import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../views/Home.vue';
import SeasonalHome from '../views/SeasonalHome.vue';
import TerraceWizard from '../views/TerraceWizard.vue';
import PerennialPlan from '../views/PerennialPlan.vue';
import Mine from '../views/Mine.vue';
import PlantingStart from '../views/PlantingStart.vue';
import PlantingDetail from '../views/PlantingDetail.vue';
import SeasonalNow from '../views/SeasonalNow.vue';
import CropDetail from '../views/CropDetail.vue';
import LocationPickerPage from '../views/LocationPickerPage.vue';

const routes = [
  { path: '/', component: SeasonalHome, meta: { title: '时令种植', tab: 'seasonal' } },
  { path: '/seasonal', component: SeasonalHome, meta: { title: '时令种植', tab: 'seasonal' } },
  { path: '/location', component: LocationPickerPage, meta: { title: '选择区县' } },
  { path: '/perennial', component: Home, meta: { title: '长期种植', tab: 'perennial' } },
  { path: '/perennial/:plantId', component: CropDetail, props: (route: any) => ({ id: route.params.plantId }), meta: { title: '作物详情', tab: 'perennial' } },
  { path: '/perennial/:plantId/plan', component: PerennialPlan, props: (route: any) => ({ cropId: route.params.plantId }), meta: { title: '种植方案' } },
  { path: '/terrace', component: TerraceWizard, meta: { title: '创建露台档案' } },
  { path: '/plan/:cropId', component: PerennialPlan, props: true, meta: { title: '种植方案' } },
  { path: '/planting-start', component: PlantingStart, meta: { title: '开始种植' } },
  { path: '/plantings/:id', component: PlantingDetail, props: true, meta: { title: '当前种植阶段' } },
  { path: '/seasons/now', component: SeasonalNow, meta: { title: '这个季节种什么' } },
  { path: '/crops/:id', component: CropDetail, props: true, meta: { title: '作物详情' } },
  { path: '/mine', component: Mine, meta: { title: '我的', tab: 'mine' } },
  { path: '/profile', redirect: '/mine' },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.afterEach((to) => {
  document.title = String(to.meta.title || '露台种植');
});

export default router;
