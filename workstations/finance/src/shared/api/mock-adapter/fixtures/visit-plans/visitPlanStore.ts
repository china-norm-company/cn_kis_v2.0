import type { VisitPlan, VisitNode } from "@/entities/visit-plan/domain";
import type {
  ActivityConfigListResponse,
  ActivityConfigUpdateRequest,
  BatchCreateFromTemplateRequest,
  VisitActivityConfig,
} from "@/entities/operation-template/domain";
import { getMockProtocolsFromLocalStorage, updateMockProtocolsInLocalStorage } from "@/shared/api/mock-adapter/fixtures/data/mockProjectProtocols";
import { getRandomTemplateParsedData } from "@/shared/api/mock-adapter/fixtures/data/mockDataGenerator";
import { convertParsedDataToVisitPlan } from "@/pages/workbench/projects/utils/visitPlanConverter";
import { canUseLocalStorage } from "@/shared/api/mock-adapter/mockStore";

interface VisitPlanStoreV1 {
  version: 1;
  plans: VisitPlan[];
  configsByNode: Record<number, VisitActivityConfig[]>;
  nextPlanId: number;
  nextNodeId: number;
  nextConfigId: number;
}

const STORAGE_KEY = "visit_plan_store_v1";

const nowIso = () => new Date().toISOString();

const parseWindow = (value?: string) => {
  if (!value) return { min: -2, max: 2 };
  const numbers = value.match(/-?\d+/g)?.map((n) => Number(n));
  if (!numbers || numbers.length === 0) return { min: -2, max: 2 };
  if (numbers.length === 1) return { min: -numbers[0], max: numbers[0] };
  return { min: numbers[0], max: numbers[1] ?? numbers[0] };
};

