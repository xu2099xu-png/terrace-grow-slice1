<template>
  <van-button
    class="ai-explain-trigger"
    size="small"
    plain
    round
    type="primary"
    icon="question-o"
    data-testid="ai-explain-button"
    @click.stop="open"
  >
    {{ buttonText }}
  </van-button>

  <van-popup
    v-model:show="show"
    round
    position="bottom"
    safe-area-inset-bottom
    :style="{ maxHeight: '82vh' }"
    data-testid="ai-explain-panel"
  >
    <div class="ai-panel">
      <div class="ai-panel-head">
        <div>
          <h3>解释一下</h3>
          <p>仅基于当前记录引用的信息回答</p>
        </div>
        <van-button icon="cross" size="small" plain round aria-label="关闭" @click="show = false" />
      </div>

      <van-field
        v-model="question"
        type="textarea"
        rows="3"
        maxlength="300"
        show-word-limit
        autosize
        placeholder="问一句关于当前建议的问题"
        data-testid="ai-question-input"
      />

      <van-button
        class="submit"
        block
        round
        type="primary"
        :loading="loading"
        :disabled="!canSubmit"
        data-testid="ai-submit-button"
        @click="submit"
      >
        获取解释
      </van-button>

      <div v-if="rateLimited" class="state error" data-testid="ai-429">
        请求太频繁，请稍后再试
      </div>

      <div v-if="requestError" class="state error" data-testid="ai-error">
        <p>{{ requestError }}</p>
        <van-button size="small" round :disabled="!canSubmit" @click="submit">重试</van-button>
      </div>

      <div v-if="response" class="answer-block">
        <div class="state" data-testid="ai-state">{{ stateLabel }}</div>
        <p class="answer-text" data-testid="ai-answer">{{ response.answer }}</p>

        <div v-if="response.citations.length" class="citations">
          <div
            v-for="citation in response.citations"
            :key="citation.fact_id"
            class="citation"
            data-testid="ai-citation"
          >
            <span>{{ citation.label }}</span>
            <strong>{{ citation.value }}{{ citation.unit || '' }}</strong>
          </div>
        </div>

        <div v-if="response.warnings.length" class="warnings">
          <p v-for="warning in response.warnings" :key="warning" data-testid="ai-warning">
            {{ warning }}
          </p>
        </div>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import api from '../api/client';

type ContextType = 'perennial_plan' | 'seasonal_item' | 'planting_now';
type AiStatus = 'answered' | 'disabled' | 'provider_unavailable' | 'insufficient_data';
type AiSource = 'ai' | 'rules';

interface Citation {
  fact_id: string;
  label: string;
  value: string | number | boolean;
  unit: string | null;
}

interface AiAskResponse {
  status: AiStatus;
  answer: string;
  source: AiSource;
  cache_hit: boolean;
  citations: Citation[];
  warnings: string[];
}

const props = withDefaults(defineProps<{
  contextType: ContextType;
  cropId?: string;
  selectedContainerTypeId?: string;
  selectedVarietyId?: string;
  cityCode?: string;
  plantingId?: string;
  defaultQuestion?: string;
  buttonText?: string;
}>(), {
  defaultQuestion: '',
  buttonText: '解释',
});

const show = ref(false);
const question = ref('');
const loading = ref(false);
const response = ref<AiAskResponse | null>(null);
const rateLimited = ref(false);
const requestError = ref('');

const trimmedQuestion = computed(() => question.value.trim());
const canSubmit = computed(() => {
  return !loading.value && trimmedQuestion.value.length >= 1 && trimmedQuestion.value.length <= 300;
});

const stateLabel = computed(() => {
  if (!response.value) return '';
  if (response.value.status === 'answered') {
    if (response.value.source === 'rules') return '规则解释';
    return response.value.cache_hit ? 'AI 解释（已复用）' : 'AI 解释';
  }
  if (response.value.status === 'disabled') return 'AI 已关闭，以下为规则解释';
  if (response.value.status === 'provider_unavailable') return 'AI 暂时不可用，以下为规则解释';
  return '暂无足够信息';
});

function open() {
  response.value = null;
  rateLimited.value = false;
  requestError.value = '';
  question.value = props.defaultQuestion;
  show.value = true;
}

function requestBody() {
  const base: Record<string, string> = {
    context_type: props.contextType,
    question: trimmedQuestion.value,
  };

  if (props.contextType === 'perennial_plan') {
    if (props.cropId) base.crop_id = props.cropId;
    if (props.selectedContainerTypeId) base.selected_container_type_id = props.selectedContainerTypeId;
    if (props.selectedVarietyId) base.selected_variety_id = props.selectedVarietyId;
  } else if (props.contextType === 'seasonal_item') {
    if (props.cityCode) base.city_code = props.cityCode;
    if (props.cropId) base.crop_id = props.cropId;
  } else if (props.contextType === 'planting_now' && props.plantingId) {
    base.planting_id = props.plantingId;
  }

  return base;
}

async function submit() {
  if (!canSubmit.value) return;

  loading.value = true;
  rateLimited.value = false;
  requestError.value = '';
  response.value = null;
  try {
    const res = await api.post('/ai/ask', requestBody());
    if (res.status !== 200 || !isAiAskResponse(res.data)) {
      requestError.value = '解释请求返回异常，请重试';
      return;
    }
    response.value = res.data;
  } catch (e: any) {
    if (e.response?.status === 429) {
      rateLimited.value = true;
      return;
    }
    if (e.response?.status === 401 || e.response?.status === 403) {
      return;
    }
    requestError.value = e.response?.data?.message || '解释请求失败，请检查网络后重试';
  } finally {
    loading.value = false;
  }
}

function isAiAskResponse(value: any): value is AiAskResponse {
  if (!value || typeof value !== 'object') return false;
  if (!['answered', 'disabled', 'provider_unavailable', 'insufficient_data'].includes(value.status)) return false;
  if (!['ai', 'rules'].includes(value.source)) return false;
  return (
    typeof value.answer === 'string' &&
    typeof value.cache_hit === 'boolean' &&
    Array.isArray(value.citations) &&
    Array.isArray(value.warnings)
  );
}
</script>

<style scoped>
.ai-explain-trigger {
  min-width: 88px;
}
.ai-panel {
  padding: 16px;
  max-height: 82vh;
  overflow-y: auto;
  box-sizing: border-box;
  -webkit-overflow-scrolling: touch;
}
.ai-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.ai-panel-head h3 {
  margin: 0 0 4px;
  font-size: 18px;
  line-height: 1.3;
}
.ai-panel-head p {
  margin: 0;
  color: #969799;
  font-size: 12px;
}
.submit {
  margin-top: 12px;
}
.state {
  margin-top: 14px;
  font-size: 13px;
  color: #1989fa;
  font-weight: 600;
}
.state.error {
  color: #ee0a24;
}
.answer-text {
  white-space: pre-wrap;
  color: #323233;
  line-height: 1.6;
  margin: 8px 0 0;
}
.citations {
  margin-top: 12px;
}
.citation {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid #f2f3f5;
  font-size: 13px;
}
.citation span {
  color: #646566;
}
.citation strong {
  color: #323233;
  font-weight: 600;
}
.warnings {
  margin-top: 10px;
  color: #ed6a0c;
  font-size: 13px;
}
.warnings p {
  margin: 4px 0 0;
}
</style>
