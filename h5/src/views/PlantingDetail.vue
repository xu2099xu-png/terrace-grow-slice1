<template>
  <div class="planting-detail">
    <van-nav-bar title="当前种植阶段" fixed left-arrow @click-left="router.back()" />

    <div v-if="loading" class="loading">
      <van-loading type="spinner" color="#1989fa" />
      <p>加载中…</p>
    </div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <van-button block round @click="load">重试</van-button>
    </div>

    <div v-else-if="now" class="content">
      <!-- 状态横幅 -->
      <van-cell-group inset title="种植状态">
        <van-cell title="状态" :value="statusLabel" />
        <van-cell title="当前阶段" :value="currentStageLabel" />
        <van-cell title="进度" :value="progressLabel" />
      </van-cell-group>

      <!-- 现在要做什么 -->
      <van-cell-group inset title="现在要做什么">
        <template v-if="now.current_stage">
          <van-cell v-for="a in now.actions" :key="a" :title="actionLabel(a)">
            <template #right-icon>
              <van-button
                size="small"
                type="primary"
                :disabled="completed.has(a)"
                @click="complete(a)"
              >{{ completed.has(a) ? '已完成' : '完成' }}</van-button>
            </template>
          </van-cell>
        </template>
        <van-cell v-else :title="statusMessage" />
      </van-cell-group>

      <!-- 已完成 -->
      <van-cell-group inset title="已完成">
        <van-cell
          v-for="k in now.completed_action_keys"
          :key="k"
          :title="actionLabel(k)"
        />
        <van-cell v-if="!now.completed_action_keys.length" title="暂无" />
      </van-cell-group>

      <!-- 下一阶段 -->
      <van-cell-group inset title="下一阶段" v-if="now.next_stage">
        <van-cell :title="now.next_stage.stage_name" :label="now.next_stage.explanation || ''" />
      </van-cell-group>

      <van-cell-group inset title="提示" v-if="now.warnings.length">
        <van-cell v-for="w in now.warnings" :key="w" :title="w" />
      </van-cell-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import api from '../api/client';

interface NowResponse {
  planting_id: string;
  status: string;
  as_of_date: string;
  current_stage: {
    stage_key: string;
    stage_name: string;
    order: number;
    start_offset: number;
    end_offset: number;
    actions: string[];
    explanation?: string | null;
  } | null;
  actions: string[];
  completed_action_keys: string[];
  next_stage: { stage_key: string; stage_name: string; explanation?: string | null } | null;
  lifecycle_template_id: string;
  lifecycle_version: number;
  warnings: string[];
}

const props = defineProps<{ id: string }>();
const router = useRouter();

const loading = ref(false);
const error = ref('');
const now = ref<NowResponse | null>(null);
const completed = ref<Set<string>>(new Set());

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    planned: '计划中',
    active: '进行中',
    established: '本轮定植流程已完成',
    lifecycle_unavailable: '流程暂不可用',
  };
  return map[now.value?.status ?? ''] || now.value?.status || '—';
});

const currentStageLabel = computed(() => {
  if (!now.value) return '—';
  if (now.value.status === 'established') return '—（已定植完成）';
  if (now.value.status === 'lifecycle_unavailable') return '—';
  return now.value.current_stage?.stage_name || '—';
});

const progressLabel = computed(() => {
  const n = now.value;
  if (!n) return '—';
  const total = n.completed_action_keys.length + (n.actions.length || 0);
  return `${n.completed_action_keys.length} 已完成`;
});

const statusMessage = computed(() => {
  const n = now.value;
  if (!n) return '';
  if (n.status === 'established') return '本轮定植流程已完成';
  if (n.status === 'lifecycle_unavailable') return '该种植暂无可用种植流程模板';
  if (n.status === 'planned') return '开始日期未到，暂未进入种植阶段';
  return '当前没有可操作步骤';
});

function actionLabel(key: string): string {
  const map: Record<string, string> = {
    action_fixture_1: '完成定植初期操作',
    action_fixture_2: '缓苗期照护',
    action_fixture_3: '检查土壤湿度',
  };
  return map[key] || key;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/plantings/${props.id}/now`);
    now.value = res.data;
    completed.value = new Set(res.data.completed_action_keys);
  } catch (e: any) {
    error.value = e.response?.data?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function complete(actionKey: string) {
  try {
    const clientEventId = 'h5-' + crypto.randomUUID();
    await api.post(`/plantings/${props.id}/events`, {
      action_key: actionKey,
      client_event_id: clientEventId,
    });
    // refresh state from backend (single source of truth)
    await load();
    showToast('已记录');
  } catch (e: any) {
    showToast(e.response?.data?.message || '记录失败');
  }
}

onMounted(load);
</script>

<style scoped>
.planting-detail {
  padding-top: 46px;
}
.content {
  padding: 16px;
}
.loading, .error {
  text-align: center;
  padding-top: 120px;
}
</style>
