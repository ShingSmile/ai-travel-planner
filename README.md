# AI 旅行规划师（Web）

汇集 LLM 行程生成、预算管理、语音录入与地图展示的全栈示例应用。前端基于 **Next.js 16 + React 19**，后端使用 **Next.js API Routes** 搭配 **Supabase** 提供认证、数据库与实时能力。

---

## 功能亮点

- 🧠 **智能行程生成**：调用阿里云百炼（或兼容 OpenAI API 的模型）输出结构化行程、预算及提示信息。
- 📅 **行程管理**：记录每日活动、交通、备注，可随时编辑、删除、重新生成；「我的行程」列表支持状态筛选与搜索。
- 💰 **预算 & 费用**：支持 LLM 预算拆分、手动新增费用、预算阈值提醒。
- 🗺️ **地图联动**：高德地图展示每日线路，活动卡片与地图点位双向高亮，并通过真实路线规划替代直线连线。
- 🎙️ **语音辅助**：内置语音录制组件，可上传识别结果回填表单或自动生成费用草稿。
- 🔁 **实时同步 & 通知**：Supabase Realtime 推送行程/费用变更；预算超支、行程开始等事件触发提醒。
- 📦 **部署友好**：提供多阶段 Dockerfile、`docker-compose` 与 GitHub Actions CI/CD。

---

## 快速开始

### 1. 环境准备

- Node.js **v20+**（推荐配合 `corepack` 管理 npm）
- Supabase CLI（可选，用于本地数据库与认证服务）
- Docker / Docker Compose（可选，用于一键启动整套服务）

### 2. 克隆与安装依赖

```bash
git clone <your-repo-url> ai-travel-planner
cd ai-travel-planner
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env.local
```

- 根据实际账号修改 `.env.local`。
- 如需 Docker 运行，可参考 `.env.docker`。

### 4. 初始化 Supabase

```bash
# 首次使用 Supabase CLI（仅需一次）
supabase login                # 会打开浏览器完成授权
supabase init                 # 生成 supabase/config.toml
# 如需将本地目录绑定到远程项目，执行（可选）
supabase link --project-ref <your-project-ref>

# 启动本地服务（可选）
supabase start

# 将 migrations 目录中的全部 SQL 推送到当前 Supabase 实例
supabase db push

# 或仅执行指定 SQL（例如直接对远程项目运行）
supabase db execute --file supabase/migrations/20241102_init_schema.sql
```

> 若未使用 Supabase CLI，可登录 Supabase 控制台，在 SQL Editor 执行迁移脚本。
>
> ⚠️ 语音录制/上传依赖 Supabase Storage 中名为 `voice-inputs` 的公共 bucket 以及对应 RLS 策略，相关 SQL 已包含在 `supabase/migrations/20241114_add_voice_storage.sql`。拉取最新代码后请重新执行 `supabase db push`（或在控制台运行该脚本），否则 `/api/voice-inputs` 会在写入 Storage 时返回 `storage_upload_failed` → 前端看到 “音频上传失败，请稍后重试”。

### 5. 启动开发服务器

```bash
npm run dev
```

打开 `http://localhost:3000`，使用 Supabase 注册的账号登录即可体验。

---

## 环境变量说明

完整示例见 `.env.example`。常用键位说明如下：

