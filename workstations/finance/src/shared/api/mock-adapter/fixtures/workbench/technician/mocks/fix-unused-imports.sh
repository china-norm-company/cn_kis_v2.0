#!/bin/bash
# 批量修复未使用的导入

cd /Users/zhengjie/fszt_projects/yewu_mvp/frontend

# 1. 修复 instrument/index-mock.tsx
sed -i '' 's/const mockEquipments = equipments;//' src/pages/workbench/instrument/index-mock.tsx

# 2. 修复 protocols/components/ApprovalFlowViewer.tsx  
sed -i '' 's/currentNodeIndex,/\/\/ currentNodeIndex,/' src/pages/workbench/protocols/components/ApprovalFlowViewer.tsx

# 3. 修复 protocols/components/ProtocolFormViewer.tsx
sed -i '' 's/const hasData = formData/\/\/ const hasData = formData/' src/pages/workbench/protocols/components/ProtocolFormViewer.tsx

# 4. 修复 samples/index-table-mock.tsx
sed -i '' 's/Package,/\/\/ Package,/' src/pages/workbench/samples/index-table-mock.tsx
sed -i '' 's/type Sample,/\/\/ type Sample,/' src/pages/workbench/samples/index-table-mock.tsx
sed -i '' 's/type SubSample,/\/\/ type SubSample,/' src/pages/workbench/samples/index-table-mock.tsx

echo "✅ 修复完成"

