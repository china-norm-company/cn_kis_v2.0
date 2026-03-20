/**
 * 物料管理工作台 — 模拟数据工厂
 *
 * 人设：物料管理员 王度支
 * 公司：化妆品 CRO 机构
 * 场景：负责测试样品（化妆品）和实验耗材的全生命周期管理
 *
 * 数据覆盖：
 * - 8 个产品（3 测试样品 + 2 对照品 + 1 标准品 + 2 已过期）
 * - 16 个样品实例（覆盖 5 种状态）
 * - 6 种耗材（含 2 低库存 + 1 近效期）
 * - 22 条出入库流水
 * - 3 级效期预警
 * - 盘点记录
 * - 库位定义
 */

// ============================================================================
// 工具函数
// ============================================================================

const today = new Date().toISOString().split('T')[0]

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function isoFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600000).toISOString()
}

// ============================================================================
// 认证数据
// ============================================================================

export const AUTH_TOKEN = 'mock-e2e-token-material-manager'

export const MATERIAL_MANAGER_USER = {
  open_id: 'ou_material_manager_001',
  name: '王度支',
  avatar: '',
  email: 'wangduzhi@cnkis.test',
}

export const authProfileData = {
  id: 10,
  username: 'wangduzhi',
  display_name: '王度支',
  email: 'wangduzhi@cnkis.test',
  avatar: '',
  account_type: 'staff',
  roles: [
    { name: 'material_manager', display_name: '物料管理员', level: 5, category: 'resource' },
  ],
  permissions: [
    'resource.material.read',
    'resource.material.write',
    'resource.inventory.read',
    'resource.inventory.write',
    'resource.sample.read',
    'resource.sample.write',
    'resource.sample.destroy',
  ],
  data_scope: 'department',
  visible_workbenches: ['material'],
  visible_menu_items: {
    material: ['products', 'consumables', 'inventory', 'transactions', 'expiry-alerts', 'samples'],
  },
}

export const authProfileResponse = { code: 0, msg: 'ok', data: authProfileData }

// ============================================================================
// 产品台账（8 个产品）
// ============================================================================

export const productList = {
  items: [
    {
      id: 1, name: '美白精华液 A', code: 'PRD-2026-001', batch_number: 'BN20260115-A',
      specification: '30mL/瓶', storage_condition: '冷藏 2-8°C', expiry_date: daysFromNow(180),
      product_type: 'test_sample', product_type_display: '测试样品',
      sponsor: '华研美妆科技', protocol_name: '保湿美白功效评价',
      sample_count: 5, in_stock_count: 3, distributed_count: 2,
      status: 'active', create_time: '2026-01-15T10:00:00',
    },
    {
      id: 2, name: '美白精华液 B-对照', code: 'PRD-2026-002', batch_number: 'BN20260115-B',
      specification: '30mL/瓶', storage_condition: '冷藏 2-8°C', expiry_date: daysFromNow(180),
      product_type: 'placebo', product_type_display: '对照品',
      sponsor: '华研美妆科技', protocol_name: '保湿美白功效评价',
      sample_count: 5, in_stock_count: 4, distributed_count: 1,
      status: 'active', create_time: '2026-01-15T10:30:00',
    },
    {
      id: 3, name: '修复面霜 C', code: 'PRD-2026-003', batch_number: 'BN20260201-C',
      specification: '50g/罐', storage_condition: '阴凉 ≤20°C', expiry_date: daysFromNow(120),
      product_type: 'test_sample', product_type_display: '测试样品',
      sponsor: '东方本草', protocol_name: '屏障修复评价',
      sample_count: 8, in_stock_count: 5, distributed_count: 3,
      status: 'active', create_time: '2026-02-01T09:00:00',
    },
    {
      id: 4, name: '防晒乳 D', code: 'PRD-2026-004', batch_number: 'BN20260210-D',
      specification: '60mL/支', storage_condition: '常温 10-30°C', expiry_date: daysFromNow(240),
      product_type: 'test_sample', product_type_display: '测试样品',
      sponsor: '日光防护研究所', protocol_name: 'SPF测试',
      sample_count: 10, in_stock_count: 8, distributed_count: 2,
      status: 'active', create_time: '2026-02-10T14:00:00',
    },
    {
      id: 5, name: '安慰剂基质 E', code: 'PRD-2026-005', batch_number: 'BN20260101-E',
      specification: '30mL/瓶', storage_condition: '常温 10-30°C', expiry_date: daysFromNow(300),
      product_type: 'placebo', product_type_display: '安慰剂',
      sponsor: '通用', protocol_name: '通用对照',
      sample_count: 20, in_stock_count: 15, distributed_count: 5,
      status: 'active', create_time: '2026-01-01T09:00:00',
    },
    {
      id: 6, name: 'Corneometer 标准校准块', code: 'PRD-STD-001', batch_number: 'STD-2025-CK',
      specification: '1块', storage_condition: '常温 10-30°C', expiry_date: daysFromNow(365),
      product_type: 'standard', product_type_display: '标准品',
      sponsor: 'Courage+Khazaka', protocol_name: '仪器校准',
      sample_count: 2, in_stock_count: 2, distributed_count: 0,
      status: 'active', create_time: '2025-06-01T09:00:00',
    },
    {
      id: 7, name: '抗皱精华 F', code: 'PRD-2025-010', batch_number: 'BN20250601-F',
      specification: '30mL/瓶', storage_condition: '冷藏 2-8°C', expiry_date: daysFromNow(-15),
      product_type: 'test_sample', product_type_display: '测试样品',
      sponsor: '逆龄生物', protocol_name: '抗皱功效评价',
      sample_count: 6, in_stock_count: 2, distributed_count: 0,
      status: 'expired', create_time: '2025-06-01T09:00:00',
    },
    {
      id: 8, name: '祛斑霜 G', code: 'PRD-2025-011', batch_number: 'BN20250801-G',
      specification: '50g/罐', storage_condition: '阴凉 ≤20°C', expiry_date: daysFromNow(-5),
      product_type: 'test_sample', product_type_display: '测试样品',
      sponsor: '白肌坊', protocol_name: '祛斑美白评价',
      sample_count: 4, in_stock_count: 1, distributed_count: 0,
      status: 'expired', create_time: '2025-08-01T09:00:00',
    },
  ],
  total: 8,
}