| 变量                                                              | 说明                               | 备注                                                                              |
| ----------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`                       | Supabase 项目 URL                  | 本地默认为 `http://127.0.0.1:54321`                                               |
| `SUPABASE_SERVICE_ROLE_KEY`                                       | 服务端密钥                         | 仅后端使用，务必避免泄露                                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                   | 前端匿名密钥                       | 一级权限，仍需安全存储                                                            |
| `SUPABASE_JWT_SECRET`                                             | Supabase JWT 签名用 secret         | 与 Supabase 项目保持一致                                                          |
| `LLM_PROVIDER`                                                    | LLM 客户端模式                     | `bailian`（默认）或 `openai`（兼容 OpenAI/百炼）                                  |
| `BAILIAN_API_KEY` / `BAILIAN_MODEL`                               | 大模型访问凭证                     | `LLM_PROVIDER=openai` 时可复用 `OPENAI_API_KEY`                                   |
| `BAILIAN_API_BASE_URL`                                            | LLM 服务地址                       | 默认原生接口；兼容模式可填 `.../compatible-mode/v1`（无需加 `/chat/completions`） |
| `LLM_ENABLE_NORMALIZATION_FALLBACKS`                              | 是否启用行程兜底逻辑               | 默认关闭以保留模型原始输出；设为 `true/1/yes` 可恢复旧的占位数据                  |
| `LLM_DEBUG_STRUCTURED_OUTPUT`                                     | 输出 LLM 原始/归一化调试信息       | 设为 `true/1/yes` 后会在服务端日志打印，便于定位 Schema 失败                      |
| `NEXT_PUBLIC_AMAP_KEY` / `AMAP_REST_KEY`                          | 高德 JS SDK 与 Web 服务密钥        | 前端需配置 Referer 白名单                                                         |
| `NEXT_PUBLIC_AMAP_SECURITY_CODE`                                  | 高德 JS SDK 安全密钥（可选但推荐） | 启用安全密钥后必须传入，否则会出现 `INVALID_USER_SCODE`                           |
| `VOICE_RECOGNIZER_PROVIDER`                                       | 语音识别提供商                     | 默认 `mock`，可切换 `iflytek`/`openai`                                            |
| `IFLYTEK_APP_ID` / `IFLYTEK_API_KEY` / `IFLYTEK_API_SECRET`       | 讯飞语音听写凭证（流式 WebSocket） | `VOICE_RECOGNIZER_PROVIDER=iflytek` 时必填                                        |
| `IFLYTEK_API_BASE_URL` / `IFLYTEK_DOMAIN` / `IFLYTEK_LANGUAGE` 等 | 讯飞流式参数（可选）               | 默认 `wss://iat-api.xfyun.cn/v2/iat`、`iat`、`zh_cn`                              |
| `VOICE_RECOGNIZER_TIMEOUT_MS`                                     | 语音识别超时时间（毫秒）           | 默认 `45000`                                                                      |
| `VOICE_RECOGNIZER_MOCK_TRANSCRIPT`                                | Mock 识别返回文本                  | 本地快速演示可填写                                                                |
| `OPENAI_API_KEY` / `OPENAI_VOICE_MODEL`                           | OpenAI 语音识别凭证与模型          | 例：`gpt-4o-mini-transcribe`                                                      |
| `NEXT_PUBLIC_TRIP_INTENT_ANALYTICS_ENDPOINT`                      | 行程意图解析埋点上报地址           | 可选，若留空则仅在前端控制台缓存事件                                              |
| `SMTP_HOST` 等                                                    | 邮件通知配置                       | 启用预算提醒或行程提醒时必填                                                      |
| `GLOBAL_API_RATE_LIMIT_*`                                         | 全局限流参数                       | 毫秒窗口 & 最大次数，可在生产调优                                                 |

更多字段（如 NextAuth、Playwright 绕过凭证）可参考 `.env.example` 注释。

### LLM 输出映射提示

- 后端会尝试把模型返回的 `dailyItinerary` / `dailyPlans` / `itinerary` 字段映射为 Schema 所需的 `days`，并把 `budgetBreakdown`、`totalEstimatedCostCNY` 等整理进 `budget`。
- 仍请在提示词中严格使用 Schema 中的字段名，避免输出额外键导致 JSON 校验失败；可以开启 `LLM_DEBUG_STRUCTURED_OUTPUT` 观察模型原始回包。

当 `VOICE_RECOGNIZER_PROVIDER` 设置为 `iflytek` 时，请填写 `IFLYTEK_APP_ID`、`IFLYTEK_API_KEY`、`IFLYTEK_API_SECRET` 并确保已在讯飞控制台开通“语音听写·流式 WebSocket”接口；如需自定义识别领域或语种，可通过 `IFLYTEK_DOMAIN`（默认 `iat`）、`IFLYTEK_LANGUAGE`、`IFLYTEK_ACCENT`、`IFLYTEK_VAD_EOS` 等参数调整。需要备用方案时，可将 Provider 切换为 `openai`，并配置对应的 `OPENAI_API_KEY`/`OPENAI_VOICE_MODEL`；演示场景可使用 `mock` 并通过 `VOICE_RECOGNIZER_MOCK_TRANSCRIPT` 返回固定文本。

