<template>
  <div class="terrace-wizard">
    <van-nav-bar title="创建露台档案" fixed left-arrow @click-left="goBack" />

    <div v-if="step === 1" class="step">
      <h2>您所在的城市？</h2>
      <p class="hint">用于匹配气候区与需冷量估算</p>
      <van-cell-group inset>
        <van-field
          v-model="cityCode"
          label="城市"
          placeholder="请输入城市拼音，如 beijing"
          :rules="[{ required: true }]"
        />
      </van-cell-group>
      <div class="actions">
        <van-button type="primary" block round @click="nextStep" :disabled="!cityCode">下一步</van-button>
      </div>
    </div>

    <div v-if="step === 2" class="step">
      <h2>露台日照情况</h2>
      <p class="hint">请选择最符合的一项</p>
      <van-radio-group v-model="sunExposureLevel">
        <van-cell-group inset>
          <van-cell title="阳光充足（大部分白天都有阳光）" clickable @click="sunExposureLevel = 'LONG'">
            <template #right-icon>
              <van-radio name="LONG" />
            </template>
          </van-cell>
          <van-cell title="半天左右（上午或下午有阳光）" clickable @click="sunExposureLevel = 'MEDIUM'">
            <template #right-icon>
              <van-radio name="MEDIUM" />
            </template>
          </van-cell>
          <van-cell title="晒得较少（只有一小会儿）" clickable @click="sunExposureLevel = 'SHORT'">
            <template #right-icon>
              <van-radio name="SHORT" />
            </template>
          </van-cell>
          <van-cell title="基本晒不到" clickable @click="sunExposureLevel = 'LOW'">
            <template #right-icon>
              <van-radio name="LOW" />
            </template>
          </van-cell>
          <van-cell title="我不太确定" clickable @click="sunExposureLevel = 'UNSURE'">
            <template #right-icon>
              <van-radio name="UNSURE" />
            </template>
          </van-cell>
        </van-cell-group>
      </van-radio-group>
      <div class="actions">
        <van-button type="primary" block round @click="nextStep" :disabled="!sunExposureLevel">下一步</van-button>
      </div>
    </div>

    <div v-if="step === 3" class="step">
      <h2>辅助判断</h2>
      <p class="hint">请根据实际情况选择，帮助我们更准确地估算</p>
      <van-cell-group inset>
        <van-cell title="露台朝向">
          <template #label>
            <van-radio-group v-model="orientation" direction="horizontal">
              <van-radio name="south">南</van-radio>
              <van-radio name="east">东</van-radio>
              <van-radio name="west">西</van-radio>
              <van-radio name="north">北</van-radio>
              <van-radio name="unknown">不确定</van-radio>
            </van-radio-group>
          </template>
        </van-cell>
        <van-cell title="主要日照时段">
          <template #label>
            <van-radio-group v-model="timeObs" direction="horizontal">
              <van-radio name="morning">上午</van-radio>
              <van-radio name="afternoon">下午</van-radio>
              <van-radio name="allday">全天</van-radio>
              <van-radio name="rarely">很少</van-radio>
              <van-radio name="unknown">不确定</van-radio>
            </van-radio-group>
          </template>
        </van-cell>
        <van-cell title="露台是否淋雨？">
          <template #label>
            <van-radio-group v-model="rainExposed" direction="horizontal">
              <van-radio :name="true">会淋到雨</van-radio>
              <van-radio :name="false">基本淋不到</van-radio>
            </van-radio-group>
          </template>
        </van-cell>
      </van-cell-group>
      <div class="actions">
        <van-button type="primary" block round @click="submit" :disabled="!orientation || !timeObs || rainExposed === null">完成</van-button>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <van-loading type="spinner" color="#1989fa" />
      <p>分析中…</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import api from '../api/client';

const router = useRouter();
const step = ref(1);
const cityCode = ref('');
const sunExposureLevel = ref('');
const orientation = ref('');
const timeObs = ref('');
const rainExposed = ref<boolean | null>(null);
const loading = ref(false);

function goBack() {
  if (step.value > 1) {
    step.value--;
  } else {
    router.push('/');
  }
}

function nextStep() {
  if (step.value === 2 && sunExposureLevel.value === 'UNSURE') {
    step.value = 3;
  } else {
    submit();
  }
}

async function submit() {
  loading.value = true;
  try {
    // 1. anonymous auth
    let token = localStorage.getItem('token');
    if (!token) {
      const deviceId = 'h5-' + Math.random().toString(36).slice(2);
      const authRes = await api.post('/auth/anonymous', { device_id: deviceId });
      token = authRes.data.token;
      localStorage.setItem('token', token);
    }

    // 2. create terrace
    const payload: any = {
      name: '我的露台',
      cityCode: cityCode.value,
      rainExposed: rainExposed.value ?? false,
    };
    if (sunExposureLevel.value && sunExposureLevel.value !== 'UNSURE') {
      payload.sunExposureLevel = sunExposureLevel.value;
    } else {
      payload.sunOrientationRaw = orientation.value || 'unknown';
      payload.sunTimeObsRaw = timeObs.value || 'unknown';
    }
    await api.post('/terraces', payload);

    // 3. navigate to plan (blueberry hardcoded for slice 1)
    router.push('/plan/crop-blueberry');
  } catch (e: any) {
    showToast(e.response?.data?.message || '出错了，请重试');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.terrace-wizard {
  padding-top: 46px;
}
.step {
  padding: 16px;
}
h2 {
  font-size: 20px;
  margin-bottom: 4px;
}
.hint {
  color: #999;
  font-size: 13px;
  margin-bottom: 16px;
}
.actions {
  margin-top: 24px;
}
.loading {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.9);
}
</style>
