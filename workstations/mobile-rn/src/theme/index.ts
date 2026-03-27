import { designTokens } from '@cn-kis/subject-core'

export const theme = {
  ...designTokens,

  color: {
    ...designTokens.color,
    primaryLight: '#EBF4FF',
    border: '#e8eef8',
    borderLight: '#e2e8f0',
    textMuted: '#a0aec0',
  },

  gradient: {
    pageBg: ['#f6f9ff', '#f8fafc'] as const,
    profileHeader: ['#2b6cb0', '#4f84c2'] as const,
    primaryButton: ['#2b6cb0', '#4378b9'] as const,
  },

  shadow: {
    card: {
      shadowColor: '#2B6CB0',
      shadowOpacity: 0.07,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  },

  badge: {
    pending: { bg: '#fefcbf', text: '#975a16' },
    confirmed: { bg: '#bee3f8', text: '#2a4365' },
    completed: { bg: '#c6f6d5', text: '#276749' },
    expired: { bg: '#fed7d7', text: '#9b2c2c' },
  },

  touchMinHeight: 44,
} as const
