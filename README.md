# Math Kangaroo G4 Practice Test

一个本地运行的数学奥林匹克练习测试系统，无需账号登录。

## 功能特性

- ✅ **24道题测试**：自动从题库中随机选择
  - 第1-8题：3分题 (共24分)
  - 第9-16题：4分题 (共32分)
  - 第17-24题：5分题 (共40分)
  - 总分：96分

- ⏱️ **60分钟考试时间**：实时倒计时，时间到自动提交

- 🖼️ **图片支持**：部分题目包含配图

- 🔖 **标记功能**：可标记题目稍后复习

- 📊 **详细结果**：
  - 总分和正确率
  - 每题答案解析
  - 正确/错误答案对比

- 📱 **响应式设计**：支持各种屏幕尺寸

## 文件结构

```
C:\Math Kangaroo G4 Project\
├── index.html              # 主页面
├── styles.css              # 样式文件
├── app.js                  # JavaScript逻辑
├── questions.json          # 题库数据（343题）
├── question graphics/      # 题目图片文件夹
├── questions_database.xlsx # 原始Excel数据
└── README.md              # 本说明文件
```

## 使用方法

### 方法1：直接打开（推荐）

1. 双击打开 `index.html` 文件
2. 如果浏览器阻止加载本地文件，需要使用方法2

### 方法2：使用本地服务器

使用 Python 启动本地服务器：

```bash
# 进入项目目录
cd "C:\Math Kangaroo G4 Project"

# 启动服务器（Python 3）
python -m http.server 8000

# 或使用 Python 2
python -m SimpleHTTPServer 8000
```

然后在浏览器中访问：`http://localhost:8000`

### 方法3：使用 Node.js

```bash
# 安装 http-server（仅首次需要）
npm install -g http-server

# 进入项目目录
cd "C:\Math Kangaroo G4 Project"

# 启动服务器
http-server -p 8000

# 访问 http://localhost:8000
```

## 题库信息

- **总题目数**：343题
- **3分题**：104题
- **4分题**：112题
- **5分题**：127题
- **包含图片**：185题
- **答案选项**：A/B/C/D/E

## 考试流程

1. **欢迎页面**：显示考试说明，点击"Start Test"开始
2. **答题页面**：
   - 左侧：题号导航（绿色=已答，黄色=标记）
   - 右侧：题目内容和选项
   - 顶部：倒计时器
3. **提交测试**：完成后点击"Submit Test"
4. **结果页面**：显示总分和统计
5. **答案解析**：点击"View Detailed Answers"查看详细解析

## 注意事项

- 每次开始测试会随机生成新的24道题
- 做错不倒扣分
- 时间到自动提交
- 刷新页面会丢失进度
- 建议使用Chrome、Firefox或Edge浏览器

## 技术栈

- HTML5
- CSS3
- Vanilla JavaScript
- 无需后端服务器
- 无需数据库

## 浏览器兼容性

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Edge 90+
- ✅ Safari 14+

---

**提示**：如果图片无法加载，请确保 `question graphics` 文件夹与 `index.html` 在同一目录下。
