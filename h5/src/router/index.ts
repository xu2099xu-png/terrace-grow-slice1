import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../views/Home.vue';
import TerraceWizard from '../views/TerraceWizard.vue';
import PerennialPlan from '../views/PerennialPlan.vue';
import Mine from '../views/Mine.vue';
import PlantingStart from '../views/PlantingStart.vue';
import PlantingDetail from '../views/PlantingDetail.vue';
import SeasonalNow from '../views/SeasonalNow.vue';
import CropDetail from '../views/CropDetail.vue';

const routes = [
  { path: '/', component: Home, meta: { title: '露台种植' } },
  { path: '/terrace', component: TerraceWizard, meta: { title: '创建露台档案' } },
  { path: '/plan/:cropId', component: PerennialPlan, props: true, meta: { title: '种植方案' } },
  { path: '/planting-start', component: PlantingStart, meta: { title: '开始种植' } },
  { path: '/plantings/:id', component: PlantingDetail, props: true, meta: { title: '当前种植阶段' } },
  { path: '/seasons/now', component: SeasonalNow, meta: { title: '这个季节种什么' } },
  { path: '/crops/:id', component: CropDetail, props: true, meta: { title: '作物详情' } },
  { path: '/mine', component: Mine, meta: { title: '我的' } },
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