- 已内置 `ffmpeg-static`，后端会在调用讯飞接口前自动将浏览器上传的 WebM/M4A 转码为 16k PCM；拉取代码后执行 `npm install` 才能下载对应平台的 ffmpeg 可执行文件。若部署在精简容器内，请确保具备 `libstdc++` 等基础依赖，否则转码会失败并导致 `/api/voice-inputs` 返回 502。
- 若运行在 Alpine/Distroless 等无法直接执行 `ffmpeg-static` 的环境，请单独安装系统级 `ffmpeg` 并在环境变量中设置 `FFMPEG_PATH=/usr/bin/ffmpeg`（或对应路径），后端会优先使用该可执行文件完成转码。

---

## 常用脚本

| 命令                 | 描述                                                           |
| -------------------- | -------------------------------------------------------------- |
| `npm run dev`        | 启动开发服务器（http://localhost:3000）                        |
| `npm run build`      | 构建生产包                                                     |
| `npm run start`      | 以生产模式运行                                                 |
| `npm run lint`       | ESLint + Prettier 校验                                         |
| `npm run test:e2e`   | Playwright 端到端测试（会自动拉起本地服务）                    |
| `npm run export:pdf` | 生成 README 与实现指南的 PDF（首次需下载 Playwright Chromium） |
| `npm run format`     | 使用 Prettier 全量格式化                                       |

---

## Docker 部署

```bash
# 构建镜像
docker build -t ai-travel-planner:latest .

# 或直接使用 compose 启动（包含 supabase/postgres 依赖）
docker compose up --build
```

- 先执行 `cp .env.docker .env.docker.local` 并写入真实值；该文件已通过 `.gitignore` / `.dockerignore` 屏蔽，内容不会进入 Git 仓库或镜像构建上下文。
- 构建镜像时，Next.js 会读取当前终端的环境变量：可以运行 `export $(grep -v '^#' .env.docker.local | xargs)` 后再执行 `docker build ...`，或在 CI/CD 中通过 Secrets 注入。
- 运行容器时使用 `docker run --env-file .env.docker.local ...`，`docker compose` 版本会自动将该文件作为 `env_file` 注入。
- 默认镜像导出 `3000` 端口，可通过 `PORT` 环境变量覆盖。

### 使用已发布的阿里云镜像

仓库地址：`crpi-delxamk1feq08x2x.cn-hangzhou.personal.cr.aliyuncs.com/qiqingfeng/ai-travel-planner`

> 评测环境可向作者索取登录凭证（或使用 README/PDF 中提供的临时访问凭证）；也可以在阿里云容器镜像服务 → 访问凭证中新建账号。

1. **准备环境变量**
   ```bash
   cp .env.docker .env.docker.local
   # 按提示填入 Supabase、LLM、地图、语音等密钥
   ```
2. **登录镜像仓库**

   ```bash
   docker login crpi-delxamk1feq08x2x.cn-hangzhou.personal.cr.aliyuncs.com \
     -u <ALIYUN_USERNAME> -p <ALIYUN_PASSWORD>
   ```

   - 若在阿里云 ECS / VPC 环境，可将域名替换为 `crpi-delxamk1feq08x2x-vpc.cn-hangzhou.personal.cr.aliyuncs.com` 以走内网。

3. **拉取镜像**
   ```bash
   docker pull crpi-delxamk1feq08x2x.cn-hangzhou.personal.cr.aliyuncs.com/qiqingfeng/ai-travel-planner:latest
   ```
4. **运行容器**

   ```bash
   docker run --env-file .env.docker.local -p 3000:3000 \
     crpi-delxamk1feq08x2x.cn-hangzhou.personal.cr.aliyuncs.com/qiqingfeng/ai-travel-planner:latest
   ```

   - 或者使用 Compose：`docker compose --env-file .env.docker.local up web`.

5. 浏览器访问 `http://localhost:3000`，使用 Supabase 中的测试账号登录即可体验全部功能。

