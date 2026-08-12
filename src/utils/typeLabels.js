export const TYPE_LABELS = {
  LARAVEL: 'Laravel',
  NEXTJS: 'Next.js',
  VUE: 'Vue.js',
  REACT_VITE: 'React (Vite)',
  REACT: 'React',
  GOLANG: 'Go',
  NODEJS: 'Node.js',
  CUSTOM: 'Custom',
};

export const typeLabel = (type) => TYPE_LABELS[type] || type || 'CUSTOM';
