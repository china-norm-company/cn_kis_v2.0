/**
 * 协作 DAG — 节点为 Agent，边为编排委派关系（基于路由配置）
 * 使用 React Flow (@xyflow/react)
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'

const NODE_WIDTH = 140
const NODE_GAP = 80

function buildGraph(
  domainAgent: Array<{ domain_code: string; agent_id: string }>
): { nodes: Node[]; edges: Edge[] } {
  const agentIds = Array.from(new Set(domainAgent.map((r) => r.agent_id)))
  const hasOrchestration = agentIds.includes('orchestration-agent')
  const others = agentIds.filter((id) => id !== 'orchestration-agent')
  const nodes: Node[] = []
  const edges: Edge[] = []

  if (hasOrchestration && others.length > 0) {
    nodes.push({
      id: 'orchestration-agent',
      type: 'default',
      position: { x: 200, y: 120 },
      data: { label: '编排中枢' },
      style: { background: '#8b5cf6', color: '#fff', border: 'none' },
    })
    others.forEach((agentId, i) => {
      const row = Math.floor(i / 4)
      const col = i % 4
      const x = 40 + col * (NODE_WIDTH + NODE_GAP)
      const y = 280 + row * (50 + NODE_GAP)
      nodes.push({
        id: agentId,
        type: 'default',
        position: { x, y },
        data: { label: agentId.replace(/-agent$/, '').replace(/-/g, ' ') },
        style: { background: '#e0e7ff', border: '1px solid #818cf8' },
      })
      edges.push({
        id: `e-orch-${agentId}`,
        source: 'orchestration-agent',
        target: agentId,
        type: 'smoothstep',
      })
    })
  } else if (agentIds.length > 0) {
    agentIds.forEach((id, i) => {
      const row = Math.floor(i / 4)
      const col = i % 4
      nodes.push({
        id,
        type: 'default',
        position: { x: 40 + col * (NODE_WIDTH + NODE_GAP), y: 40 + row * 80 },
        data: { label: id.replace(/-agent$/, '').replace(/-/g, ' ') },
        style: { background: '#f1f5f9', border: '1px solid #cbd5e1' },
      })
    })
  }

  return { nodes, edges }
}

export default function CollaborationDag() {
  const { data: res, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'routing'],
    queryFn: () => digitalWorkforcePortalApi.getRouting(),
  })
  const domainAgent = res?.data.data.domain_agent ?? []

  const { nodes, edges } = useMemo(() => buildGraph(domainAgent), [domainAgent])

  if (isLoading) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
        加载协作拓扑中...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
        协作拓扑加载失败，请稍后重试。
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white h-[320px] flex items-center justify-center text-slate-500 text-sm">
        暂无编排路由数据，请先在「协作流程定义」中配置领域→Agent。
      </div>
    )
  }

  return (
    <div className="h-[360px] rounded-xl border border-slate-200 bg-white overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background />
        <Controls />
        <MiniMap nodeColor="#c7d2fe" maskColor="rgba(0,0,0,0.08)" />
      </ReactFlow>
    </div>
  )
}
