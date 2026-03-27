import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { theme } from '../theme'
import { buildSubjectEndpoints, PAGE_COPY } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'

interface ProjectItem {
  id?: number
  name?: string
  description?: string
  status?: string
  [key: string]: unknown
}

const COPY = PAGE_COPY.projects

export function ProjectsScreen() {
  useAuth()
  const [items, setItems] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const endpoints = buildSubjectEndpoints(rnApiClient)
      const res = await endpoints.getAvailablePlans()
      if (res.code === 200) {
        const data = res.data as { items?: ProjectItem[] } | ProjectItem[] | undefined
        setItems(Array.isArray(data) ? data : data?.items ?? [])
      }
    } catch {
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const getBadgeStatus = (status?: string): 'pending' | 'confirmed' | 'completed' | 'expired' => {
    if (!status) return 'pending'
    const s = status.toLowerCase()
    if (s === 'open' || s === 'recruiting') return 'confirmed'
    if (s === 'closed') return 'expired'
    return 'pending'
  }

  const handleProjectPress = (id?: number) => {
    if (id != null) setExpandedId((prev) => (prev === id ? null : id))
  }

  if (loading && items.length === 0) {
    return (
      <RNPage title="可报名项目">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>{COPY.loading.title}</Text>
          <Text style={styles.loadingDesc}>{COPY.loading.description}</Text>
        </View>
      </RNPage>
    )
  }

  if (error && items.length === 0) {
    return (
      <RNPage title="可报名项目">
        <RNEmpty
          icon="⚠️"
          title="加载失败"
          description={error}
          actionText="重试"
          onAction={() => void reload()}
        />
      </RNPage>
    )
  }

  return (
    <RNPage title="可报名项目">
      {items.length === 0 ? (
        <RNEmpty
          icon={COPY.empty.icon}
          title={COPY.empty.title}
          description={COPY.empty.description}
          actionText={COPY.empty.actionText}
          onAction={() => void reload()}
        />
      ) : (
        items.map((item, i) => {
          const id = item.id ?? i
          const isExpanded = expandedId === id
          return (
            <RNCard key={id}>
              <Pressable
                style={styles.projectRow}
                onPress={() => handleProjectPress(id)}
              >
                <View style={styles.content}>
                  <Text style={styles.name}>{item.name || `项目 ${i + 1}`}</Text>
                  {isExpanded && item.description ? (
                    <Text style={styles.desc}>{item.description}</Text>
                  ) : null}
                </View>
                <RNBadge status={getBadgeStatus(item.status)} label={item.status} />
              </Pressable>
            </RNCard>
          )
        })
      )}
    </RNPage>
  )
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  loadingDesc: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    minHeight: theme.touchMinHeight,
  },
  content: { flex: 1 },
  name: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  desc: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    marginTop: theme.spacing.xs,
    lineHeight: 20,
  },
})
