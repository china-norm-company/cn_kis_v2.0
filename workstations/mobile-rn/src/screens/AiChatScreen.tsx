import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { RNButton } from '../components/RNButton'
import { RNCard } from '../components/RNCard'
import { RNPage } from '../components/RNPage'
import { useAuth } from '../contexts/AuthContext'
import { rnApiClient } from '../adapters/rnApiClient'
import { createSseChat } from '../services/native/sseChat'
import { theme } from '../theme'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || ''
const AGENT_ID = 'general-assistant'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  displayContent?: string
  timestamp: string
}

interface AgentSession {
  session_id: string
  agent_id: string
  created_at: string
  call_count: number
}

interface HistoryCall {
  id: number
  input_text: string
  output_text: string
}

const TYPING_INTERVAL_MS = 16

function TypingText({
  content,
  animate,
}: {
  content: string
  animate?: boolean
}) {
  const [displayLen, setDisplayLen] = useState(0)

  useEffect(() => {
    if (!animate || content.length <= displayLen) return
    const timer = setTimeout(() => {
      setDisplayLen((n) => Math.min(n + 1, content.length))
    }, TYPING_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [content, displayLen, animate])

  const toShow =
    animate && displayLen < content.length ? content.slice(0, displayLen) : content
  return <Text style={styles.messageContent}>{toShow}</Text>
}

export function AiChatScreen() {
  const { isLoggedIn } = useAuth()
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const flatListRef = useRef<FlatList>(null)

  const loadSessions = useCallback(async () => {
    if (!isLoggedIn) return
    setLoadingSessions(true)
    try {
      const res = await rnApiClient.get<{ items: AgentSession[] }>('/agents/sessions')
      if (res.code === 200 && res.data?.items) {
        setSessions(res.data.items)
      }
    } catch {
      setSessions([])
    } finally {
      setLoadingSessions(false)
    }
  }, [isLoggedIn])

  const loadHistory = useCallback(
    async (sessionId: string) => {
      setLoadingHistory(true)
      try {
        const res = await rnApiClient.get<{
          history: HistoryCall[]
        }>(`/agents/sessions/${sessionId}/history`)
        if (res.code === 200 && res.data?.history) {
          const msgs: Message[] = []
          res.data.history.forEach((call) => {
            if (call.input_text) {
              msgs.push({
                id: `u-${call.id}`,
                role: 'user',
                content: call.input_text,
                timestamp: '',
              })
            }
            if (call.output_text) {
              msgs.push({
                id: `a-${call.id}`,
                role: 'assistant',
                content: call.output_text,
                timestamp: '',
              })
            }
          })
          setMessages(msgs)
        } else {
          setMessages([])
        }
      } catch {
        setMessages([])
      } finally {
        setLoadingHistory(false)
      }
    },
    []
  )

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (activeSessionId) {
      loadHistory(activeSessionId)
    } else {
      setMessages([])
    }
  }, [activeSessionId, loadHistory])

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true })
  }, [messages])

  const handleSwitchSession = useCallback((sessionId: string | null) => {
    setActiveSessionId(sessionId)
    setErrorMsg('')
  }, [])

  const handleClear = useCallback(() => {
    setMessages([])
    setActiveSessionId(null)
    setErrorMsg('')
    setStatus('idle')
    loadSessions()
  }, [loadSessions])

  const handleRetry = useCallback(() => {
    setErrorMsg('')
    setStatus('idle')
  }, [])

  const run = useCallback(async () => {
    const text = message.trim()
    if (!text || status === 'running') return

    const token = await SecureStore.getItemAsync('token')
    if (!token) {
      setErrorMsg('请先登录')
      setStatus('error')
      return
    }

    setMessage('')
    setErrorMsg('')
    setStatus('running')

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    const assistantId = `a-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, assistantMsg])

    const startSse = createSseChat(API_BASE, token)
    await startSse(
      {
        agent_id: AGENT_ID,
        message: text,
        session_id: activeSessionId || undefined,
      },
      {
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m
            )
          )
        },
        onDone: (meta) => {
          setStatus('done')
          if (meta?.session_id) {
            setActiveSessionId(String(meta.session_id))
            loadSessions()
          }
        },
        onError: (msg) => {
          setStatus('error')
          setErrorMsg(msg)
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: msg } : m))
          )
        },
      }
    )
  }, [message, status, activeSessionId, loadSessions])

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isUser = item.role === 'user'
      const isLastAssistant =
        !isUser &&
        index === messages.length - 1 &&
        status === 'running'
      return (
        <View
          style={[
            styles.messageRow,
            isUser ? styles.messageRowUser : styles.messageRowAssistant,
          ]}
        >
          <View
            style={[
              styles.messageBubble,
              isUser ? styles.bubbleUser : styles.bubbleAssistant,
            ]}
          >
            {isUser ? (
              <Text style={[styles.messageContent, styles.bubbleUserText]}>
                {item.content}
              </Text>
            ) : (
              <TypingText content={item.content} animate={isLastAssistant} />
            )}
          </View>
        </View>
      )
    },
    [messages.length, status]
  )

  const keyExtractor = useCallback((item: Message) => item.id, [])

  if (!isLoggedIn) {
    return (
      <RNPage title="AI 对话">
        <RNCard>
          <Text style={styles.hint}>请先登录后使用 AI 对话</Text>
        </RNCard>
      </RNPage>
    )
  }

  return (
    <RNPage title="AI 对话" scrollable={false}>
      <View style={styles.sessionBar}>
        <Text style={styles.sessionLabel}>会话</Text>
        <Pressable
          style={styles.newSessionBtn}
          onPress={() => handleSwitchSession(null)}
        >
          <Text style={styles.newSessionText}>+ 新会话</Text>
        </Pressable>
        {sessions.length > 0 && (
          <FlatList
            horizontal
            data={sessions.slice(0, 10)}
            keyExtractor={(s) => s.session_id}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.sessionChip,
                  activeSessionId === item.session_id && styles.sessionChipActive,
                ]}
                onPress={() => handleSwitchSession(item.session_id)}
              >
                <Text
                  style={[
                    styles.sessionChipText,
                    activeSessionId === item.session_id && styles.sessionChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.call_count} 轮 · {item.created_at?.slice(0, 10) || ''}
                </Text>
              </Pressable>
            )}
            showsHorizontalScrollIndicator={false}
          />
        )}
        {loadingSessions && (
          <ActivityIndicator size="small" color={theme.color.primary} style={styles.loader} />
        )}
      </View>

      <View style={styles.chatCardWrap}>
      <RNCard>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            loadingHistory ? (
              <View style={styles.empty}>
                <ActivityIndicator color={theme.color.primary} />
                <Text style={styles.emptyText}>加载历史...</Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>输入问题开始对话</Text>
              </View>
            )
          }
        />

        {errorMsg ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <RNButton label="重试" type="secondary" onPress={handleRetry} />
          </View>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="请输入问题"
            placeholderTextColor={theme.color.textMuted}
            style={styles.input}
            multiline
            maxLength={2000}
            editable={status !== 'running'}
          />
          <View style={styles.actions}>
            <RNButton
              label={status === 'running' ? '发送中...' : '发送'}
              onPress={() => void run()}
              disabled={status === 'running' || !message.trim()}
            />
            <RNButton
              label="清空"
              type="secondary"
              onPress={handleClear}
              disabled={status === 'running'}
            />
          </View>
        </View>
      </RNCard>
      </View>
    </RNPage>
  )
}

const styles = StyleSheet.create({
  sessionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  sessionLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    minWidth: 32,
  },
  newSessionBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.color.primaryLight,
    borderRadius: theme.radius.sm,
  },
  newSessionText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.primary,
    fontWeight: '600',
  },
  sessionChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.borderLight,
    maxWidth: 120,
  },
  sessionChipActive: {
    backgroundColor: theme.color.primaryLight,
    borderWidth: 1,
    borderColor: theme.color.primary,
  },
  sessionChipText: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
  },
  sessionChipTextActive: {
    color: theme.color.primary,
    fontWeight: '600',
  },
  loader: { marginLeft: theme.spacing.xs },
  chatCardWrap: {
    flex: 1,
    minHeight: 200,
  },
  bubbleUserText: {
    color: '#fff',
  },
  messageList: {
    paddingVertical: theme.spacing.md,
    flexGrow: 1,
  },
  messageRow: {
    marginBottom: theme.spacing.sm,
  },
  messageRowUser: { alignItems: 'flex-end' },
  messageRowAssistant: { alignItems: 'flex-start' },
  messageBubble: {
    maxWidth: '85%',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  bubbleUser: {
    backgroundColor: theme.color.primary,
  },
  bubbleAssistant: {
    backgroundColor: theme.color.card,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  messageContent: {
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textMuted,
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.color.danger,
  },
  inputRow: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    minHeight: 80,
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  hint: {
    fontSize: theme.fontSize.md,
    color: theme.color.textSecondary,
    textAlign: 'center',
    padding: theme.spacing.lg,
  },
})
