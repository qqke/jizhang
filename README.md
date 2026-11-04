# 日和账本

移动端优先的家庭共享日元记账应用，使用 React、Vite 和 Supabase。

## 本地运行

```sh
npm ci
npm run dev
```

`.env.production` 中的 Supabase 地址和 publishable key 是浏览器公开配置，不是服务端密钥。开发环境可从 `.env.production` 复制到 `.env.local`。数据库结构记录在 `supabase/schema.sql`；当前项目已经部署该结构。

## GitHub Pages

将项目推送至 GitHub 的 `main` 分支，在仓库 Settings → Pages 中选择 GitHub Actions 作为构建来源。工作流会按仓库名称设置路径。然后在 Supabase Authentication → URL Configuration 中，将 Site URL 和 Redirect URLs 配置为实际 Pages 地址（例如 `https://用户名.github.io/jizhang/`），并根据需要加入本地开发地址。Supabase 默认邮件服务仅适合测试；正式运营前应配置自己的 SMTP、域名和邮件模板。

GitHub Pages 仅供测试，商业 SaaS 上线前需迁移至允许商业运营的托管服务。正式运营前还需补齐隐私说明、数据导出和删除流程、备份、监控及安全审查。

## 数据安全

账本相关表启用行级安全策略。创建账本、签发邀请和加入账本通过受限数据库函数完成；邀请链接有效期为七天且仅能使用一次。成员可以管理共享账本中的收支和预算。不要把 Supabase secret 或 service-role 密钥放入前端。