const defaultConfigsForNode = (nodeId: number, seed: number): VisitActivityConfig[] => {
  const idBase = seed * 1000;
  return [
    {
      id: idBase + 1,
      visit_node_id: nodeId,
      template_id: null,
      template_name: null,
      name: "基础体征检查",
      category: "evaluation",
      order: 1,
      is_required: true,
      instrument: "",
      instrument_id: null,
      sop_code: "SOP-BASE-001",
      crf_id: null,
      executor_role: "医生",
      evaluator_role: "医生",
      duration: 20,
      operation_spec: {},
      is_complete: true,
      missing_fields: [],
      remarks: "",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: idBase + 2,
      visit_node_id: nodeId,
      template_id: null,
      template_name: null,
      name: "实验室检测",
      category: "sample",
      order: 2,
      is_required: true,
      instrument: "血常规检测",
      instrument_id: null,
      sop_code: "LAB-STD-01",
      crf_id: null,
      executor_role: "检验技师",
      evaluator_role: "检验技师",
      duration: 30,
      operation_spec: {},
      is_complete: false,
      missing_fields: ["instrument_id", "duration"],
      remarks: "",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];
};

const seedFromProtocols = (): VisitPlanStoreV1 => {
  const protocols = getMockProtocolsFromLocalStorage();
  const store: VisitPlanStoreV1 = {
    version: 1,
    plans: [],
    configsByNode: {},
    nextPlanId: 1,
    nextNodeId: 1,
    nextConfigId: 1,
  };

  const sourceProtocols =
    protocols.length > 0
      ? protocols
      : [
          {
            id: Date.now(),
            name: "默认方案",
            code: "PRJ-DEFAULT",
            description: "自动生成的访视计划示例",
            status: "pending_review",
            project_id: 1,
            project_name: "示例项目",
            file_url: null,
            file_size: 0,
            file_type: "pdf",
            create_time: nowIso(),
            update_time: nowIso(),
            parsed_data: getRandomTemplateParsedData("默认方案"),
            visit_plan_generated: true,
          },
        ];

  if (protocols.length === 0) {
    updateMockProtocolsInLocalStorage(sourceProtocols as any);
  }

  sourceProtocols.forEach((protocol, idx) => {
    const parsedData = protocol.parsed_data ?? getRandomTemplateParsedData(protocol.name);
    const visitPlanItems = convertParsedDataToVisitPlan(parsedData);
    const nodes: VisitNode[] =
      visitPlanItems.length > 0
        ? visitPlanItems.map((item, itemIndex) => {
            const window = parseWindow(item.allowedWindowDeviation);
            return {
              id: store.nextNodeId++,
              name: item.visitName || `访视${itemIndex + 1}`,
              code: item.visitCode || `V${itemIndex + 1}`,
              base_day: item.dayOffset ?? itemIndex * 7,
              window_min: window.min,
              window_max: window.max,
              order: itemIndex + 1,
              activities: [],
              completeness_percentage: 0,
            };
          })
        : [
            {
              id: store.nextNodeId++,
              name: "筛选访视",
              code: "SCR",
              base_day: -14,
              window_min: -2,
              window_max: 2,
              order: 1,
              activities: [],
              completeness_percentage: 0,
            },
            {
              id: store.nextNodeId++,
              name: "基线访视",
              code: "BL",
              base_day: 0,
              window_min: 0,
              window_max: 1,
              order: 2,
              activities: [],
              completeness_percentage: 0,
            },
          ];

    nodes.forEach((node) => {
      store.configsByNode[node.id] = defaultConfigsForNode(node.id, idx + 1);
    });

    store.plans.push({
      id: store.nextPlanId++,
      protocol_id: protocol.id,
      version: "v1",
      is_active: true,
      create_time: protocol.create_time || nowIso(),
      update_time: protocol.update_time || nowIso(),
      nodes,
    });
  });

  store.nextConfigId = Math.max(store.nextConfigId, ...Object.values(store.configsByNode).flat().map((c) => c.id + 1), 1);
  return store;
};

const loadStore = (): VisitPlanStoreV1 => {
  if (!canUseLocalStorage()) return seedFromProtocols();
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (!existing) {
    const seeded = seedFromProtocols();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed = JSON.parse(existing) as VisitPlanStoreV1;
    if (parsed && parsed.version === 1) {
      return parsed;
    }
  } catch {
    // fallthrough to reseed
  }
  const seeded = seedFromProtocols();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
};

const persistStore = (store: VisitPlanStoreV1) => {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

const updateStore = (updater: (store: VisitPlanStoreV1) => VisitPlanStoreV1): VisitPlanStoreV1 => {
  const next = updater(loadStore());
  persistStore(next);
  return next;
};

const computeMissingFields = (config: VisitActivityConfig): string[] => {
  const missing: string[] = [];
  if (!config.name) missing.push("name");
  if (!config.duration) missing.push("duration");
  if (!config.executor_role) missing.push("executor_role");
  if (!config.sop_code) missing.push("sop_code");
  if (!config.instrument && !config.instrument_id) missing.push("instrument_id");
  return missing;
};

const recalcCompleteness = (configs: VisitActivityConfig[]): VisitActivityConfig[] =>
  configs.map((config) => {
    const missing = computeMissingFields(config);
    return {
      ...config,
      missing_fields: missing,
      is_complete: missing.length === 0,
    };
  });

const nodeCompleteness = (nodeId: number, configsByNode: Record<number, VisitActivityConfig[]>) => {
  const configs = configsByNode[nodeId] ?? [];
  if (configs.length === 0) return 0;
  const completeCount = configs.filter((c) => c.is_complete).length;
  return Math.round((completeCount / configs.length) * 100);
};

export const visitPlanMockStore = {
  getStore: loadStore,

  saveStore: persistStore,

  getVisitPlan(protocolId: number): VisitPlan {
    const store = loadStore();
    let plan = store.plans.find((p) => p.protocol_id === protocolId);
    let configsByNode = store.configsByNode;
    if (!plan) {
      const seeded = seedFromProtocols();
      persistStore(seeded);
      plan = seeded.plans.find((p) => p.protocol_id === protocolId) ?? seeded.plans[0];
      configsByNode = seeded.configsByNode;
    }
    const nodesWithCompleteness = plan.nodes.map((node) => ({
      ...node,
      completeness_percentage: nodeCompleteness(node.id, configsByNode),
    }));
    return { ...plan, nodes: nodesWithCompleteness };
  },

  updateVisitNode(nodeId: number, data: Partial<VisitNode>): VisitNode {
    let updatedNode: VisitNode | null = null;
    updateStore((store) => {
      const plans = store.plans.map((plan) => {
        const nodes = plan.nodes.map((node) => {
          if (node.id !== nodeId) return node;
          updatedNode = { ...node, ...data } as VisitNode;
          return updatedNode;
        });
        return { ...plan, nodes };
      });
      return { ...store, plans };
    });
    if (!updatedNode) {
      throw new Error("访视节点不存在");
    }
    const store = loadStore();
    const completeness = nodeCompleteness(nodeId, store.configsByNode);
    const node: VisitNode = updatedNode;
    return { ...node, completeness_percentage: completeness };
  },

  listActivityConfigs(visitNodeId: number): ActivityConfigListResponse {
    const store = loadStore();
    const configs = recalcCompleteness(store.configsByNode[visitNodeId] ?? []);
    const sorted = configs.sort((a, b) => a.order - b.order);
    return { items: sorted, total: sorted.length };
  },

  upsertConfig(
    visitNodeId: number,
    updater: (current: VisitActivityConfig[]) => VisitActivityConfig[]
  ): ActivityConfigListResponse {
    let items: VisitActivityConfig[] = [];
    updateStore((store) => {
      const existing = store.configsByNode[visitNodeId] ?? [];
      const nextConfigs = recalcCompleteness(updater(existing));
      store.configsByNode[visitNodeId] = nextConfigs;
      items = nextConfigs;
      return { ...store };
    });
    const sorted = items.sort((a, b) => a.order - b.order);
    return { items: sorted, total: sorted.length };
  },

  createConfig(visitNodeId: number, payload: Partial<VisitActivityConfig>): VisitActivityConfig {
    let created: VisitActivityConfig | null = null;
    updateStore((store) => {
      const nextId = store.nextConfigId++;
      const configs = store.configsByNode[visitNodeId] ?? [];
      const nextConfig: VisitActivityConfig = recalcCompleteness([
        {
          id: nextId,
          visit_node_id: visitNodeId,
          template_id: payload.template_id ?? null,
          template_name: payload.template_name ?? null,
          name: payload.name ?? "新检测项",
          category: payload.category ?? "instrument",
          order: payload.order ?? configs.length + 1,
          is_required: payload.is_required ?? true,
          instrument: payload.instrument ?? "",
          instrument_id: payload.instrument_id ?? null,
          sop_code: payload.sop_code ?? "",
          crf_id: payload.crf_id ?? null,
          executor_role: payload.executor_role ?? "",
          evaluator_role: payload.evaluator_role ?? "",
          duration: payload.duration ?? null,
          operation_spec: payload.operation_spec ?? {},
          is_complete: false,
          missing_fields: [],
          remarks: payload.remarks ?? "",
          created_at: nowIso(),
          updated_at: nowIso(),
        },
      ])[0];
      created = nextConfig;
      store.configsByNode[visitNodeId] = [...configs, nextConfig];
      return { ...store };
    });
    if (!created) {
      throw new Error("创建检测项失败");
    }
    return created;
  },

  updateConfig(configId: number, data: ActivityConfigUpdateRequest): VisitActivityConfig {
    let updated: VisitActivityConfig | null = null;
    updateStore((store) => {
      const nextConfigsByNode = { ...store.configsByNode };
      Object.entries(store.configsByNode).forEach(([nodeId, configs]) => {
        const mapped = configs.map((config) => {
          if (config.id !== configId) return config;
          const next = {
            ...config,
            ...data,
            updated_at: nowIso(),
          };
          updated = next;
          return next;
        });
        nextConfigsByNode[Number(nodeId)] = recalcCompleteness(mapped);
      });
      return { ...store, configsByNode: nextConfigsByNode };
    });
    if (!updated) {
      throw new Error("未找到检测项");
    }
    return updated;
  },

  deleteConfig(configId: number): { message: string } {
    let found = false;
    updateStore((store) => {
      const next: VisitPlanStoreV1 = { ...store, configsByNode: { ...store.configsByNode } };
      Object.entries(store.configsByNode).forEach(([nodeId, configs]) => {
        const filtered = configs.filter((c) => c.id !== configId);
        if (filtered.length !== configs.length) {
          found = true;
          next.configsByNode[Number(nodeId)] = filtered.map((c, idx) => ({ ...c, order: idx + 1 }));
        }
      });
      return next;
    });
    if (!found) throw new Error("检测项不存在");
    return { message: "deleted" };
  },

  reorderConfigs(visitNodeId: number, configIds: number[]): ActivityConfigListResponse {
    return this.upsertConfig(visitNodeId, (configs) => {
      const map = new Map(configs.map((c) => [c.id, c]));
      return configIds
        .map((id, idx) => {
          const item = map.get(id);
          if (!item) return null;
          return { ...item, order: idx + 1, updated_at: nowIso() };
        })
        .filter((c): c is VisitActivityConfig => Boolean(c));
    });
  },

  copyConfigToNodes(configId: number, targetNodeIds: number[]): ActivityConfigListResponse & { skipped_nodes: string[] } {
    const store = loadStore();
    let source: VisitActivityConfig | undefined;
    Object.values(store.configsByNode).forEach((configs) => {
      configs.forEach((c) => {
        if (c.id === configId) {
          source = c;
        }
      });
    });
    if (!source) throw new Error("源检测项不存在");

    const skipped: string[] = [];
    const created: VisitActivityConfig[] = [];

    updateStore((current) => {
      const next = { ...current, configsByNode: { ...current.configsByNode } };
      targetNodeIds.forEach((nodeId) => {
        const list = next.configsByNode[nodeId] ?? [];
        const exists = list.some((c) => c.name === source?.name);
        if (exists) {
          skipped.push(String(nodeId));
          return;
        }
        const newConfig: VisitActivityConfig = {
          ...source!,
          id: next.nextConfigId++,
          visit_node_id: nodeId,
          order: list.length + 1,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        created.push(newConfig);
        next.configsByNode[nodeId] = recalcCompleteness([...list, newConfig]);
      });
      return next;
    });

    return { items: created, total: created.length, skipped_nodes: skipped };
  },

  batchCreateFromTemplates(
    payload: BatchCreateFromTemplateRequest,
    templates: Array<{ id: number; name: string; category: string; default_duration?: number; default_executor_role?: string }>
  ): ActivityConfigListResponse & { skipped_nodes?: string[] } {
    const { visit_node_id, template_ids } = payload;
    const templateMap = new Map(templates.map((t) => [t.id, t]));
    const toCreate = template_ids
      .map((id) => templateMap.get(id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    const result = this.upsertConfig(visit_node_id, (configs) => {
      const base = [...configs];
      toCreate.forEach((tpl) => {
        base.push({
          id: 0,
          visit_node_id,
          template_id: tpl.id,
          template_name: tpl.name,
          name: tpl.name,
          category: tpl.category,
          order: base.length + 1,
          is_required: true,
          instrument: "",
          instrument_id: null,
          sop_code: "",
          crf_id: null,
          executor_role: tpl.default_executor_role ?? "",
          evaluator_role: "",
          duration: tpl.default_duration ?? null,
          operation_spec: {},
          is_complete: false,
          missing_fields: [],
          remarks: "",
          created_at: nowIso(),
          updated_at: nowIso(),
        });
      });
      return base.map((c, idx) => ({
        ...c,
        id: c.id === 0 ? loadStore().nextConfigId + idx : c.id,
        order: idx + 1,
      }));
    });

    // ensure ids are consistent after mutation
    updateStore((store) => {
      store.nextConfigId = Math.max(store.nextConfigId, ...result.items.map((c) => c.id + 1), store.nextConfigId);
      return store;
    });

    return result;
  },

  computePlanCompleteness(visitPlanId: number) {
    const store = loadStore();
    const plan = store.plans.find((p) => p.id === visitPlanId);
    if (!plan) throw new Error("访视计划不存在");
    const nodeResults = plan.nodes.map((node) => {
      const configs = recalcCompleteness(store.configsByNode[node.id] ?? []);
      const completeCount = configs.filter((c) => c.is_complete).length;
      const total = configs.length;
      return {
        visit_node_id: node.id,
        visit_node_code: node.code,
        visit_node_name: node.name,
        total_activities: total,
        complete_activities: completeCount,
        completeness_percentage: total === 0 ? 0 : Math.round((completeCount / total) * 100),
        incomplete_activities: configs.filter((c) => !c.is_complete).map((c) => ({
          activity_config_id: c.id,
          name: c.name,
          is_complete: c.is_complete,
          missing_fields: c.missing_fields,
        })),
      };
    });
    const completeNodes = nodeResults.filter((n) => n.completeness_percentage === 100).length;
    return {
      visit_plan_id: plan.id,
      total_nodes: nodeResults.length,
      complete_nodes: completeNodes,
      completeness_percentage: nodeResults.length === 0 ? 0 : Math.round((completeNodes / nodeResults.length) * 100),
      nodes: nodeResults,
    };
  },
};