> 镜像 tag 采用 `latest` 和 `vX.Y.Z`（来自 `package.json`），可在阿里云 ACR 仓库页面查看具体版本。

---

## 示例数据与截图

- **示例行程 JSON**：`docs/examples/sample-trip.json`，可用于调试 `/api/trips` 或导入前端状态。
- 建议在 README/PDF 中配合应用实际页面截图，展示行程列表、详情、地图与费用面板（可保存在 `docs/screenshots/`）。
- **我的行程页面截图**：`docs/screenshots/my-trips-overview.png`（展示筛选、搜索与列表卡片状态，提交前请更新为最新 UI）。

## 我的行程页面使用提示

1. 顶部提供「草稿/生成中/已生成/已归档」快捷筛选，可与关键字搜索同时使用；默认根据更新时间倒序展示。
2. 右上角的「新建行程」与「刷新列表」按钮分别跳转到 `/planner/new` 与重新请求 `/api/trips`；在移动端同样可见。
3. 列表卡片包含预算、出行日期与标签等摘要，并内置「查看详情 / 分享 / 继续生成」操作；卡片异常时会显示空态和重试提示。
4. 若用户未登录，会展示登录/注册引导卡片；Playwright 或演示环境可通过 `PLAYWRIGHT_BYPASS_AUTH` 注入 bypass token 直接访问。
5. 多端展示或截图时，可参照 `docs/screenshots/my-trips-overview.png`，确保包含筛选条、操作按钮与至少两个不同行程状态。

---

## 质量保障

- CI：见 `.github/workflows/ci.yml`，在 push/PR 至 `main` 时自动执行 lint、Playwright e2e、构建，主干 push 额外推送 Docker 镜像到 GHCR。
- 测试策略：核心流程覆盖 Playwright；API/服务层可扩展 Jest/RTL 单元测试。
- 速率限制：默认启用，具体阈值由环境变量控制。

---

## 语音识别测试场景

- 设置 `PLAYWRIGHT_BYPASS_AUTH`（可为 `1`/`true` 或自定义 token）后，可访问 `/test/voice-scenarios`，该页面复刻新建行程与费用面板的语音录入交互，便于端到端测试驱动。
- Playwright 配置默认注入 `PLAYWRIGHT_BYPASS_AUTH=playwright-bypass-token`，并 Mock `/api/voice-inputs` 接口返回，确保在沙箱环境无需真实语音服务即可验证成功与失败链路。
- 若在生产或演示环境无需该页面，可省略上述变量，路由将返回 404。
- Chrome/Edge 下的语音录制依赖 `MediaRecorder` 与麦克风授权：请在 `https://` 或 `http://localhost` 打开页面，允许浏览器访问麦克风后再进行录制；若录制后播放没有声音，可在控制台检查 `MediaRecorder` 是否报错或使用 `navigator.mediaDevices.getUserMedia` 的测试页面确认设备是否有输入信号。

---

## 常见问题

1. **无法获取 Supabase 客户端？**  
   检查 `.env.local` 是否配置 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。

2. **LLM 调用失败？**  
   查看服务器日志，确认 `BAILIAN_API_KEY`/`OPENAI_API_KEY`、模型名称、`LLM_PROVIDER` 与 `BAILIAN_API_BASE_URL` 是否匹配；若使用 `https://dashscope.aliyuncs.com/compatible-mode/v1` 或其他 OpenAI 兼容网关，只需把基址填到 `/v1` 并设定 `LLM_PROVIDER=openai`，后端会自动补上 `/chat/completions`。

3. **地图不显示？**  
   确认高德 Key 已添加当前域名至 Referer 白名单，且 JS SDK 正常加载。

4. **Playwright 测试卡住？**  
   需提前启动 Supabase（或在 `.env.test` 中配置可用的后端服务），并设置 `PLAYWRIGHT_BYPASS_AUTH` 以启用语音测试页面，确保 `PLAYWRIGHT_BASE_URL` 与本地地址一致。

---

如需更多实现细节、业务上下文或迭代记录，请参阅 `docs/AI旅行规划师项目实现指南.md`。欢迎提交 Issue 或 PR，共同完善项目。
