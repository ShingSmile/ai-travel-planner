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
| 变量名称 | 说明 | 备注 |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase 项目基础 URL | 必填 |
| `SUPABASE_ANON_KEY` | Supabase 匿名访问密钥 | 必填，前端使用 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务角色密钥 | 仅后端使用，需妥善保密 |
| `SUPABASE_JWT_SECRET` | Supabase JWT 签名密钥 | 用于自定义认证/边缘函数 |
| `LLM_API_KEY` | 阿里云百炼或其他大模型平台密钥 | 必填，触发行程生成 |
| `LLM_MODEL_ID` | 使用的大模型编号 | 依据供应商配置 |
| `GAODE_MAP_KEY` | 高德地图 Web JS API Key | 前端使用，需配置 Referer |
| `GAODE_REST_KEY` | 高德 Web 服务密钥 | 后端/Edge Function 调用 |
| `IFLYTEK_APP_ID` | 科大讯飞应用 ID | 语音识别必填 |
| `IFLYTEK_API_KEY` | 科大讯飞 API Key | 语音识别必填 |
| `IFLYTEK_API_SECRET` | 科大讯飞 API Secret | 语音识别必填 |
| `VOICE_CALLBACK_URL` | 语音识别结果回调地址 | 依据接入方式选填 |
| `SMTP_HOST` | 邮件服务主机地址 | 若启用邮件通知则必填 |
| `SMTP_PORT` | 邮件服务端口 | 与邮件服务配置一致 |
| `SMTP_USER` | 邮件服务账号 | 通知服务使用 |
| `SMTP_PASS` | 邮件服务密码或令牌 | 需加密存储 |
| `NOTIFY_BUDGET_THRESHOLD` | 预算提醒阈值（百分比） | 默认可设为 `0.8` |
| `NEXTAUTH_SECRET` | NextAuth 或自建认证所需密钥 | 若采用 NextAuth 则必填 |
| `NEXTAUTH_URL` | NextAuth 回调地址 | 部署环境必填 |
| `SENTRY_DSN` | 错误监控服务地址 | 可选，用于生产监控 |
| `PLAYWRIGHT_BYPASS_AUTH` | E2E 测试使用的绕过凭证 | 可选，测试环境单独配置 |

> 后续迭代将继续完善变量说明，并提供 `.env.example` 与安全存储指引。
