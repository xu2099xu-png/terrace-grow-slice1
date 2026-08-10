export function difficultyLabel(value?: number | null): string {
  if (!value) return '—';
  return { 1: '新手友好', 2: '有点难度', 3: '较有挑战', 4: '有难度', 5: '高手向' }[value] || `难度${value}`;
}

export function startMethodLabel(value?: string | null): string {
  return {
    nursery_plant: '建议买苗',
    direct_seed: '建议直播',
    either: '买苗 / 直播均可',
  }[value || ''] || value || '—';
}

export function categoryLabel(value?: string | null): string {
  return { vegetable: '蔬菜', fruit: '水果', herb: '香草', flower: '花卉' }[value || ''] || value || '—';
}

export function lifeTypeLabel(value?: string | null): string {
  return { perennial: '多年生', seasonal: '时令' }[value || ''] || value || '—';
}

export function acidityLabel(value?: string | null): string {
  return {
    acid_required: '喜酸',
    slightly_acid: '微酸',
    neutral: '中性',
    any: '不限',
  }[value || ''] || value || '—';
}
