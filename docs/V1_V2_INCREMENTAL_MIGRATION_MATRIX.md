# V1 -> V2 Incremental Migration Matrix

## Scope

Source range: `cn_kis_v1.0` commit `e99a38815cd6..HEAD`

Target branch: `feature/common-v1-delta-migration`

Migration rule:

- `apps/*` in V1 maps to `workstations/*` in V2.
- Shared packages and backend paths stay aligned where present.
- Prefer `partial-transplant` over whole-file replacement when V2 has already evolved.

## Priority Order

1. Shared packages and auth/API contracts
2. Wechat mini runtime/config/auth
3. Material workstation routes and product flow
4. Backend `sample` / `identity` / `subject` support
5. Reception, scripts, and docs

## Status Legend

- `partial-transplant`: merge specific hunks or behaviors into an existing V2 file
- `direct-copy`: safe to copy mostly as-is
- `already-covered`: V2 already contains the useful behavior
- `no-target-yet`: V2 has no corresponding file yet
- `needs-design`: target exists conceptually, but migration path depends on V2 architecture
- `rewrite`: migrate content intent, not file body

## Matrix

| V1 file | V2 target | Handling | Notes |
| --- | --- | --- | --- |
| `apps/material/e2e/helpers/mock-data.ts` | `workstations/material/e2e/helpers/mock-data.ts` | `partial-transplant` | Add `project-sample-links` pilot/menu data without dropping V2 mock keys. |
| `apps/material/src/App.tsx` | `workstations/material/src/App.tsx` | `partial-transplant` | Add `/project-sample-links` route on top of existing V2 route tree. |
| `apps/material/src/components/CreateProductModal.tsx` | `workstations/material/src/pages/ProductLedgerPage.tsx` or new `workstations/material/src/components/CreateProductModal.tsx` | `partial-transplant` | V2 currently inlines create modal behavior inside ledger page. |
| `apps/material/src/layouts/AppLayout.tsx` | `workstations/material/src/layouts/AppLayout.tsx` | `partial-transplant` | Merge navigation entry for project-sample linkage, keep V2 menu items intact. |
| `apps/material/src/pages/ProductLedgerPage.tsx` | `workstations/material/src/pages/ProductLedgerPage.tsx` | `partial-transplant` | Merge product/project fields and modal behavior. |
| `apps/material/src/pages/ProjectSampleLinkagePage.tsx` | `workstations/material/src/pages/ProjectSampleLinkagePage.tsx` | `no-target-yet` | New V2 page plus route and nav entry. |
| `apps/material/src/pages/sample-distribution/SubjectReceiptTab.tsx` | `workstations/material/src/pages/sample-distribution/SubjectReceiptTab.tsx` | `partial-transplant` | Reintroduce project/protocol columns and data parsing fixes as needed. |
| `apps/material/src/pages/sample-distribution/SubjectReturnTab.tsx` | `workstations/material/src/pages/sample-distribution/SubjectReturnTab.tsx` | `partial-transplant` | Same as receipt tab. |
| `apps/material/vite.config.ts` | `workstations/material/vite.config.ts` | `partial-transplant` | Merge strict port/open behavior only if still useful under V2 dev flow. |
| `apps/reception/src/layouts/AppLayout.tsx` | `workstations/reception/src/layouts/AppLayout.tsx` | `partial-transplant` | Merge only API base and menu tweaks that still match V2 information architecture. |
| `apps/reception/src/pages/AppointmentsPage.tsx` | `workstations/reception/src/pages/AppointmentsPage.tsx` | `partial-transplant` | V2 page is more evolved; migrate only missing appointment behaviors. |
| `apps/wechat-mini/.env.example` | `workstations/wechat-mini/.env.example` | `no-target-yet` | Create only if V2 keeps per-workstation env templates. |
| `apps/wechat-mini/PREVIEW.md` | `workstations/wechat-mini/README.md` or new docs file | `rewrite` | Carry over runbook content, not filename/layout. |
| `apps/wechat-mini/config/index.ts` | `workstations/wechat-mini/config/index.ts` | `partial-transplant` | Merge direct API and env handling into V2 config without losing monorepo include settings. |
| `apps/wechat-mini/package.json` | `workstations/wechat-mini/package.json` | `partial-transplant` | Keep V2 subject-core prebuild and package set; only merge needed scripts/deps. |
| `apps/wechat-mini/project.config.json` | `workstations/wechat-mini/project.config.json` | `partial-transplant` | Field-level merge only. |
| `apps/wechat-mini/scripts/fix-and-open-wechat-dev.ps1` | `workstations/wechat-mini/scripts/` | `no-target-yet` | Optional helper script if V2 still needs Windows WeChat DevTools automation. |
| `apps/wechat-mini/scripts/load-env-for-taro.cjs` | `workstations/wechat-mini/scripts/` or config/package rewrite | `needs-design` | Likely better expressed via V2 config/build scripts than copied directly. |
| `apps/wechat-mini/src/components/ui/MiniButton.tsx` | `workstations/wechat-mini/src/components/ui/MiniButton.tsx` | `already-covered` | Only minor comment/className alignment if needed. |
| `apps/wechat-mini/src/pages/checkin/index.tsx` | `workstations/wechat-mini/src/pages/checkin/index.tsx` | `partial-transplant` | Merge V1 behavior delta only. |
| `apps/wechat-mini/src/pages/index/index.tsx` | `workstations/wechat-mini/src/pages/index/index.tsx` | `partial-transplant` | Entry page differs; apply net behavior changes only. |
| `apps/wechat-mini/src/pages/products/detail.tsx` | `workstations/wechat-mini/src/pages/products/detail.tsx` | `partial-transplant` | Merge refresh/HTTPS/direct-request behavior carefully. |
| `apps/wechat-mini/src/pages/products/index.tsx` | `workstations/wechat-mini/src/pages/products/index.tsx` | `partial-transplant` | Merge list refresh and sample/product display changes. |
| `apps/wechat-mini/src/pages/sample-confirm/index.tsx` | `workstations/wechat-mini/src/pages/sample-confirm/index.tsx` | `partial-transplant` | Merge button logic and payload handling fixes. |
| `apps/wechat-mini/src/pages/sample-return/index.tsx` | `workstations/wechat-mini/src/pages/sample-return/index.tsx` | `partial-transplant` | Merge return button/data handling fixes. |
| `apps/wechat-mini/src/utils/api.ts` | `workstations/wechat-mini/src/utils/api.ts` | `partial-transplant` | High priority: merge direct API / HTTPS base selection behavior into V2. |
| `apps/wechat-mini/src/utils/auth.ts` | `workstations/wechat-mini/src/utils/auth.ts` | `partial-transplant` | High priority: merge phone auth/JWT and current API base usage into V2 auth flow. |
| `backend/apps/finance/migrations/0018_merge_invoice_type_and_legacyinvoice_branches.py` | `backend/apps/finance/migrations/` | `needs-design` | Migration graph differs in V2; do not copy blindly. |
| `backend/apps/identity/api.py` | `backend/apps/identity/api.py` | `partial-transplant` | Merge login/phone-auth API deltas only. |
| `backend/apps/identity/management/commands/grant_receptionist.py` | `backend/apps/identity/management/commands/grant_receptionist.py` | `no-target-yet` | Safe new command if still useful for environment setup. |
| `backend/apps/identity/management/commands/seed_roles.py` | `backend/apps/identity/management/commands/seed_roles.py` | `partial-transplant` | Reconcile role seeds with V2 role matrix. |
| `backend/apps/identity/services.py` | `backend/apps/identity/services.py` | `partial-transplant` | Red-line file per charter; merge refresh-token and OAuth behavior very carefully. |
| `backend/apps/sample/api_material.py` | `backend/apps/sample/api_material.py` | `partial-transplant` | High priority backend support for material linkage flow. |
| `backend/apps/sample/api_product_management.py` | `backend/apps/sample/api_product_management.py` | `partial-transplant` | High priority backend support for product linkage flow. |
| `backend/apps/sample/management/commands/seed_project_sample_linkage_demo.py` | `backend/apps/sample/management/commands/seed_project_sample_linkage_demo.py` | `no-target-yet` | V2 currently lacks `sample/management/commands`. |
| `backend/apps/sample/management/commands/seed_wx_mini_sample_flow.py` | `backend/apps/sample/management/commands/seed_wx_mini_sample_flow.py` | `no-target-yet` | Same as above. |
| `backend/apps/sample/management/commands/show_recent_sample_records.py` | `backend/apps/sample/management/commands/show_recent_sample_records.py` | `no-target-yet` | Same as above. |
| `backend/apps/sample/migrations/0005_add_product_study_project_type.py` | `backend/apps/sample/migrations/0005_add_product_study_project_type.py` | `needs-design` | V2 migration chain stops at `0004`; add only with matching model/schema changes. |
| `backend/apps/sample/models.py` | `backend/apps/sample/models.py` | `partial-transplant` | Likely missing `study_project_type`; blocks product/linkage flow. |
| `backend/apps/sample/services/product_management_service.py` | `backend/apps/sample/services/product_management_service.py` | `partial-transplant` | Merge service support tied to product study-project type. |
| `backend/apps/sample/services_material.py` | `backend/apps/sample/services_material.py` | `partial-transplant` | Merge linkage/receipt/return parsing changes. |
| `backend/apps/secretary/api.py` | `backend/apps/secretary/api.py` | `partial-transplant` | Only move truly needed auth-related delta. |
| `backend/apps/subject/api_my.py` | `backend/apps/subject/api_my.py` | `partial-transplant` | Merge my-profile/product sample flow deltas without regressing V2 authz. |
| `backend/apps/subject/api_reception.py` | `backend/apps/subject/api_reception.py` | `partial-transplant` | Merge appointment/reception flow deltas only. |
| `backend/apps/subject/migrations/0015_add_visit_point_to_appointment.py` | `backend/apps/subject/migrations/0015_add_visit_point_to_appointment.py` | `needs-design` | V2 has a no-op placeholder; migration history must be reconciled before copying. |
| `docs/MINI_MATERIAL_SAMPLE_LINKAGE.md` | `docs/` | `rewrite` | Keep business rules, update paths/commands for V2. |
| `docs/RECEPTION_LOGIN_AND_PLAN_A.md` | `docs/` | `rewrite` | Fold into V2 auth/deploy docs as appropriate. |
| `docs/REQUIREMENTS_SAMPLE_RECEIPT_AND_MANAGEMENT.md` | `docs/` | `rewrite` | Business requirements can be preserved, implementation notes need V2 wording. |
| `docs/WECHAT_MINI_SAMPLE_E2E_RUNBOOK.md` | `docs/` | `rewrite` | Keep test flow, rewrite for V2 scripts and URLs. |
| `docs/WECHAT_MINI_SAMPLE_REAL_DEPLOY.md` | `docs/` | `rewrite` | Align with `DEPLOY_VOLCENGINE_V2.md` and V2 deployment steps. |
| `package.json` | `package.json` | `partial-transplant` | Merge only necessary scripts/deps; regenerate lockfile from V2 manifests. |
| `packages/api-client/src/modules/material.ts` | `packages/api-client/src/modules/material.ts` | `partial-transplant` | High priority shared contract for product/material linkage fields. |
| `packages/api-client/src/modules/reception.ts` | `packages/api-client/src/modules/reception.ts` | `partial-transplant` | Merge only missing appointment/subject helper APIs. |
| `packages/feishu-sdk/src/auth.ts` | `packages/feishu-sdk/src/auth.ts` | `partial-transplant` | High priority auth behavior alignment. |
| `packages/feishu-sdk/src/config.ts` | `packages/feishu-sdk/src/config.ts` | `partial-transplant` | High priority redirect/base URL behavior alignment. |
| `packages/subject-core/src/api/endpoints.ts` | `packages/subject-core/src/api/endpoints.ts` | `partial-transplant` | Merge product/sample endpoint helpers without dropping V2 additions. |
| `packages/subject-core/src/models/product.ts` | `packages/subject-core/src/models/product.ts` | `partial-transplant` | Add missing product fields/helpers such as display formatter if still absent. |
| `pnpm-lock.yaml` | `pnpm-lock.yaml` | `needs-design` | Never copy from V1; regenerate after manifest changes. |
| `scripts/dev-backend-mini-sqlite.ps1` | `scripts/` or `ops/scripts_v1/` | `rewrite` | V2 has no matching local backend launcher. |
| `scripts/dev-backend-mini.ps1` | `scripts/` or `ops/scripts_v1/` | `rewrite` | Same as above. |
| `scripts/dev-backend-mini.sh` | `scripts/` or `ops/scripts_v1/` | `rewrite` | Same as above. |
| `scripts/merge_feishu_from_plan_a.py` | `ops/scripts_v1/` or `scripts/` | `partial-transplant` | Logic reusable, but root path and env assumptions need adaptation. |
| `scripts/start-material.ps1` | `scripts/` | `rewrite` | Add only if V2 still needs a Windows helper for material workstation startup. |

## Immediate Execution Set

Start with these files first:

- `packages/feishu-sdk/src/config.ts`
- `packages/feishu-sdk/src/auth.ts`
- `packages/subject-core/src/models/product.ts`
- `packages/subject-core/src/api/endpoints.ts`
- `packages/api-client/src/modules/material.ts`
- `workstations/wechat-mini/src/utils/api.ts`
- `workstations/wechat-mini/src/utils/auth.ts`
- `backend/apps/sample/models.py`
- `backend/apps/sample/api_product_management.py`
- `backend/apps/identity/services.py`

These ten files carry the highest leverage for login, API contract alignment, product metadata, and the material/wechat linkage path.