export const productStats = {
  total_products: 8,
  active_batches: 6,
  expiring_soon: 1,
  expired: 2,
}

export const productDetail = {
  ...productList.items[0],
  description: '华研美妆科技委托进行的保湿美白功效评价用测试样品，含烟酰胺、熊果苷等美白成分。',
  batches: [
    { batch_number: 'BN20260115-A', quantity: 5, received_date: '2026-01-15', expiry_date: daysFromNow(180) },
  ],
  sample_summary: { total: 5, in_stock: 3, distributed: 2, returned: 0, destroyed: 0 },
  retention_info: { required: true, quantity: 2, location: '冷藏留样柜 R1-A3', release_date: daysFromNow(730) },
}

// ============================================================================
// 耗材管理（6 种耗材）
// ============================================================================

export const consumableList = {
  items: [
    {
      id: 101, name: 'Corneometer 探头保护膜', code: 'CSM-CORN-FILM', specification: '100片/盒',
      unit: '盒', current_stock: 2, safety_stock: 5, storage_condition: '常温',
      expiry_date: daysFromNow(300), status: 'low_stock', status_display: '库存不足',
      category: '仪器耗材', last_issue_date: daysFromNow(-3),
    },
    {
      id: 102, name: 'Tewameter 探头盖', code: 'CSM-TEWA-CAP', specification: '50个/包',
      unit: '包', current_stock: 8, safety_stock: 3, storage_condition: '常温',
      expiry_date: daysFromNow(400), status: 'normal', status_display: '正常',
      category: '仪器耗材', last_issue_date: daysFromNow(-7),
    },
    {
      id: 103, name: '75%酒精棉球', code: 'CSM-ALC-BALL', specification: '500个/桶',
      unit: '桶', current_stock: 1, safety_stock: 3, storage_condition: '阴凉',
      expiry_date: daysFromNow(90), status: 'low_stock', status_display: '库存不足',
      category: '通用耗材', last_issue_date: daysFromNow(-1),
    },
    {
      id: 104, name: '一次性检测手套 (M)', code: 'CSM-GLOVE-M', specification: '100只/盒',
      unit: '盒', current_stock: 15, safety_stock: 5, storage_condition: '常温',
      expiry_date: daysFromNow(500), status: 'normal', status_display: '正常',
      category: '通用耗材', last_issue_date: daysFromNow(-2),
    },
    {
      id: 105, name: '皮肤标记笔', code: 'CSM-MARKER', specification: '10支/盒',
      unit: '盒', current_stock: 6, safety_stock: 2, storage_condition: '常温',
      expiry_date: daysFromNow(600), status: 'normal', status_display: '正常',
      category: '通用耗材', last_issue_date: daysFromNow(-14),
    },
    {
      id: 106, name: 'pH 4.0 标准缓冲液', code: 'CSM-PH4-BUF', specification: '500mL/瓶',
      unit: '瓶', current_stock: 3, safety_stock: 2, storage_condition: '阴凉',
      expiry_date: daysFromNow(25), status: 'expiring', status_display: '近效期',
      category: '标准品', last_issue_date: daysFromNow(-30),
    },
  ],
  total: 6,
}

export const consumableStats = {
  total_types: 6,
  total_quantity: 35,
  low_stock_count: 2,
  expiring_count: 1,
}

// ============================================================================
// 样品实例（16 个样品）
// ============================================================================

