# utest_platform 受试者导入 — 运行手册

> 一次性/补录任务：从阿里云 MySQL `utest_platform.project_user_info` 同步到 V2 PostgreSQL `cn_kis_v2`。

## 1. 前置条件

1. **SSH 隧道**（本机 → 火山云 PG，端口与 `docs/DATABASE_CONNECTION_REFERENCE.md` 一致）：
   ```bash
   ssh -i <你的.pem> -f -N -L 25432:127.0.0.1:5432 root@118.196.64.48
   ```
2. **本机依赖**：`pip install pymysql psycopg2-binary`
3. **数据源**：脚本内 MySQL 只读账号（生产勿写入源库）；目标库密码见服务器 `backend/.env`，勿提交到 Git。

## 2. 脚本位置与用法

`ops/scripts/import_utest_subjects_standalone.py`

| 命令 | 说明 |
|------|------|
| `python3 ops/scripts/import_utest_subjects_standalone.py --dry-run` | 预览去重分组规模 |
| `python3 ops/scripts/import_utest_subjects_standalone.py` | 导入/更新受试者（逐条 autocommit，可中断续跑） |
| `python3 ... --with-enrollment` | 受试者完成后**再**批量写入 `t_enrollment` |
| `python3 ... --enrollment-only` | 仅补入组（受试者已存在时） |
| `python3 ... --dry-run --enrollment-only` | 仅统计可匹配的入组对数 |

## 3. 去重与最终人数说明

- 内存分组键：**身份证 SHA-256 > 手机号 > 姓名**；占位手机 `99999999999` 视为无手机。
- 写入 PG 时再次按 **身份证哈希 / 手机号** 与已有 `t_subject` 合并，因此**最终行数可能少于内存分组数**（典型约 **8.4k** 唯一人，以库内 `COUNT(*)` 为准）。
- **同一身份证多姓名**约 107 组：脚本取频次最高姓名，需在业务侧人工抽查 `t_subject_profile.id_card_hash`。

## 4. 入组（t_enrollment）

- 仅当 **`t_protocol.code` 与 utest `project_id` 大小写无关一致** 时才会插入入组行。
- 当前 V2 若仅有测试方案（如 `TEST-2026-001`），而 utest 为 `C23058001` 等，则**入组条数为 0 属正常**。
- 批量导入/对齐方案编码后，执行：
  ```bash
  python3 ops/scripts/import_utest_subjects_standalone.py --enrollment-only
  ```

## 5. 在「受试者管理系统」中是否可见

### 5.1 后端列表 API

- 路径：`GET /api/v1/subject/list`（需权限 `subject.subject.read`）。
- 与 **研究台** `SubjectListPage`、**招募台** `SubjectsPage` 使用同一列表能力（招募台查询参数 `keyword` 已与后端 `search` 对齐）。

### 5.2 数据权限（重要）

- **全局数据范围**账号：列表可见全部未软删受试者（`is_deleted=false`）。
- **项目级**账号：`list_subjects` 会按 `enrollments__protocol_id` 过滤；**未入组的导入受试者不会出现在项目级用户列表中**。补入组或调整为全局角色后即可见。

### 5.3 前端页面差异

| 入口 | 行为 |
|------|------|
| 研究台 → **受试者管理** | 默认不按状态过滤，**应能看到**导入的 `completed` 状态受试者（有全局读权限时）。 |
| 招募台 → **受试者** | 不传状态时列出全部；可按关键词搜索姓名/手机/编号。 |
| 部分页面（如预约/签到） | 可能固定 `status=active`，**已完成**受试者不会出现在这些列表，属产品设计，非导入故障。 |

### 5.4 自检 SQL（经隧道连 `cn_kis_v2`）

```sql
SELECT COUNT(*) FROM t_subject WHERE is_deleted = false;
SELECT COUNT(*) FROM t_subject_profile WHERE id_card_hash <> '';
SELECT COUNT(*) FROM t_enrollment;
```

## 6. 任务完成后

- 可关闭隧道：`pkill -f "ssh.*-L 25432"`（注意勿误杀其他隧道）。
- 敏感连接信息勿写入本仓库；若需改连库，优先环境变量扩展脚本（后续迭代）。
