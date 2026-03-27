/**
 * 洞明·数据台（Data Platform）专用 API 模块
 *
 * 聚合知识资产、采集管道、数据质量等接口，
 * 为数据中台管理工作台提供统一入口。
 */
import { api } from '../client'

export const dataPlatformApi = {
  // ── 知识资产概览 ──
  /** 知识资产保护状态 */
  assetProtectionStatus() {
    return api.get<{
      write_enabled: boolean
      immutable_assets: string[]
      write_protected_assets: Record<string, boolean>
      note: string
    }>('/knowledge/assets/protection-status')
  },

  /** 知识治理统计 */
  knowledgeGovernanceStats() {
    return api.get('/knowledge/governance/stats')
  },

  /** 知识条目列表 */
  listKnowledgeEntries(params?: { page?: number; page_size?: number; entry_type?: string; keyword?: string }) {
    return api.get('/knowledge/entries/list', { params })
  },

  /** 知识实体列表 */
  listEntities(params?: { page?: number; page_size?: number; entity_type?: string }) {
    return api.get('/knowledge/entities', { params })
  },

  // ── 数据管道健康 ──
  /** PersonalContext 统计（通过 ingestOverview 获取，复用已有端点） */
  personalContextStats() {
    return api.get('/data-platform/ingest/overview')
  },

  // ── 易快报集成 ──
  /** 易快报记录数量（通过 dashboard 汇总获取） */
  ekbRecordStats() {
    return api.get('/data-platform/dashboard')
  },

  // ── 仪表盘汇总 ──
  /** 数据台驾驶舱汇总（聚合多个来源） */
  dashboard() {
    return api.get<{
      knowledge_entries: number
      knowledge_entities: number
      personal_contexts: number
      ekb_records: number
      lims_raw_records: number
      lims_pending_injection: number
      write_protected: boolean
      pipelines_healthy: number
      pipelines_total: number
    }>('/data-platform/dashboard')
  },

  // ── 数据清洗与入库 ──
  /** 清洗与入库总览（各来源量、待入库量、重复数） */
  ingestOverview() {
    return api.get('/data-platform/ingest/overview')
  },

  /** 原始来源分布（按 source_type）及最近批次 */
  ingestSources() {
    return api.get('/data-platform/ingest/sources')
  },

  /** 重复记录分析（content_hash 重复组） */
  ingestDuplicates() {
    return api.get('/data-platform/ingest/duplicates')
  },

  /**
   * 执行去重清洗
   * @param dryRun true=仅统计不删除（默认）
   */
  deduplicate(dryRun = true) {
    return api.post('/data-platform/ingest/deduplicate', { dry_run: dryRun })
  },

  /**
   * 触发知识入库 Pipeline
   * @param sourceTypes 指定来源类型（不传则全部）
   * @param limit 每批数量（默认 20，最大 200）
   * @param dryRun 仅统计待入库数量（默认 true）
   */
  runPipeline(params?: { sourceTypes?: string[]; limit?: number; dryRun?: boolean }) {
    return api.post('/data-platform/ingest/run-pipeline', {
      source_types: params?.sourceTypes,
      limit: params?.limit ?? 20,
      dry_run: params?.dryRun ?? true,
    })
  },

  /** 待向量化知识条目列表 */
  pendingEntries(params?: { page?: number; page_size?: number; index_status?: string }) {
    return api.get('/data-platform/ingest/pending-entries', { params })
  },

  // ── 数据分类分级（Wave 5）──

  /** 六维度分类注册表：返回全部 27 张表的完整分类信息 */
  classificationRegistry() {
    return api.get<{
      tables: Record<string, {
        security_level: string
        criticality: string
        regulatory_categories: string[]
        freshness_sla: string
        retention_years: number | 'permanent'
        retention_display: string
        data_owner_role: string
        pseudonymized: boolean
        is_phi: boolean
        has_gcp_pi_conflict: boolean
        requires_pseudonymization: boolean
      }>
      summary: {
        total: number
        sec4_count: number
        sec3_count: number
        sec2_count: number
        sec1_count: number
        crit_a_count: number
        gcp_count: number
        gcp_pi_conflict_count: number
      }
    }>('/data-platform/classification/registry')
  },

  /** 分类合规度检查：GCP+PIPL 冲突、假名化待办、保留期汇总 */
  complianceCheck() {
    return api.get<{
      total_tables: number
      sec4_tables: string[]
      sec3_tables: string[]
      gcp_tables: string[]
      pi_tables: string[]
      gcp_pi_conflict_tables: string[]
      pending_pseudonymization: string[]
      owner_assigned_count: number
      retention_defined_count: number
      compliance_issues: { type: string; severity: string; tables: string[]; message: string }[]
    }>('/data-platform/classification/compliance-check')
  },

  // ── 知识来源注册表（Wave 6）──

  /** 获取知识来源注册表列表 */
  listKnowledgeSources(activeOnly = true) {
    return api.get<{
      sources: Array<{
        source_id: string
        name: string
        description: string
        source_type: string
        source_type_display: string
        fetch_schedule: string
        owner_role: string
        entry_type: string
        namespace: string
        active: boolean
        last_fetch_at: string | null
        status: string
      }>
      total: number
    }>('/data-platform/knowledge-sources', { params: { active_only: activeOnly } })
  },

  // ── 知识图谱可视化（Wave 7）──

  /** 获取知识图谱节点列表（ReactFlow 兼容格式） */
  knowledgeGraphNodes(params?: { namespace?: string; entity_type?: string; limit?: number }) {
    return api.get<{
      nodes: Array<{
        id: string
        type: string
        data: { label: string; label_en: string; entity_type: string; namespace: string; definition: string }
        position: { x: number; y: number }
      }>
      total: number
      returned: number
      namespace_stats: Record<string, number>
    }>('/data-platform/knowledge-graph/nodes', { params })
  },

  /** 获取知识图谱关系边（ReactFlow 兼容格式） */
  knowledgeGraphEdges(params?: { namespace?: string; relation_type?: string; entity_ids?: string; limit?: number }) {
    return api.get<{
      edges: Array<{
        id: string
        source: string
        target: string
        label: string
        data: { relation_type: string; confidence: number; source: string }
      }>
      total: number
    }>('/data-platform/knowledge-graph/edges', { params })
  },

  /** 获取数据目录实时 Schema（Django model 元数据 + 行数） */
  catalogSchema() {
    return api.get<Record<string, {
      fields: Array<{ name: string; type: string; null: boolean; help_text: string; db_column: string }>
      field_count: number
      row_count: number | null
      classification: {
        security_level?: string
        criticality?: string
        regulatory_categories?: string[]
        data_owner_role?: string
        is_phi?: boolean
        has_gcp_pi_conflict?: boolean
      }
    }>>('/data-platform/catalog/schema')
  },

  pipelinesSchedule() {
    return api.get<{
      tasks: Array<{
        id: string
        task: string
        category: string
        schedule_human: string
        enabled: boolean
        last_run_hint: string | null
      }>
      total: number
    }>('/data-platform/pipelines/schedule')
  },

  storageStats() {
    return api.get<{
      postgres: {
        status: string
        db_size: number | null
        db_size_human: string | null
        tables: Array<{ table: string; approx_rows: number | null }>
        error?: string
      }
      redis: {
        status: string
        used_memory_human: string | null
        connected_clients: number | null
        error?: string
      }
      qdrant: {
        status: string
        collections: Array<{ name: string; vectors: number }>
        error?: string
      }
    }>('/data-platform/storage/stats')
  },

  topologyHealth() {
    return api.get<{
      overall: 'healthy' | 'degraded'
      probes: Record<string, { status: string; error?: string; latency_hint?: string; queue_depth?: number }>
    }>('/data-platform/topology/health')
  },

  backupStatus() {
    return api.get<{
      overall: 'ok' | 'stale' | 'no_backup'
      items: Array<{
        label: string
        found: number
        latest: string | null
        latest_mtime: string | null
        age_hours: number | null
        size_mb: number | null
        status: 'ok' | 'stale' | 'no_backup'
      }>
      backup_dir: string
      note: string
    }>('/data-platform/backup/status')
  },

  /** 治理台全局候选生成（不绑定特定工作台） */
  populateAllCandidates(params?: { source_type?: string; limit?: number }) {
    return api.post<{
      total_created: number
      results_by_source: Record<string, { created: number; skipped?: number }>
      message: string
    }>('/data-platform/candidates/populate-all', params ?? {})
  },

  /** 外部数据摄入治理概览（ExternalIntakePage 使用） */
  intakeOverview() {
    return api.get<{
      total_candidates: number
      pending_total: number
      ingested_total: number
      high_confidence_pending: number
      avg_confidence: number
      by_workstation: Record<string, { pending: number; approved: number; rejected: number; ingested: number; auto_ingested: number }>
      by_source_type: Record<string, number>
      recent_ingested_trend: Array<{ day: string; count: number }>
    }>('/data-platform/intake-overview')
  },

  // ── 数据域注册表 ──

  /** 数据域注册表列表（10 个域） */
  listDomains() {
    return api.get<{
      domains: Array<{
        domain_id: string
        label: string
        description: string
        domain_type: string
        lifecycle_stage: string
        tables: string[]
        source_apps: string[]
        owner_role: string
        regulatory: string[]
        color: string
        table_count: number
        core_responsibilities: string[]
        governance_focus: string[]
        retention_expectation: string
      }>
      summary: {
        total_domains: number
        total_tables: number
        by_lifecycle: Record<string, { domain_ids: string[]; count: number }>
        by_domain_type: Record<string, { domain_ids: string[]; count: number }>
      }
    }>('/data-platform/domains')
  },

  /** 数据域详情（含实时行数） */
  getDomain(domainId: string) {
    return api.get<{
      domain_id: string
      label: string
      description: string
      domain_type: string
      lifecycle_stage: string
      tables: string[]
      source_apps: string[]
      owner_role: string
      regulatory: string[]
      color: string
      table_count: number
      core_responsibilities: string[]
      governance_focus: string[]
      retention_expectation: string
      table_stats: Array<{
        table: string
        approx_rows: number | null
        classification: { security_level?: string; criticality?: string; is_phi?: boolean }
      }>
    }>(`/data-platform/domains/${domainId}`)
  },

  // ── 治理总览与生命周期 ──

  /** 跨域治理总览（驾驶舱数据） */
  governanceOverview() {
    return api.get<{
      domains: Array<{ domain_id: string; label: string; lifecycle_stage: string; color: string; total_rows: number; table_count: number }>
      compliance_summary: Record<string, unknown>
      intake_summary: { total: number; pending: number; ingested: number }
      knowledge_vectorization: { total: number; indexed: number; pending: number; failed: number; progress_pct: number }
      write_protected: boolean
    }>('/data-platform/governance/overview')
  },

  /** 数据生命周期总览 */
  lifecycleOverview() {
    return api.get<{
      stages: Array<{
        id: string
        label: string
        desc: string
        domain_count: number
        domain_ids: string[]
        total_rows: number
      }>
    }>('/data-platform/lifecycle/overview')
  },

  /** 按域查询生命周期分布 */
  lifecycleByDomain() {
    return api.get<{
      items: Array<{
        domain_id: string
        label: string
        lifecycle_stage: string
        color: string
        total_rows: number
        table_rows: Record<string, number>
        owner_role: string
        regulatory: string[]
      }>
      total: number
    }>('/data-platform/lifecycle/by-domain')
  },

  // ── 冲突治理 ──

  /** 数据冲突治理汇总（LIMS + 易快报） */
  conflictsSummary() {
    return api.get<{
      lims: { total: number; pending: number; resolved: number; by_type: Record<string, number> }
      ekuaibao: { total: number; pending: number; resolved: number; by_type: Record<string, number> }
      recent_pending: Array<{
        id: number; module: string; conflict_type: string; similarity_score: number
        create_time: string | null; source: 'lims' | 'ekuaibao'
      }>
    }>('/data-platform/conflicts/summary')
  },

  /** 外部原始来源治理概览 */
  rawSourcesOverview() {
    return api.get<{
      lims: { total: number; by_module: Record<string, number>; injection_status: Record<string, number> }
      ekuaibao: { total: number; by_record_type: Record<string, number> }
      feishu: { total: number; by_source_type: Record<string, number> }
      candidates: { total: number; pending: number }
    }>('/data-platform/raw-sources/overview')
  },

  // ── Trace API ──

  /** 接入候选追溯链 */
  traceCandidate(candidateId: number) {
    return api.get(`/data-platform/trace/candidate/${candidateId}`)
  },

  /** 飞书上下文转化追溯链 */
  tracePersonalContext(pcId: number) {
    return api.get(`/data-platform/trace/personal-context/${pcId}`)
  },

  // ── 滞留与缺口 ──

  /** 生命周期滞留对象分析 */
  lifecycleStranded() {
    return api.get<{
      raw_stranded: { lims: number; ekuaibao: number; threshold_days: number }
      staging_stranded: { count: number; threshold_days: number }
      content_to_knowledge_gap: { total_pc: number; ingested_to_knowledge: number; gap: number }
      knowledge_pending_vectorization: { pending: number; failed: number }
    }>('/data-platform/lifecycle/stranded')
  },

  /** 治理缺口清单 */
  governanceGaps() {
    return api.get<{
      gaps: Array<{
        gap_type: string
        severity: 'critical' | 'high' | 'medium' | 'low'
        count: number
        affected: string[]
        message: string
        action: string
      }>
      total: number
      critical_count: number
      high_count: number
    }>('/data-platform/governance/gaps')
  },

  /** 最近治理写操作列表（DashboardPage 卡片） */
  governanceRecentOps() {
    return api.get<{
      ops: Array<{
        id: number
        action: string
        resource_type: string
        resource_name: string
        operator: string
        description: string
        created_at: string
      }>
      total: number
    }>('/data-platform/governance/recent-ops')
  },

  /** 知识转化治理统计 */
  knowledgeTransformation() {
    return api.get<{
      by_source_type: Record<string, { total: number; indexed: number; avg_quality: number; vectorization_rate: number }>
      quality_distribution: { excellent: number; good: number; fair: number; poor: number }
      vectorization_coverage: { total: number; indexed: number; coverage_pct: number }
      graph_coverage: { total_entities: number }
    }>('/data-platform/knowledge-governance/transformation')
  },

  /** 记录假名化规划意向（GCP+PIPL 冲突表） */
  createPseudonymizePlan(params: { table_name: string; notes?: string }) {
    return api.post<{
      table_name: string
      status: string
      notes: string
      message: string
    }>('/data-platform/governance/pseudonymize-plan', params)
  },

  // ── 数据质量（DataQuality 引擎，供 QualityPage 使用）──

  /** 数据质量规则列表 */
  dataQualityRules(activeOnly = true) {
    return api.get<{
      rules: Array<{
        id: number
        name: string
        rule_type: string
        target_model: string
        target_field: string
        severity: string
        is_active: boolean
        description: string
      }>
      total: number
    }>('/quality/data-quality/rules', { params: { active_only: activeOnly } })
  },

  /** 数据质量告警列表 */
  dataQualityAlerts(resolved = false, limit = 30) {
    return api.get<{
      alerts: Array<{
        id: number
        rule_name: string
        affected_model: string
        affected_count: number
        severity: string
        resolved: boolean
        created_at: string
      }>
      total: number
    }>('/quality/data-quality/alerts', { params: { resolved, limit } })
  },

  // ── 外部数据摄入（ExternalIntakePage 使用）──

  /** 外部数据摄入队列汇总（按工作台分组） */
  intakeSummaryByWorkstation() {
    return api.get<{
      workstations: Array<{
        workstation: string
        pending: number
        approved: number
        rejected: number
        ingested: number
        auto_ingested: number
      }>
      total: number
    }>('/data-intake/summary/by-workstation')
  },

  /** 外部数据摄入队列列表 */
  intakeQueue(params?: {
    workstation?: string
    status?: string
    page?: number
    page_size?: number
  }) {
    return api.get<{
      items: Array<{
        id: number
        source_type: string
        workstation: string
        status: string
        payload: Record<string, unknown>
        created_at: string
      }>
      total: number
    }>('/data-intake/queue', { params })
  },

  /** 审批摄入项 */
  intakeApprove(id: number, action: 'approve' | 'reject', reason?: string) {
    return api.post(`/data-intake/${id}/review`, { action, reason })
  },

  // ── 协议血缘（LineagePage 使用）──

  /** 协议列表（血缘图选择用） */
  protocolList(params?: { page?: number; page_size?: number; search?: string }) {
    return api.get<{
      items: Array<{ id: number; name: string; protocol_no: string; version: string }>
      total: number
    }>('/protocol/list', { params })
  },

  /** 协议版本血缘图 */
  protocolLineage(protocolId: number) {
    return api.get<{
      nodes: Array<{ id: string; label: string; type: string }>
      edges: Array<{ source: string; target: string; label?: string }>
    }>(`/protocol/${protocolId}/versions/lineage`)
  },
}
