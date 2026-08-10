<template>
  <van-cell-group v-if="requirements.length" inset title="环境要求">
    <van-cell
      v-for="env in requirements"
      :key="env.id"
      :title="sunLabel(env)"
      :label="temperatureLabel(env)"
      :value="frostLabel(env)"
    />
  </van-cell-group>
</template>

<script setup lang="ts">
import type { EnvironmentRequirement } from '../../api/catalog';

defineProps<{ requirements: EnvironmentRequirement[] }>();

function sunLabel(env: EnvironmentRequirement): string {
  return typeof env.minSunHours === 'number' ? `${env.minSunHours}h 以上日照` : '日照要求';
}

function temperatureLabel(env: EnvironmentRequirement): string {
  const range = typeof env.tempMin === 'number' && typeof env.tempMax === 'number'
    ? `可耐受 ${env.tempMin}-${env.tempMax}°C`
    : '';
  const optimal = typeof env.optimalTempMin === 'number' && typeof env.optimalTempMax === 'number'
    ? `适温 ${env.optimalTempMin}-${env.optimalTempMax}°C`
    : '';
  return [range, optimal].filter(Boolean).join(' · ');
}

function frostLabel(env: EnvironmentRequirement): string | undefined {
  if (env.frostSensitive === true) return '霜冻敏感';
  if (env.frostSensitive === false) return '霜冻不敏感';
  return undefined;
}
</script>