export const sampleList = {
  items: [
    { id: 201, unique_code: 'SP-2026-0115-A001', product_id: 1, product_name: '美白精华液 A', product_code: 'PRD-2026-001', status: 'in_stock', status_display: '在库', current_holder: null, protocol_name: '保湿美白功效评价', storage_location: '冷藏区 R1-A1', retention: false, create_time: '2026-01-15T11:00:00' },
    { id: 202, unique_code: 'SP-2026-0115-A002', product_id: 1, product_name: '美白精华液 A', product_code: 'PRD-2026-001', status: 'distributed', status_display: '已分发', current_holder: '受试者 S001 张小花', protocol_name: '保湿美白功效评价', storage_location: null, retention: false, create_time: '2026-01-15T11:00:00' },
    { id: 203, unique_code: 'SP-2026-0115-A003', product_id: 1, product_name: '美白精华液 A', product_code: 'PRD-2026-001', status: 'distributed', status_display: '已分发', current_holder: '受试者 S002 李小兰', protocol_name: '保湿美白功效评价', storage_location: null, retention: false, create_time: '2026-01-15T11:00:00' },
    { id: 204, unique_code: 'SP-2026-0115-A004', product_id: 1, product_name: '美白精华液 A', product_code: 'PRD-2026-001', status: 'in_stock', status_display: '在库', current_holder: null, protocol_name: '保湿美白功效评价', storage_location: '冷藏区 R1-A1', retention: true, create_time: '2026-01-15T11:00:00' },
    { id: 205, unique_code: 'SP-2026-0115-A005', product_id: 1, product_name: '美白精华液 A', product_code: 'PRD-2026-001', status: 'in_stock', status_display: '在库', current_holder: null, protocol_name: '保湿美白功效评价', storage_location: '冷藏区 R1-A1', retention: true, create_time: '2026-01-15T11:00:00' },
    { id: 206, unique_code: 'SP-2026-0115-B001', product_id: 2, product_name: '美白精华液 B-对照', product_code: 'PRD-2026-002', status: 'distributed', status_display: '已分发', current_holder: '受试者 S003 王小红', protocol_name: '保湿美白功效评价', storage_location: null, retention: false, create_time: '2026-01-15T11:30:00' },
    { id: 207, unique_code: 'SP-2026-0201-C001', product_id: 3, product_name: '修复面霜 C', product_code: 'PRD-2026-003', status: 'returned', status_display: '已回收', current_holder: null, protocol_name: '屏障修复评价', storage_location: '阴凉区 R2-B1', retention: false, create_time: '2026-02-01T10:00:00' },
    { id: 208, unique_code: 'SP-2026-0201-C002', product_id: 3, product_name: '修复面霜 C', product_code: 'PRD-2026-003', status: 'distributed', status_display: '已分发', current_holder: '受试者 S010 陈小明', protocol_name: '屏障修复评价', storage_location: null, retention: false, create_time: '2026-02-01T10:00:00' },
    { id: 209, unique_code: 'SP-2026-0201-C003', product_id: 3, product_name: '修复面霜 C', product_code: 'PRD-2026-003', status: 'in_stock', status_display: '在库', current_holder: null, protocol_name: '屏障修复评价', storage_location: '阴凉区 R2-B1', retention: false, create_time: '2026-02-01T10:00:00' },
    { id: 210, unique_code: 'SP-2026-0210-D001', product_id: 4, product_name: '防晒乳 D', product_code: 'PRD-2026-004', status: 'in_stock', status_display: '在库', current_holder: null, protocol_name: 'SPF测试', storage_location: '常温区 R3-A1', retention: false, create_time: '2026-02-10T15:00:00' },
    { id: 211, unique_code: 'SP-2025-0601-F001', product_id: 7, product_name: '抗皱精华 F', product_code: 'PRD-2025-010', status: 'destroyed', status_display: '已销毁', current_holder: null, protocol_name: '抗皱功效评价', storage_location: null, retention: false, create_time: '2025-06-01T10:00:00' },
    { id: 212, unique_code: 'SP-2025-0601-F002', product_id: 7, product_name: '抗皱精华 F', product_code: 'PRD-2025-010', status: 'in_stock', status_display: '在库', current_holder: null, protocol_name: '抗皱功效评价', storage_location: '冷藏区 R1-C2', retention: true, create_time: '2025-06-01T10:00:00' },
    { id: 213, unique_code: 'SP-2026-0210-D002', product_id: 4, product_name: '防晒乳 D', product_code: 'PRD-2026-004', status: 'distributed', status_display: '已分发', current_holder: '受试者 S020 赵小丽', protocol_name: 'SPF测试', storage_location: null, retention: false, create_time: '2026-02-10T15:00:00' },
    { id: 214, unique_code: 'SP-2026-0101-E001', product_id: 5, product_name: '安慰剂基质 E', product_code: 'PRD-2026-005', status: 'consumed', status_display: '已消耗', current_holder: null, protocol_name: '通用对照', storage_location: null, retention: false, create_time: '2026-01-01T10:00:00' },
    { id: 215, unique_code: 'SP-2026-0201-C004', product_id: 3, product_name: '修复面霜 C', product_code: 'PRD-2026-003', status: 'distributed', status_display: '已分发', current_holder: '受试者 S011 刘小燕', protocol_name: '屏障修复评价', storage_location: null, retention: false, create_time: '2026-02-01T10:00:00' },
    { id: 216, unique_code: 'SP-2026-0201-C005', product_id: 3, product_name: '修复面霜 C', product_code: 'PRD-2026-003', status: 'in_stock', status_display: '在库', current_holder: null, protocol_name: '屏障修复评价', storage_location: '阴凉区 R2-B2', retention: true, create_time: '2026-02-01T10:00:00' },
  ],
  total: 16,
}

export const sampleStats = {
  total: 16,
  in_stock: 7,
  distributed: 5,
  returned: 1,
  consumed: 1,
  destroyed: 1,
  retention: 4,
}

export const sampleDetail = {
  ...sampleList.items[1],
  transactions: [
    { id: 501, transaction_type: 'inbound', transaction_type_display: '入库', operator_name: '王度支', remarks: '华研美妆科技第一批样品接收', create_time: '2026-01-15T11:00:00' },
    { id: 502, transaction_type: 'distribute', transaction_type_display: '分发', operator_name: '王度支', enrollment_id: 1, subject_name: '受试者 S001 张小花', remarks: '按随机化方案分发', create_time: '2026-01-20T09:30:00' },
  ],
}

export const traceResult = {
  sample: sampleList.items[1],
  timeline: [
    { step: 1, action: '入库', operator: '王度支', date: '2026-01-15 11:00', detail: '华研美妆科技样品接收入库，存入冷藏区 R1-A1' },
    { step: 2, action: '分发', operator: '王度支', date: '2026-01-20 09:30', detail: '按随机化方案分发给受试者 S001 张小花' },
  ],
  related_samples: [
    { unique_code: 'SP-2026-0115-A001', status: '在库' },
    { unique_code: 'SP-2026-0115-A003', status: '已分发' },
  ],
}

// ============================================================================
// 出入库流水（22 条）
// ============================================================================

