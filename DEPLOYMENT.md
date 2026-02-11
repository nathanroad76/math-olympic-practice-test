# Vercel 部署指南

本项目已准备好部署到Vercel。请按照以下步骤操作。

## 📋 部署前准备

✅ Git仓库已初始化
✅ 所有文件已提交
✅ vercel.json配置文件已创建
✅ .gitignore已配置

## 🚀 部署步骤

### 方法1：使用GitHub + Vercel（推荐）

这是最简单和最推荐的方式，可以自动部署更新。

#### 步骤1: 创建GitHub仓库

1. 访问 [GitHub](https://github.com) 并登录（如果没有账号，请先注册）
2. 点击右上角的 "+" 按钮，选择 "New repository"
3. 填写仓库信息：
   - **Repository name**: `math-olympic-practice-test`（或其他你喜欢的名字）
   - **Description**: "数学奥林匹克练习测试系统"
   - **Public/Private**: 选择Public（公开）或Private（私有）
   - **不要**勾选 "Initialize this repository with a README"
4. 点击 "Create repository"

#### 步骤2: 将本地代码推送到GitHub

在命令行中执行以下命令（将`YOUR_USERNAME`替换为你的GitHub用户名）：

```bash
cd "C:\Math Olympic Project"

# 添加远程仓库
git remote add origin https://github.com/YOUR_USERNAME/math-olympic-practice-test.git

# 推送代码
git branch -M main
git push -u origin main
```

如果推送失败，可能需要先配置Git认证。GitHub现在要求使用Personal Access Token：

1. 访问 GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. 点击 "Generate new token (classic)"
3. 勾选 `repo` 权限
4. 生成token并复制
5. 推送时使用token作为密码

#### 步骤3: 在Vercel上部署

1. 访问 [Vercel](https://vercel.com) 并注册/登录
   - 推荐使用GitHub账号登录，这样更方便

2. 点击 "Add New..." → "Project"

3. 从列表中选择你的GitHub仓库 `math-olympic-practice-test`
   - 如果看不到仓库，点击 "Adjust GitHub App Permissions" 授权

4. 配置项目：
   - **Project Name**: `math-olympic-practice-test`（或自定义）
   - **Framework Preset**: 选择 "Other"（因为这是纯静态网站）
   - **Root Directory**: 保持默认（./）
   - **Build Command**: 留空（不需要构建）
   - **Output Directory**: 留空（整个项目就是静态文件）

5. 点击 "Deploy"

6. 等待部署完成（通常30-60秒）

7. 部署成功后，Vercel会给你一个URL，类似：
   ```
   https://math-olympic-practice-test.vercel.app
   ```

### 方法2：使用Vercel CLI（命令行）

如果你更喜欢使用命令行：

#### 步骤1: 安装Vercel CLI

```bash
npm install -g vercel
```

#### 步骤2: 登录Vercel

```bash
vercel login
```

按照提示完成登录。

#### 步骤3: 部署

```bash
cd "C:\Math Olympic Project"
vercel
```

首次部署时会询问一些问题：
- Set up and deploy "C:\Math Olympic Project"? `Y`
- Which scope? 选择你的账号
- Link to existing project? `N`
- What's your project's name? `math-olympic-practice-test`
- In which directory is your code located? `.`

然后Vercel会自动部署，完成后会显示部署URL。

#### 步骤4: 生产环境部署

```bash
vercel --prod
```

### 方法3：直接从本地文件夹部署

1. 访问 [Vercel](https://vercel.com) 并登录
2. 点击 "Add New..." → "Project"
3. 在Import Git Repository下方，点击 "Browse"
4. 选择文件夹 `C:\Math Olympic Project`
5. 点击 "Deploy"

## 🎉 部署完成！

部署成功后，你会得到一个类似这样的URL：
```
https://math-olympic-practice-test.vercel.app
```

或者自定义域名（如果你有的话）。

## 🔄 更新部署

### 如果使用GitHub方式：

每次你更新代码并推送到GitHub，Vercel会**自动重新部署**！

```bash
cd "C:\Math Olympic Project"

# 修改文件后
git add .
git commit -m "更新说明"
git push
```

推送后，Vercel会自动检测并部署新版本。

### 如果使用Vercel CLI方式：

```bash
cd "C:\Math Olympic Project"
vercel --prod
```

## 🌐 自定义域名（可选）

如果你有自己的域名：

1. 在Vercel项目页面，点击 "Settings" → "Domains"
2. 输入你的域名，点击 "Add"
3. 按照提示配置DNS记录
4. 等待DNS生效（可能需要几分钟到几小时）

## 📊 查看部署状态

在Vercel控制台可以查看：
- 部署历史
- 访问统计
- 性能指标
- 错误日志

## 🔧 环境变量（本项目不需要）

本项目是纯静态网站，不需要配置环境变量。

## ⚡ 性能优化

Vercel自动提供：
- ✅ 全球CDN加速
- ✅ 自动HTTPS
- ✅ 图片优化
- ✅ Gzip/Brotli压缩
- ✅ 缓存优化（通过vercel.json配置）

## 📱 测试部署

部署成功后，建议测试：
1. 打开网站URL
2. 测试开始考试功能
3. 测试图片加载（特别是 question graphics）
4. 测试答题、提交、查看答案等功能
5. 在手机上测试响应式设计

## 🐛 常见问题

### 图片无法加载？
确保 `question graphics` 文件夹已经推送到Git仓库。

### 部署失败？
检查vercel.json语法是否正确，可以删除它让Vercel自动检测。

### 自定义域名不工作？
DNS记录可能需要几小时生效，请耐心等待。

## 💰 费用

Vercel个人版（Hobby Plan）是**完全免费**的，包括：
- 无限网站
- 无限带宽
- 自动HTTPS
- 全球CDN

对于个人项目和小型网站完全够用！

## 🎯 下一步

- ✅ 部署成功后分享URL给其他人
- ✅ 可以添加Google Analytics追踪访问
- ✅ 可以添加更多题目到题库
- ✅ 可以添加新功能（成绩历史、错题本等）

---

## 📞 需要帮助？

- [Vercel文档](https://vercel.com/docs)
- [Vercel社区](https://github.com/vercel/vercel/discussions)
- [GitHub帮助](https://docs.github.com)

祝部署顺利！🚀
