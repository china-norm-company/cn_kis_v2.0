import type {
  OperationTemplate,
  TemplateCreateRequest,
  TemplateListResponse,
  TemplateUpdateRequest,
} from "@/entities/operation-template/domain";
import { canUseLocalStorage } from "@/shared/api/mock-adapter/mockStore";

interface OperationTemplateStoreV1 {
  version: 1;
  templates: OperationTemplate[];
  nextTemplateId: number;
}

const STORAGE_KEY = "operation_templates_store_v1";

const nowIso = () => new Date().toISOString();

const seedTemplates = (): OperationTemplateStoreV1 => {
  const base: OperationTemplate[] = [
    {
      id: 1,
      code: "TEMP-INST-001",
      name: "皮肤水分测量",
      category: "instrument",
      description: "Corneometer水分测量标准模板",
      default_instrument: "Corneometer CM 825",
      default_instrument_id: 101,
      default_sop_code: "SOP-HYD-001",
      default_crf_id: null,
      default_duration: 20,
      default_executor_role: "技师",
      default_operation_spec: { environment: "温度21-23℃", humidity: "45-55%" },
      required_fields: ["instrument_id", "duration", "executor_role"],
      applicable_study_types: ["efficacy"],
      is_active: true,
      is_system: true,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: 2,
      code: "TEMP-EVAL-001",
      name: "临床评估-敏感度",
      category: "evaluation",
      description: "面部敏感度临床评估表",
      default_instrument: "",
      default_instrument_id: null,
      default_sop_code: "SOP-EVAL-201",
      default_crf_id: 12,
      default_duration: 15,
      default_executor_role: "评估医师",
      default_operation_spec: {},
      required_fields: ["executor_role", "duration"],
      applicable_study_types: ["safety"],
      is_active: true,
      is_system: true,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: 3,
      code: "TEMP-QUES-001",
      name: "主观感受问卷",
      category: "questionnaire",
      description: "产品使用主观感受问卷",
      default_instrument: "",
      default_instrument_id: null,
      default_sop_code: "SOP-QUES-001",
      default_crf_id: 18,
      default_duration: 10,
      default_executor_role: "研究协调员",
      default_operation_spec: {},
      required_fields: ["executor_role"],
      applicable_study_types: ["efficacy", "safety"],
      is_active: true,
      is_system: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];

  return { version: 1, templates: base, nextTemplateId: base.length + 1 };
};

const loadStore = (): OperationTemplateStoreV1 => {
  if (!canUseLocalStorage()) return seedTemplates();
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (!existing) {
    const seeded = seedTemplates();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed = JSON.parse(existing) as OperationTemplateStoreV1;
    if (parsed && parsed.version === 1) {
      return parsed;
    }
  } catch {
    // fallthrough
  }
  const seeded = seedTemplates();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
};

const persistStore = (store: OperationTemplateStoreV1) => {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

const updateStore = (updater: (store: OperationTemplateStoreV1) => OperationTemplateStoreV1) => {
  const next = updater(loadStore());
  persistStore(next);
  return next;
};

const toListResponse = (templates: OperationTemplate[]): TemplateListResponse => ({
  items: templates,
  total: templates.length,
});

export const operationTemplateMockStore = {
  list(params?: { category?: string; search?: string; is_active?: boolean }): TemplateListResponse {
    const store = loadStore();
    let templates = [...store.templates];
    if (params?.category) {
      templates = templates.filter((tpl) => tpl.category === params.category);
    }
    if (params?.is_active !== undefined) {
      templates = templates.filter((tpl) => tpl.is_active === params.is_active);
    }
    if (params?.search) {
      const keyword = params.search.toLowerCase();
      templates = templates.filter(
        (tpl) =>
          tpl.name.toLowerCase().includes(keyword) ||
          tpl.code.toLowerCase().includes(keyword) ||
          tpl.description.toLowerCase().includes(keyword)
      );
    }
    return toListResponse(templates);
  },

  listByCategory(category: string): TemplateListResponse {
    return this.list({ category });
  },

  get(templateId: number): OperationTemplate {
    const tpl = loadStore().templates.find((t) => t.id === templateId);
    if (!tpl) throw new Error("模板不存在");
    return tpl;
  },

  create(data: TemplateCreateRequest): OperationTemplate {
    let created: OperationTemplate | null = null;
    updateStore((store) => {
      const next: OperationTemplate = {
        id: store.nextTemplateId++,
        code: data.code,
        name: data.name,
        category: (data.category as OperationTemplate["category"]) ?? "instrument",
        description: data.description ?? "",
        default_instrument: data.default_instrument ?? "",
        default_instrument_id: data.default_instrument_id ?? null,
        default_sop_code: data.default_sop_code ?? "",
        default_crf_id: data.default_crf_id ?? null,
        default_duration: data.default_duration ?? 30,
        default_executor_role: data.default_executor_role ?? "",
        default_operation_spec: data.default_operation_spec ?? {},
        required_fields: data.required_fields ?? [],
        applicable_study_types: data.applicable_study_types ?? [],
        is_active: data.is_active ?? true,
        is_system: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      created = next;
      return { ...store, templates: [...store.templates, next] };
    });
    if (!created) throw new Error("创建模板失败");
    return created;
  },

  update(templateId: number, data: TemplateUpdateRequest): OperationTemplate {
    let updated: OperationTemplate | null = null;
    updateStore((store) => {
      const templates = store.templates.map((tpl) => {
        if (tpl.id !== templateId) return tpl;
        const next: OperationTemplate = {
          ...tpl,
          ...data,
          category: data.category != null ? (data.category as OperationTemplate["category"]) : tpl.category,
          updated_at: nowIso(),
        };
        updated = next;
        return next;
      });
      return { ...store, templates };
    });
    if (!updated) throw new Error("模板不存在");
    return updated;
  },

  delete(templateId: number): { message: string } {
    let removed = false;
    updateStore((store) => {
      const filtered = store.templates.filter((tpl) => {
        if (tpl.id === templateId) removed = true;
        return tpl.id !== templateId;
      });
      return { ...store, templates: filtered };
    });
    if (!removed) throw new Error("模板不存在");
    return { message: "deleted" };
  },
};