export const transactionList = {
  items: [
    { id: 601, transaction_type: 'inbound', type_display: '样品入库', material_name: '美白精华液 A', material_code: 'PRD-2026-001', batch_number: 'BN20260115-A', quantity: 5, unit: '瓶', operator_name: '王度支', related_document: '接收单 RCV-2026-001', remarks: '华研美妆科技第一批样品', create_time: '2026-01-15T10:30:00' },
    { id: 602, transaction_type: 'inbound', type_display: '样品入库', material_name: '美白精华液 B-对照', material_code: 'PRD-2026-002', batch_number: 'BN20260115-B', quantity: 5, unit: '瓶', operator_name: '王度支', related_document: '接收单 RCV-2026-001', remarks: '对照品同批到货', create_time: '2026-01-15T10:35:00' },
    { id: 603, transaction_type: 'inbound', type_display: '耗材入库', material_name: 'Corneometer 探头保护膜', material_code: 'CSM-CORN-FILM', batch_number: '', quantity: 10, unit: '盒', operator_name: '王度支', related_document: '采购单 PO-2026-003', remarks: '季度采购', create_time: '2026-01-10T14:00:00' },
    { id: 604, transaction_type: 'distribute', type_display: '样品分发', material_name: '美白精华液 A', material_code: 'PRD-2026-001', batch_number: 'BN20260115-A', quantity: 1, unit: '瓶', operator_name: '王度支', related_document: '受试者 S001', remarks: '随机化分配 - 试验组', create_time: '2026-01-20T09:30:00' },
    { id: 605, transaction_type: 'distribute', type_display: '样品分发', material_name: '美白精华液 A', material_code: 'PRD-2026-001', batch_number: 'BN20260115-A', quantity: 1, unit: '瓶', operator_name: '王度支', related_document: '受试者 S002', remarks: '随机化分配 - 试验组', create_time: '2026-01-20T09:45:00' },
    { id: 606, transaction_type: 'distribute', type_display: '样品分发', material_name: '美白精华液 B-对照', material_code: 'PRD-2026-002', batch_number: 'BN20260115-B', quantity: 1, unit: '瓶', operator_name: '王度支', related_document: '受试者 S003', remarks: '随机化分配 - 对照组', create_time: '2026-01-20T10:00:00' },
    { id: 607, transaction_type: 'issue', type_display: '耗材领用', material_name: 'Corneometer 探头保护膜', material_code: 'CSM-CORN-FILM', batch_number: '', quantity: 2, unit: '盒', operator_name: '张技评', related_document: '工单 WO-2026-015', remarks: '保湿美白项目检测', create_time: '2026-01-22T08:30:00' },
    { id: 608, transaction_type: 'issue', type_display: '耗材领用', material_name: '75%酒精棉球', material_code: 'CSM-ALC-BALL', batch_number: '', quantity: 1, unit: '桶', operator_name: '张技评', related_document: '工单 WO-2026-015', remarks: '日常检测消耗', create_time: '2026-01-22T08:35:00' },
    { id: 609, transaction_type: 'inbound', type_display: '样品入库', material_name: '修复面霜 C', material_code: 'PRD-2026-003', batch_number: 'BN20260201-C', quantity: 8, unit: '罐', operator_name: '王度支', related_document: '接收单 RCV-2026-005', remarks: '东方本草第一批', create_time: '2026-02-01T09:30:00' },
    { id: 610, transaction_type: 'distribute', type_display: '样品分发', material_name: '修复面霜 C', material_code: 'PRD-2026-003', batch_number: 'BN20260201-C', quantity: 1, unit: '罐', operator_name: '王度支', related_document: '受试者 S010', remarks: '屏障修复项目', create_time: '2026-02-05T10:00:00' },
    { id: 611, transaction_type: 'return', type_display: '样品回收', material_name: '修复面霜 C', material_code: 'PRD-2026-003', batch_number: 'BN20260201-C', quantity: 1, unit: '罐', operator_name: '王度支', related_document: '受试者 S010 访视2', remarks: '剩余量 35g（原50g）', create_time: '2026-02-12T14:00:00' },
    { id: 612, transaction_type: 'inbound', type_display: '样品入库', material_name: '防晒乳 D', material_code: 'PRD-2026-004', batch_number: 'BN20260210-D', quantity: 10, unit: '支', operator_name: '王度支', related_document: '接收单 RCV-2026-008', remarks: '日光防护研究所送样', create_time: '2026-02-10T14:30:00' },
    { id: 613, transaction_type: 'destroy', type_display: '样品销毁', material_name: '抗皱精华 F', material_code: 'PRD-2025-010', batch_number: 'BN20250601-F', quantity: 1, unit: '瓶', operator_name: '王度支', related_document: '销毁审批 DST-2026-001', remarks: '过期样品，质量部审批销毁', create_time: '2026-02-15T16:00:00' },
    { id: 614, transaction_type: 'issue', type_display: '耗材领用', material_name: '一次性检测手套 (M)', material_code: 'CSM-GLOVE-M', batch_number: '', quantity: 2, unit: '盒', operator_name: '李评估', related_document: '', remarks: '日常检测消耗', create_time: '2026-02-14T08:00:00' },
    { id: 615, transaction_type: 'issue', type_display: '耗材领用', material_name: 'Tewameter 探头盖', material_code: 'CSM-TEWA-CAP', batch_number: '', quantity: 1, unit: '包', operator_name: '张技评', related_document: '工单 WO-2026-022', remarks: 'TEWL检测', create_time: '2026-02-13T09:00:00' },
    { id: 616, transaction_type: 'distribute', type_display: '样品分发', material_name: '防晒乳 D', material_code: 'PRD-2026-004', batch_number: 'BN20260210-D', quantity: 1, unit: '支', operator_name: '王度支', related_document: '受试者 S020', remarks: 'SPF测试分发', create_time: '2026-02-12T10:00:00' },
    { id: 617, transaction_type: 'distribute', type_display: '样品分发', material_name: '修复面霜 C', material_code: 'PRD-2026-003', batch_number: 'BN20260201-C', quantity: 1, unit: '罐', operator_name: '王度支', related_document: '受试者 S011', remarks: '屏障修复项目', create_time: '2026-02-06T10:00:00' },
    { id: 618, transaction_type: 'issue', type_display: '耗材领用', material_name: '皮肤标记笔', material_code: 'CSM-MARKER', batch_number: '', quantity: 1, unit: '盒', operator_name: '李评估', related_document: '', remarks: '标记测试区域', create_time: '2026-02-01T08:30:00' },
    { id: 619, transaction_type: 'inbound', type_display: '耗材入库', material_name: '一次性检测手套 (M)', material_code: 'CSM-GLOVE-M', batch_number: '', quantity: 20, unit: '盒', operator_name: '王度支', related_document: '采购单 PO-2026-010', remarks: '季度补货', create_time: '2026-02-08T10:00:00' },
    { id: 620, transaction_type: 'distribute', type_display: '样品分发', material_name: '修复面霜 C', material_code: 'PRD-2026-003', batch_number: 'BN20260201-C', quantity: 1, unit: '罐', operator_name: '王度支', related_document: '受试者 S012', remarks: '屏障修复项目', create_time: '2026-02-07T10:00:00' },
    { id: 621, transaction_type: 'distribute', type_display: '样品分发', material_name: '防晒乳 D', material_code: 'PRD-2026-004', batch_number: 'BN20260210-D', quantity: 1, unit: '支', operator_name: '王度支', related_document: '受试者 S021', remarks: 'SPF测试分发', create_time: '2026-02-13T10:00:00' },
    { id: 622, transaction_type: 'return', type_display: '退回入库', material_name: '修复面霜 C', material_code: 'PRD-2026-003', batch_number: 'BN20260201-C', quantity: 1, unit: '罐', operator_name: '王度支', related_document: '受试者 S012 退出', remarks: '受试者退出，样品隔离存放', create_time: '2026-02-14T15:00:00' },
  ],
  total: 22,
}

