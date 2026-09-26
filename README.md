# NOVA / Personal Portfolio

一个可直接部署到 GitHub Pages 的交互式个人作品网站。没有构建步骤，上传到 GitHub 后由 Actions 自动发布。

## 已包含

- 沉浸式首屏、动态背景、粒子光标和滚动动画
- 作品分类筛选、卡片悬停和全屏灯箱
- 拖拽上传图片、自动压缩、封面选择
- 作品默认保存在浏览器 IndexedDB，可本地预览
- 填写 GitHub 仓库和 Fine-grained token 后，可直接上传图片并更新 `data/works.json`
- 响应式布局、明暗主题、PWA Manifest、404 页面
- GitHub Pages Actions 自动部署

## 本地预览

在项目根目录运行 `python -m http.server 8080`，然后打开 `http://localhost:8080`。

## 修改个人信息

编辑 `data/works.json` 中的 `profile` 和 `works` 字段。请把示例邮箱、姓名与社交链接替换成你的真实信息。

## 发布到 GitHub

仓库推送后，在 **Settings → Pages → Build and deployment** 中选择 **Source: GitHub Actions**。工作流会自动发布网站。

## 在线上传作品

上传面板支持本地保存和 GitHub 发布。GitHub 模式需要填写 owner、repo、branch、basePath 和 Fine-grained token。Token 建议仅授权当前仓库的 Contents 读写权限，并且只保存在浏览器 `sessionStorage` 中。

不要把 token 写进任何项目文件、截图或公开页面。
