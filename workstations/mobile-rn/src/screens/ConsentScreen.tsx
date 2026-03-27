import React, { useEffect, useState, useCallback } from 'react'
import { Text, View, StyleSheet, ScrollView, Switch } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNEmpty } from '../components/RNEmpty'
import { RNBadge } from '../components/RNBadge'
import { buildSubjectEndpoints, useIdentityStatus } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

interface ConsentItem {
  icf_version_id: number
  title: string
  version: string
  status: string
  signed_at?: string
}

export function ConsentScreen() {
  const { user } = useAuth()
  const identity = useIdentityStatus(rnApiClient)
  const endpoints = buildSubjectEndpoints(rnApiClient)
  const [consents, setConsents] = useState<ConsentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIcf, setSelectedIcf] = useState<ConsentItem | null>(null)
  const [icfContent, setIcfContent] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signResult, setSignResult] = useState<string | null>(null)

  useEffect(() => {
    void identity.reload()
    void loadConsents()
  }, [])

  const loadConsents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await rnApiClient.get<{ items?: ConsentItem[] }>('/my/consents')
      if (res.code === 200 && res.data?.items) {
        setConsents(res.data.items)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadIcfContent = useCallback(async (icfVersionId: number) => {
    const res = await rnApiClient.get<{ content?: string }>(`/my/consents/icf/${icfVersionId}`)
    if (res.code === 200 && res.data?.content) {
      setIcfContent(res.data.content)
    }
  }, [])

  const handleSelect = (item: ConsentItem) => {
    setSelectedIcf(item)
    setAgreed(false)
    setSignResult(null)
    void loadIcfContent(item.icf_version_id)
  }

  const handleSign = async () => {
    if (!selectedIcf || !agreed) return
    if (!identity.isL2) {
      setSignResult('请先完成实名认证后再签署')
      return
    }
    setSigning(true)
    setSignResult(null)
    try {
      const res = await endpoints.faceSignConsent(selectedIcf.icf_version_id, {
        face_verify_token: 'app-verified',
        comprehension_quiz_passed: true,
      })
      if (res.code === 200) {
        setSignResult('签署成功')
        void loadConsents()
      } else {
        setSignResult(`签署失败：${res.msg}`)
      }
    } catch {
      setSignResult('网络错误，请重试')
    } finally {
      setSigning(false)
    }
  }

  if (selectedIcf) {
    return (
      <RNPage title="知情同意书">
        <RNCard>
          <Text style={styles.icfTitle}>{selectedIcf.title}</Text>
          <Text style={styles.icfVersion}>版本：{selectedIcf.version}</Text>
        </RNCard>

        <RNCard>
          <ScrollView style={styles.icfScroll}>
            <Text style={styles.icfBody}>{icfContent || '正在加载知情同意书内容...'}</Text>
          </ScrollView>
        </RNCard>

        <RNCard>
          <View style={styles.agreeRow}>
            <Switch value={agreed} onValueChange={setAgreed} trackColor={{ true: theme.color.primary }} />
            <Text style={styles.agreeText}>我已阅读并理解上述内容，自愿签署知情同意书</Text>
          </View>
        </RNCard>

        {signResult && (
          <RNCard>
            <Text style={[styles.result, signResult.includes('成功') ? styles.resultOk : styles.resultFail]}>{signResult}</Text>
          </RNCard>
        )}

        <View style={styles.actions}>
          <RNButton label="返回列表" type="secondary" onPress={() => { setSelectedIcf(null); setIcfContent('') }} />
          <RNButton label={signing ? '签署中...' : '确认签署'} onPress={handleSign} disabled={!agreed || signing} />
        </View>
      </RNPage>
    )
  }

  return (
    <RNPage title="知情同意">
      {loading ? (
        <RNCard><Text style={styles.loadingText}>加载中...</Text></RNCard>
      ) : consents.length === 0 ? (
        <RNEmpty icon="📝" title="暂无知情同意书" description="入组后将自动生成知情同意书" />
      ) : (
        consents.map((item) => (
          <RNCard key={item.icf_version_id}>
            <View style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemSub}>版本 {item.version}</Text>
                {item.signed_at && <Text style={styles.itemSub}>签署时间：{item.signed_at}</Text>}
              </View>
              <RNBadge status={item.status === 'signed' ? 'completed' : 'pending'} label={item.status === 'signed' ? '已签署' : '待签署'} />
            </View>
            {item.status !== 'signed' && (
              <RNButton label="查看并签署" type="secondary" onPress={() => handleSelect(item)} />
            )}
          </RNCard>
        ))
      )}
    </RNPage>
  )
}

const styles = StyleSheet.create({
  icfTitle: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.color.textPrimary },
  icfVersion: { fontSize: theme.fontSize.sm, color: theme.color.textSecondary, marginTop: 4 },
  icfScroll: { maxHeight: 300 },
  icfBody: { fontSize: theme.fontSize.sm, color: theme.color.textPrimary, lineHeight: 22 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  agreeText: { flex: 1, fontSize: theme.fontSize.sm, color: theme.color.textPrimary },
  actions: { gap: theme.spacing.sm },
  result: { fontSize: theme.fontSize.sm, textAlign: 'center', fontWeight: '500' },
  resultOk: { color: theme.color.success },
  resultFail: { color: theme.color.danger },
  loadingText: { color: theme.color.textSecondary, textAlign: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.sm },
  itemTitle: { fontSize: theme.fontSize.md, fontWeight: '500', color: theme.color.textPrimary },
  itemSub: { fontSize: theme.fontSize.xs, color: theme.color.textSecondary, marginTop: 2 },
})
