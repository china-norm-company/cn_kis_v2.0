# 和序·接待台 (Reception)

## 本地开发

1. **启动后端**（与接待台共用同一后端，需先启动）  
   在项目根目录或 `backend` 目录执行，确保后端监听 `8001` 端口，例如：
   ```bash
   cd backend && python manage.py runserver 8001
   ```

2. **启动接待台前端**  
   在项目根目录执行：
   ```bash
   pnpm run dev:reception
   ```

3. **浏览器访问**  
   - 终端会输出实际访问地址，例如：`Local: http://localhost:3016/reception/`  
   - 若 3016 被占用，Vite 会自动改用 3017、3018… 等，请以终端显示的 **Local** 地址为准。  
   - 必须带路径 **`/reception/`**，例如：`http://localhost:3020/reception/`（端口以终端为准）。

4. **若出现「网络连接失败」**  
   - 确认后端已启动且可访问：浏览器打开 `http://localhost:8001/api/v1/health` 应有正常响应。  
   - 本仓库已配置 `.env` 中 `VITE_API_BASE_URL=http://localhost:8001/api/v1`，前端会直连后端；若后端端口不是 8001，请修改 `.env` 中该变量并重启 `pnpm run dev:reception`。

## 大屏投影

- 接待看板、大屏投影入口：侧栏或底部导航「大屏投影」，或直接访问：`http://localhost:<端口>/reception/#/display`  
- 大屏会请求 `GET /reception/display-board-data` 获取当日签到二维码与队列数据；需后端存在场所码（STATION）记录才会展示二维码。