export const transactionStats = {
  today_inbound: 0,
  today_outbound: 1,
  month_total: 22,
  abnormal_count: 0,
}

// ============================================================================
// 效期预警
// ============================================================================

export const expiryAlerts = {
  red: [
    { id: 701, material_name: '抗皱精华 F', material_code: 'PRD-2025-010', batch_number: 'BN20250601-F', expiry_date: daysFromNow(-15), days_remaining: -15, material_type: 'product', status: 'locked', status_display: '已锁定', location: '冷藏区 R1-C2' },
    { id: 702, material_name: '祛斑霜 G', material_code: 'PRD-2025-011', batch_number: 'BN20250801-G', expiry_date: daysFromNow(-5), days_remaining: -5, material_type: 'product', status: 'locked', status_display: '已锁定', location: '阴凉区 R2-C1' },
    { id: 703, material_name: 'pH 4.0 标准缓冲液', material_code: 'CSM-PH4-BUF', batch_number: 'BUF-2025-08', expiry_date: daysFromNow(5), days_remaining: 5, material_type: 'consumable', status: 'warning', status_display: '即将过期', location: '阴凉区 R2-A3' },
  ],
  orange: [
    { id: 704, material_name: 'pH 4.0 标准缓冲液', material_code: 'CSM-PH4-BUF', batch_number: 'BUF-2025-09', expiry_date: daysFromNow(25), days_remaining: 25, material_type: 'consumable', status: 'warning', status_display: '注意', location: '阴凉区 R2-A3' },
  ],
  yellow: [
    { id: 705, material_name: '75%酒精棉球', material_code: 'CSM-ALC-BALL', batch_number: 'ALC-2026-01', expiry_date: daysFromNow(80), days_remaining: 80, material_type: 'consumable', status: 'normal', status_display: '关注', location: '阴凉区 R2-A1' },
    { id: 706, material_name: '修复面霜 C', material_code: 'PRD-2026-003', batch_number: 'BN20260201-C', expiry_date: daysFromNow(120), days_remaining: 120, material_type: 'product', status: 'normal', status_display: '关注', location: '阴凉区 R2-B1' },
  ],
  stats: { red_count: 3, orange_count: 1, yellow_count: 2 },
}

// ============================================================================
// 库存管理
// ============================================================================

export const inventoryOverview = {
  cold_storage: { zone: '冷藏区 (2-8°C)', item_count: 12, capacity_usage: '60%', temperature: '4.2°C', humidity: '45%' },
  cool_storage: { zone: '阴凉区 (≤20°C)', item_count: 18, capacity_usage: '40%', temperature: '18.5°C', humidity: '50%' },
  room_storage: { zone: '常温区 (10-30°C)', item_count: 35, capacity_usage: '30%', temperature: '22.1°C', humidity: '48%' },
}

