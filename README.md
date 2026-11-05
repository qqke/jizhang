# 柴米账本

移动端优先的家庭共享日元记账应用，使用 React、Vite 和 Supabase。

## 本地运行

```sh
npm ci
npm run dev
```

`.env.production` 中的 Supabase 地址和 publishable key 是浏览器公开配置，不是服务端密钥。开发环境可从 `.env.production` 复制到 `.env.local`。数据库结构记录在 `supabase/schema.sql` 和 `supabase/members.sql`；当前项目已经部署这两部分。

## GitHub Pages

将项目推送至 GitHub 的 `main` 分支，在仓库 Settings → Pages 中选择 GitHub Actions 作为构建来源。工作流会按仓库名称设置路径。然后在 Supabase Authentication → URL Configuration 中，将 Site URL 和 Redirect URLs 配置为实际 Pages 地址（例如 `https://用户名.github.io/jizhang/`），并根据需要加入本地开发地址。Supabase 默认邮件服务仅适合测试；正式运营前应配置自己的 SMTP、域名和邮件模板。

GitHub Pages 仅供测试，商业 SaaS 上线前需迁移至允许商业运营的托管服务。正式运营前还需补齐隐私说明、数据导出和删除流程、备份、监控及安全审查。

## 数据安全

账本相关表启用行级安全策略。创建账本、签发邀请和加入账本通过受限数据库函数完成；邀请链接有效期为七天且仅能使用一次。成员可以管理共享账本中的收支和预算。不要把 Supabase secret 或 service-role 密钥放入前端。

## 家庭协作与数据备份

账本成员可查看成员列表和各自退出；创建者可移除其他成员，但不能退出或移除自己。设置页支持导出整个账本的 CSV，账目页支持按备注、金额、类型和分类筛选。

## 小票扫描

在「记一笔」中选择「拍摄小票」或「选择照片」，识别日文/英文日元小票。金额、日期和商家会填入表单；分类默认「其他」，确认后保存。模糊、不明确、无币种的英文总额不会猜测，需要手动补充。支持 JPG/PNG/WebP（16 MB 内）；HEIC、PDF 和商品逐项拆分暂不支持。

使用 Apache-2.0 许可的 Tesseract.js 7.0.0，识别在浏览器本机完成，不上传或保存小票图片。首次使用需联网从 jsDelivr 下载 OCR 引擎和日文/英文模型；随后模型可使用浏览器缓存。取消或关闭表单会终止识别。数据库仅保存确认后的账目。

`npm test` 包含小票解析测试。开发服务器打开 `/tests/receipt-harness.html` 可用 `tests/fixtures/receipt-jpy.png` 检查真实 OCR，预期金额 1210、日期 2026-11-05；测试页不在生产构建中。
