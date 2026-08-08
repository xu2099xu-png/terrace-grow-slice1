import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../views/Home.vue';
import TerraceWizard from '../views/TerraceWizard.vue';
import PerennialPlan from '../views/PerennialPlan.vue';
import Mine from '../views/Mine.vue';
import PlantingStart from '../views/PlantingStart.vue';
import PlantingDetail from '../views/PlantingDetail.vue';

const routes = [
  { path: '/', component: Home },
  { path: '/terrace', component: TerraceWizard },
  { path: '/plan/:cropId', component: PerennialPlan, props: true },
  { path: '/planting-start', component: PlantingStart },
  { path: '/plantings/:id', component: PlantingDetail, props: true },
  { path: '/mine', component: Mine },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