export const inventoryList = {
  items: [
    { id: 801, material_name: '美白精华液 A', material_code: 'PRD-2026-001', batch_number: 'BN20260115-A', location: '冷藏区 R1-A1', zone: 'cold', quantity: 3, unit: '瓶', status: 'normal' },
    { id: 802, material_name: '美白精华液 B-对照', material_code: 'PRD-2026-002', batch_number: 'BN20260115-B', location: '冷藏区 R1-A2', zone: 'cold', quantity: 4, unit: '瓶', status: 'normal' },
    { id: 803, material_name: '修复面霜 C', material_code: 'PRD-2026-003', batch_number: 'BN20260201-C', location: '阴凉区 R2-B1', zone: 'cool', quantity: 5, unit: '罐', status: 'normal' },
    { id: 804, material_name: '防晒乳 D', material_code: 'PRD-2026-004', batch_number: 'BN20260210-D', location: '常温区 R3-A1', zone: 'room', quantity: 8, unit: '支', status: 'normal' },
    { id: 805, material_name: '安慰剂基质 E', material_code: 'PRD-2026-005', batch_number: 'BN20260101-E', location: '常温区 R3-A2', zone: 'room', quantity: 15, unit: '瓶', status: 'normal' },
    { id: 806, material_name: '抗皱精华 F (留样)', material_code: 'PRD-2025-010', batch_number: 'BN20250601-F', location: '冷藏区 R1-C2', zone: 'cold', quantity: 1, unit: '瓶', status: 'locked' },
    { id: 807, material_name: 'Corneometer 探头保护膜', material_code: 'CSM-CORN-FILM', batch_number: '', location: '常温区 R3-B1', zone: 'room', quantity: 2, unit: '盒', status: 'low_stock' },
    { id: 808, material_name: '75%酒精棉球', material_code: 'CSM-ALC-BALL', batch_number: 'ALC-2026-01', location: '阴凉区 R2-A1', zone: 'cool', quantity: 1, unit: '桶', status: 'low_stock' },
  ],
  total: 8,
}

export const inventoryCheckRecord = {
  id: 901, check_date: daysFromNow(-3), status: 'completed', status_display: '已完成',
  checker: '王度支', total_items: 8, matched_items: 7, discrepancy_items: 1,
  discrepancies: [
    { material_name: '一次性检测手套 (M)', expected: 17, actual: 15, difference: -2, remarks: '可能未登记领用' },
  ],
}

// ============================================================================
// 库位定义
// ============================================================================

