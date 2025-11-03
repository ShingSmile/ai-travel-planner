# AI 旅行规划师

## 项目概述

AI 旅行规划师旨在快速生成个性化行程、预算及语音辅助功能。当前阶段处于需求确认与环境检查，需要先梳理外部依赖与环境变量。

## 外部服务账号需求

- Supabase：用于身份认证、数据库、对象存储与实时同步。
- 阿里云百炼（或同等 LLM 服务）：负责行程与预算的智能生成。
- 科大讯飞开放平台（或阿里云听觉、火山语音）：提供语音识别能力。
- 高德地图开放平台：用于 POI 检索与地图可视化。
- 邮件/通知服务（可选，如阿里云邮件推送、SendGrid）：用于预算提醒、行程通知。
- OAuth 提供商（可选，如 GitHub、微信）：支持第三方登录。

## 环境变量与密钥清单（草稿）

| 变量名称                        | 说明                           | 备注                                  |
| ------------------------------- | ------------------------------ | ------------------------------------- |
| `SUPABASE_URL`                  | Supabase 项目基础 URL          | 必填                                  |
| `SUPABASE_ANON_KEY`             | Supabase 匿名访问密钥          | 必填，服务端使用                      |
| `NEXT_PUBLIC_SUPABASE_URL`      | 前端可用的 Supabase URL        | 必填，与 `SUPABASE_URL` 保持一致      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 前端可用的匿名密钥             | 必填，与 `SUPABASE_ANON_KEY` 保持一致 |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase 服务角色密钥          | 仅后端使用，需妥善保密                |
| `SUPABASE_JWT_SECRET`           | Supabase JWT 签名密钥          | 用于自定义认证/边缘函数               |
| `LLM_API_KEY`                   | 阿里云百炼或其他大模型平台密钥 | 必填，触发行程生成                    |
| `LLM_MODEL_ID`                  | 使用的大模型编号               | 依据供应商配置                        |
| `GAODE_MAP_KEY`                 | 高德地图 Web JS API Key        | 前端使用，需配置 Referer              |
| `GAODE_REST_KEY`                | 高德 Web 服务密钥              | 后端/Edge Function 调用               |
| `IFLYTEK_APP_ID`                | 科大讯飞应用 ID                | 语音识别必填                          |
| `IFLYTEK_API_KEY`               | 科大讯飞 API Key               | 语音识别必填                          |
| `IFLYTEK_API_SECRET`            | 科大讯飞 API Secret            | 语音识别必填                          |
| `VOICE_CALLBACK_URL`            | 语音识别结果回调地址           | 依据接入方式选填                      |
| `SMTP_HOST`                     | 邮件服务主机地址               | 若启用邮件通知则必填                  |
| `SMTP_PORT`                     | 邮件服务端口                   | 与邮件服务配置一致                    |
| `SMTP_USER`                     | 邮件服务账号                   | 通知服务使用                          |
| `SMTP_PASS`                     | 邮件服务密码或令牌             | 需加密存储                            |
| `NOTIFY_BUDGET_THRESHOLD`       | 预算提醒阈值（百分比）         | 默认可设为 `0.8`                      |
| `NEXTAUTH_SECRET`               | NextAuth 或自建认证所需密钥    | 若采用 NextAuth 则必填                |
| `NEXTAUTH_URL`                  | NextAuth 回调地址              | 部署环境必填                          |
| `SENTRY_DSN`                    | 错误监控服务地址               | 可选，用于生产监控                    |
| `PLAYWRIGHT_BYPASS_AUTH`        | E2E 测试使用的绕过凭证         | 可选，测试环境单独配置                |

> 后续迭代将继续完善变量说明，并提供 `.env.example` 与安全存储指引。

## 开发环境初始化进度

- ✅ 使用 Next.js 16 + TypeScript 构建基础框架，启用 App Router 与 `src` 目录结构。
- ✅ 集成 ESLint（含 Prettier 规则）与 Tailwind CSS，保证代码与样式基线一致。
- ✅ 配置 Prettier、lint-staged 与 Husky，在提交前执行格式化与静态检查。
- ✅ 完成通用 UI 基线（按钮、输入框、加载指示、Toast），搭建品牌主题色与全局布局。
- ✅ 集成 Supabase Auth，提供登录、注册、重置密码的前端流程。

## 通用组件预览

- `src/components/ui/button.tsx`：支持 `primary`、`secondary`、`ghost` 三种主题与多尺寸。
- `src/components/ui/input.tsx`：内置标签、描述与错误提示，适配后续表单场景。
- `src/components/ui/spinner.tsx`：轻量加载指示器，可复用在按钮与页面状态中。
- `src/components/ui/toast.tsx`：提供全局提示上下文，支持信息、成功、警告、错误四种状态。

## 身份认证页面

- `/login`：邮箱 + 密码登录表单，成功后跳转首页。
- `/register`：新用户注册，支持邮箱验证跳转。
- `/forgot-password`：发送密码重置邮件。