export const storageLocations = [
  { id: 1, zone: 'cold', zone_display: '冷藏区 (2-8°C)', shelf: 'R1', positions: ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2'] },
  { id: 2, zone: 'cool', zone_display: '阴凉区 (≤20°C)', shelf: 'R2', positions: ['A1', 'A2', 'A3', 'B1', 'B2', 'C1'] },
  { id: 3, zone: 'room', zone_display: '常温区 (10-30°C)', shelf: 'R3', positions: ['A1', 'A2', 'B1', 'B2', 'C1'] },
]

// ============================================================================
// 物料总览仪表盘
// ============================================================================

export const dashboardData = {
  products: productStats,
  consumables: consumableStats,
  samples: sampleStats,
  transactions: transactionStats,
  expiry: expiryAlerts.stats,
  inventory: {
    cold_count: 12,
    cool_count: 18,
    room_count: 35,
    last_check_date: daysFromNow(-3),
    check_result: '7/8 一致',
  },
}

// ============================================================================
// 批次管理
// ============================================================================

export const batchList = {
  items: [
    { id: 1, batch_no: 'BAT-20260115-0001', product_id: 1, product_name: '美白精华液 A', status: 'released', status_display: '已放行', quantity: 100, unit: '支', manufacture_date: '2026-01-10', expiry_date: '2027-01-10', supplier: '华研美妆科技', coa_number: 'COA-2026-001', create_time: '2026-01-15' },
    { id: 2, batch_no: 'BAT-20260116-0001', product_id: 2, product_name: '保湿面膜 B', status: 'pending', status_display: '待入库', quantity: 50, unit: '片', manufacture_date: '2026-01-12', expiry_date: '2027-06-12', supplier: '华研美妆科技', coa_number: 'COA-2026-002', create_time: '2026-01-16' },
    { id: 3, batch_no: 'BAT-20260117-0001', product_id: 3, product_name: '防晒喷雾 C', status: 'quarantine', status_display: '隔离中', quantity: 80, unit: '瓶', manufacture_date: '2026-01-05', expiry_date: '2027-01-05', supplier: '天然化妆品厂', coa_number: 'COA-2026-003', create_time: '2026-01-17' },
    { id: 4, batch_no: 'BAT-20260118-0001', product_id: 1, product_name: '美白精华液 A', status: 'expired', status_display: '已过期', quantity: 20, unit: '支', manufacture_date: '2025-01-10', expiry_date: '2025-12-31', supplier: '华研美妆科技', coa_number: 'COA-2025-099', create_time: '2025-01-18' },
  ],
  total: 4,
}

// ============================================================================
// 样品接收
// ============================================================================

export const receiptList = {
  items: [
    {
      id: 1,
      receipt_no: 'RCV-20260115-0001',
      product_name: '美白精华液 A',
      supplier: '华研美妆科技',
      courier: '顺丰速运',
      tracking_no: 'SF1234567890',
      expected_quantity: 20,
      received_quantity: 20,
      accepted_quantity: 20,
      rejected_quantity: 0,
      arrival_temperature: 4.5,
      status: 'accepted',
      status_display: '已接收',
      create_time: '2026-01-15 09:30',
      inspector: '王度支',
      batch_no: 'BN20260115-A',
      expiry_date: daysFromNow(180),
      packaging_ok: true,
      label_ok: true,
      quantity_ok: true,
      document_ok: true,
      temperature_ok: true,
      appearance_ok: true,
    },
    {
      id: 2,
      receipt_no: 'RCV-20260116-0001',
      product_name: '保湿面膜 B',
      supplier: '华研美妆科技',
      courier: '',
      tracking_no: '',
      expected_quantity: 15,
      received_quantity: 0,
      accepted_quantity: 0,
      rejected_quantity: 0,
      arrival_temperature: null,
      status: 'pending',
      status_display: '待验收',
      create_time: '2026-01-16 10:00',
      inspector: null,
      batch_no: '',
      expiry_date: null,
      packaging_ok: null,
      label_ok: null,
      quantity_ok: null,
      document_ok: null,
      temperature_ok: null,
      appearance_ok: null,
    },
    {
      id: 3,
      receipt_no: 'RCV-20260117-0001',
      product_name: '防晒喷雾 C',
      supplier: '天然化妆品厂',
      courier: '中通快递',
      tracking_no: 'ZT9876543210',
      expected_quantity: 30,
      received_quantity: 30,
      accepted_quantity: 28,
      rejected_quantity: 2,
      arrival_temperature: 22.0,
      status: 'accepted',
      status_display: '已接收',
      create_time: '2026-01-17 08:45',
      inspector: '王度支',
      batch_no: 'BN20260117-C',
      expiry_date: daysFromNow(240),
      packaging_ok: true,
      label_ok: true,
      quantity_ok: true,
      document_ok: true,
      temperature_ok: true,
      appearance_ok: true,
    },
    {
      id: 4,
      receipt_no: 'RCV-20260118-0001',
      product_name: '美白精华液 A',
      supplier: '华研美妆科技',
      courier: '圆通速递',
      tracking_no: 'YT5555555555',
      expected_quantity: 10,
      received_quantity: 10,
      accepted_quantity: 0,
      rejected_quantity: 10,
      arrival_temperature: 35.0,
      status: 'rejected',
      status_display: '已拒收',
      create_time: '2026-01-18 14:20',
      inspector: '王度支',
      batch_no: 'BN20260118-A',
      expiry_date: daysFromNow(180),
      packaging_ok: false,
      label_ok: true,
      quantity_ok: true,
      document_ok: true,
      temperature_ok: false,
      appearance_ok: false,
      rejection_reason: '到货温度超标，包装破损',
    },
  ],
  total: 4,
}

// ============================================================================
// 套件管理
// ============================================================================

export const kitList = {
  items: [
    { id: 1, kit_number: 'KIT-001', randomization_code: 'RAND-001', blinding_code: 'BLD-A01', product_id: 1, product_name: '美白精华液 A', status: 'available', status_display: '可用', subject_id: null, subject_code: null, assigned_at: null, quantity: 5 },
    { id: 2, kit_number: 'KIT-002', randomization_code: 'RAND-002', blinding_code: 'BLD-B01', product_id: 1, product_name: '美白精华液 A', status: 'assigned', status_display: '已分配', subject_id: 101, subject_code: 'S001', assigned_at: '2026-01-16 10:00', quantity: 5 },
    { id: 3, kit_number: 'KIT-003', randomization_code: 'RAND-003', blinding_code: 'BLD-A02', product_id: 2, product_name: '保湿面膜 B', status: 'distributed', status_display: '已分发', subject_id: 102, subject_code: 'S002', assigned_at: '2026-01-15 09:00', quantity: 3 },
    { id: 4, kit_number: 'KIT-004', randomization_code: 'RAND-004', blinding_code: 'BLD-B02', product_id: 1, product_name: '美白精华液 A', status: 'used', status_display: '已使用', subject_id: 103, subject_code: 'S003', assigned_at: '2026-01-10 08:00', quantity: 5 },
  ],
  total: 4,
}

// ============================================================================
// 分发记录
// ============================================================================

export const dispensingList = {
  items: [
    { id: 1, dispensing_no: 'DSP-20260116-0001', subject_id: 101, subject_code: 'S001', visit_code: 'V1', product_name: '美白精华液 A', quantity_dispensed: 2, status: 'confirmed', status_display: '已确认', prepared_at: '2026-01-16 09:00', dispensed_at: '2026-01-16 10:30', confirmed_at: '2026-01-16 11:00' },
    { id: 2, dispensing_no: 'DSP-20260117-0001', subject_id: 102, subject_code: 'S002', visit_code: 'V2', product_name: '保湿面膜 B', quantity_dispensed: 3, status: 'planned', status_display: '待备货', prepared_at: null, dispensed_at: null, confirmed_at: null },
    { id: 3, dispensing_no: 'DSP-20260118-0001', subject_id: 103, subject_code: 'S003', visit_code: 'V1', product_name: '美白精华液 A', quantity_dispensed: 1, status: 'prepared', status_display: '已备货', prepared_at: '2026-01-18 08:00', dispensed_at: null, confirmed_at: null },
  ],
  total: 3,
}

// ============================================================================
// 销毁审批
// ============================================================================

export const destructionList = {
  items: [
    { id: 1, destruction_no: 'DES-20260120-0001', destruction_reason: '过期废弃', destruction_method: '焚烧', sample_count: 5, applicant_name: '王度支', create_time: '2026-01-20 09:00', status: 'pending', status_display: '待审批' },
    { id: 2, destruction_no: 'DES-20260121-0001', destruction_reason: '质量不合格', destruction_method: '化学处理', sample_count: 3, applicant_name: '王度支', create_time: '2026-01-21 10:00', status: 'approved', status_display: '已批准' },
    { id: 3, destruction_no: 'DES-20260122-0001', destruction_reason: '项目结束剩余', destruction_method: '高压灭菌', sample_count: 8, applicant_name: '王度支', create_time: '2026-01-22 14:00', status: 'destroyed', status_display: '已销毁' },
  ],
  total: 3,
}

// ============================================================================
// 盘点执行
// ============================================================================

export const inventoryCheckHistory = {
  items: [
    { id: 901, check_date: '2026-01-20', checker: '王度支', total_items: 8, matched_items: 7, discrepancy_items: 1, status: 'in_progress', status_display: '进行中' },
    { id: 900, check_date: '2026-01-17', checker: '王度支', total_items: 8, matched_items: 8, discrepancy_items: 0, status: 'completed', status_display: '已完成' },
    { id: 899, check_date: '2026-01-14', checker: '王度支', total_items: 8, matched_items: 7, discrepancy_items: 1, status: 'completed', status_display: '已完成' },
  ],
  total: 3,
}

export const inventoryCheckDetail = {
  id: 901,
  check_no: 'IC-20260120-001',
  status: 'in_progress',
  status_display: '进行中',
  checker: '王度支',
  check_date: '2026-01-20 09:00',
  total_items: 4,
  matched_items: 3,
  discrepancy_items: 1,
  discrepancies: [
    { material_name: '一次性检测手套 (M)', expected: 17, actual: 15, difference: -2, remarks: '可能未登记领用' },
  ],
  items: [
    { id: 1, item_name: '美白精华液 A', system_quantity: 50, actual_quantity: null, difference: null, notes: '' },
    { id: 2, item_name: '保湿面膜 B', system_quantity: 30, actual_quantity: null, difference: null, notes: '' },
    { id: 3, item_name: '防晒喷雾 C', system_quantity: 25, actual_quantity: null, difference: null, notes: '' },
    { id: 4, item_name: '一次性检测手套 (M)', system_quantity: 17, actual_quantity: null, difference: null, notes: '' },
  ],
}

export const storageTree = [
  {
    id: 1,
    location_code: 'WH-01',
    name: '主库房',
    level: 1,
    temperature_zone: 'room',
    capacity: 500,
    current_count: 320,
    capacity_usage: '64%',
    children: [
      {
        id: 2,
        location_code: 'WH-01-A',
        name: 'A区-常温',
        level: 2,
        temperature_zone: 'room',
        capacity: 200,
        current_count: 150,
        capacity_usage: '75%',
        children: [],
      },
      {
        id: 3,
        location_code: 'WH-01-B',
        name: 'B区-冷藏',
        level: 2,
        temperature_zone: 'cold',
        capacity: 100,
        current_count: 80,
        capacity_usage: '80%',
        children: [],
      },
    ],
  },
  {
    id: 4,
    location_code: 'WH-02',
    name: '冷冻库',
    level: 1,
    temperature_zone: 'frozen',
    capacity: 200,
    current_count: 90,
    capacity_usage: '45%',
    children: [],
  },
]

// ============================================================================
// 温湿度记录
// ============================================================================

export const temperatureLogs = {
  items: [
    { id: 1, storage_location_id: 3, storage_location_name: 'B区-冷藏', temperature: 4.2, humidity: 45, recorded_at: '2026-01-20T09:00:00', is_abnormal: false, alarm_triggered: false, status: 'normal' },
    { id: 2, storage_location_id: 3, storage_location_name: 'B区-冷藏', temperature: 4.5, humidity: 46, recorded_at: '2026-01-20T09:30:00', is_abnormal: false, alarm_triggered: false, status: 'normal' },
    { id: 3, storage_location_id: 3, storage_location_name: 'B区-冷藏', temperature: 9.2, humidity: 50, recorded_at: '2026-01-20T10:00:00', is_abnormal: true, alarm_triggered: true, status: 'abnormal' },
    { id: 4, storage_location_id: 3, storage_location_name: 'B区-冷藏', temperature: 8.5, humidity: 48, recorded_at: '2026-01-20T10:30:00', is_abnormal: true, alarm_triggered: true, status: 'abnormal' },
    { id: 5, storage_location_id: 3, storage_location_name: 'B区-冷藏', temperature: 4.8, humidity: 44, recorded_at: '2026-01-20T11:00:00', is_abnormal: false, alarm_triggered: false, status: 'normal' },
  ],
  total: 5,
}

// ============================================================================
// 使用记录/依从性
// ============================================================================

export const usageRecords = {
  items: [
    { id: 1, dispensing_id: 1, subject_code: 'S001', product_name: '美白精华液 A', period_start: '2026-01-20', period_end: '2026-01-27', expected_usage: '2ml', actual_usage: '2ml', compliance_status: 'compliant', deviation_type: null, deviation_reported: false },
    { id: 2, dispensing_id: 2, subject_code: 'S002', product_name: '保湿面膜 B', period_start: '2026-01-20', period_end: '2026-01-27', expected_usage: '1片', actual_usage: '1片', compliance_status: 'compliant', deviation_type: null, deviation_reported: false },
    { id: 3, dispensing_id: 1, subject_code: 'S003', product_name: '美白精华液 A', period_start: '2026-01-20', period_end: '2026-01-27', expected_usage: '2ml', actual_usage: '1ml', compliance_status: 'minor_deviation', deviation_type: '用量不足', deviation_reported: false },
    { id: 4, dispensing_id: 3, subject_code: 'S004', product_name: '防晒喷雾 C', period_start: '2026-01-20', period_end: '2026-01-27', expected_usage: '3ml', actual_usage: '0ml', compliance_status: 'major_deviation', deviation_type: '未使用', deviation_reported: false },
  ],
  total: 4,
}

// ============================================================================
// 留样管理
// ============================================================================

export const retentionRecords = [
  { id: 1, retention_code: 'RET-001', product_name: '美白精华液 A', batch_no: 'BAT-001', quantity: 10, retention_date: '2026-01-15', expected_release_date: '2027-01-15', storage_location: 'B区-冷藏', status: 'retained', status_display: '在库' },
  { id: 2, retention_code: 'RET-002', product_name: '保湿面膜 B', batch_no: 'BAT-002', quantity: 5, retention_date: '2026-01-10', expected_release_date: '2027-01-10', storage_location: 'A区-常温', status: 'released', status_display: '已释放' },
  { id: 3, retention_code: 'RET-003', product_name: '防晒喷雾 C', batch_no: 'BAT-003', quantity: 8, retention_date: '2025-06-01', expected_release_date: '2025-12-31', storage_location: 'A区-常温', status: 'expired', status_display: '已过期' },
]
