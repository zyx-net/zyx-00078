# 社区团购售后仲裁系统

面向团长、商家、客服三类角色的售后仲裁管理系统，支持售后申请登记、状态受控流转、版本审计追踪和数据持久化。

---

## 一、项目结构

```
zyx-00078/
├── api/                     # 后端Express服务
│   ├── db/                  # 数据库初始化
│   ├── repositories/        # 数据访问层
│   ├── services/            # 业务逻辑层
│   ├── middleware/          # 中间件（认证、权限）
│   ├── routes/              # API路由
│   ├── app.ts               # 应用入口
│   └── server.ts            # 服务器启动
├── src/                     # 前端React应用
│   ├── pages/               # 页面组件
│   ├── components/          # 通用组件
│   ├── store/               # 状态管理
│   └── utils/               # 工具函数
├── shared/                  # 共享类型定义
├── data/                    # SQLite数据库文件（运行后生成）
└── README.md
```

---

## 二、启动命令

### 前置要求
- Node.js >= 18
- npm >= 9

### 安装依赖
```bash
npm install
```

### 启动服务

**方式一：同时启动前后端（推荐）**
```bash
npm run dev
```
- 前端：http://localhost:5173（若被占用则自动使用5174等端口）
- 后端：http://localhost:3001

**方式二：分别启动**
```bash
# 启动后端（端口3001）
npm run server:dev

# 启动前端（端口5173，另开终端）
npm run client:dev
```

### 类型检查
```bash
npm run check
```

---

## 三、演示账号

系统预置3个角色账号，密码均为 `123456`：

| 角色 | 用户名 | 姓名 | 说明 |
|------|--------|------|------|
| 团长 | `leader1` | 李团长 | 发起售后申请、补充凭证 |
| 商家 | `merchant1` | 张商家 | 响应售后、上传商家凭证 |
| 客服 | `cs1` | 王客服 | 仲裁裁决、导出退款清单 |

**登录地址**：http://localhost:5173/login

---

## 四、核心功能

### 1. 三类角色
- **团长**：发起售后申请（缺货/破损/错发）、补充凭证
- **商家**：查看售后、响应处理、上传商家凭证
- **客服**：仲裁裁决（同意退款/驳回）、导出退款清单

### 2. 售后类型队列
- 缺货（outOfStock）
- 破损（damaged）
- 错发（wrongDelivery）

### 3. 状态流转（受控状态机）
```
待举证(pendingEvidence)
    ↓ 团长提交凭证
商家处理(merchantProcessing)
    ↓ 商家响应
客服仲裁(csArbitration)
    ↓ 客服裁决           ↓ 客服驳回
退款完成(refundCompleted)  驳回(rejected)
```

### 4. 版本控制
- 每步操作递增版本号
- 使用乐观锁防止旧版本重复处理
- 完整审计历史：操作人、备注、时间、版本号

### 5. 筛选查询
- 按售后类型筛选
- 按状态筛选
- 按责任方筛选
- 关键词搜索

### 6. 数据持久化
- 使用SQLite本地文件存储
- 重启后队列顺序、审计历史、案件状态、导出内容完全一致

---

## 五、正常链路验证（破损退款）

### 步骤1：团长发起破损售后申请
1. 使用账号 `leader1` / `123456` 登录
2. 点击「新建售后申请」
3. 填写表单：
   - 订单号：`DD202601001`
   - 售后类型：**破损**
   - 商品名称：`进口牛奶 1L装`
   - 数量：`2`
   - 退款金额：`58.00`
   - 责任方：`商家`
   - 商家：`张商家`
   - 问题描述：`收到时包装破损，液体渗漏`
4. 提交后，案件进入「待举证」状态

### 步骤2：团长补充凭证
1. 在案件列表中点击刚创建的案件进入详情
2. 在「提交凭证」区域填写：
   - 凭证类型：`图片`
   - 凭证URL：`https://example.com/damaged1.jpg`
   - 备注：`破损照片1`
3. 提交后，状态流转为「商家处理」

### 步骤3：商家响应
1. 退出登录，使用账号 `merchant1` / `123456` 登录
2. 进入案件详情，在「商家响应」区域填写：
   - 凭证URL：`https://example.com/merchant-evidence.jpg`
   - 备注：`确认是运输过程中破损，同意退款`
3. 提交后，状态流转为「客服仲裁」

### 步骤4：客服裁决
1. 退出登录，使用账号 `cs1` / `123456` 登录
2. 进入案件详情，点击「同意退款」按钮
3. 填写备注：`情况属实，同意全额退款`
4. 提交后，状态流转为「退款完成」

### 步骤5：导出退款清单
1. 客服账号登录状态下，点击左侧「退款导出」
2. 选择日期范围（包含当前日期），点击「查询」
3. 可在列表中看到刚完成的退款案件
4. 点击「导出CSV」，下载退款清单文件

---

## 六、失败链路验证

### 失败链路1：商家越权裁决

**预期错误**：`无权限执行此操作` / `PERMISSION_DENIED`

**复现步骤**：
1. 登录商家账号 `merchant1`
2. 找到一个状态为「客服仲裁」的案件
3. 尝试直接点击「同意退款」或「驳回」
4. 系统返回权限错误

**API验证**：
```bash
# 使用商家token调用客服裁决接口（会被拒绝）
curl -X POST http://localhost:3001/api/cases/{caseId}/action \
  -H "Authorization: Bearer {商家token}" \
  -H "Content-Type: application/json" \
  -d '{"action":"csRefund","version":2,"remark":"越权操作"}'
```

### 失败链路2：缺少凭证提交

**预期错误**：`请提供凭证URL` / `MISSING_EVIDENCE`

**复现步骤**：
1. 登录团长账号 `leader1`
2. 创建一个新的售后申请（状态为「待举证」）
3. 进入详情页，在「提交凭证」表单中**不填凭证URL**
4. 点击提交，系统返回错误

**API验证**：
```bash
# 提交凭证但缺少evidenceUrl
curl -X POST http://localhost:3001/api/cases/{caseId}/action \
  -H "Authorization: Bearer {团长token}" \
  -H "Content-Type: application/json" \
  -d '{"action":"submitEvidence","version":1,"remark":"缺少凭证"}'
```

### 失败链路3：旧版本重复处理

**预期错误**：`案件版本不匹配，请刷新后重试` / `VERSION_CONFLICT`

**复现步骤**：
1. 打开两个浏览器窗口，都登录团长账号
2. 进入同一个案件的详情页（版本号为v1）
3. 在窗口A中提交凭证，状态流转成功（版本变为v2）
4. 在窗口B中（仍显示v1）尝试提交凭证
5. 系统返回版本冲突错误

**API验证**：
```bash
# 第一次提交成功（版本1→2）
curl -X POST http://localhost:3001/api/cases/{caseId}/action \
  -H "Authorization: Bearer {团长token}" \
  -H "Content-Type: application/json" \
  -d '{"action":"submitEvidence","version":1,"evidenceUrl":"https://example.com/1.jpg","remark":"第一次提交"}'

# 第二次使用旧版本号提交（失败）
curl -X POST http://localhost:3001/api/cases/{caseId}/action \
  -H "Authorization: Bearer {团长token}" \
  -H "Content-Type: application/json" \
  -d '{"action":"submitEvidence","version":1,"evidenceUrl":"https://example.com/2.jpg","remark":"重复提交"}'
```

---

## 七、数据持久化验证

### 验证步骤
1. 完成一笔完整的退款流程
2. 记录案件编号、当前状态、版本号
3. **停止服务**（Ctrl+C）
4. **重新启动服务**
5. 重新登录，验证：
   - ✅ 案件列表顺序不变
   - ✅ 案件状态正确
   - ✅ 版本历史完整
   - ✅ 退款导出内容与重启前一致

### 数据库文件
数据库文件位于 `data/database.sqlite`，删除该文件可重置所有数据。

---

## 八、API接口说明

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录获取token |
| POST | `/api/auth/logout` | 登出 |

### 案件管理
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/cases` | 获取案件列表（支持筛选） | 所有登录用户 |
| GET | `/api/cases/:id` | 获取案件详情 | 所有登录用户 |
| POST | `/api/cases` | 创建售后申请 | 团长 |
| POST | `/api/cases/:id/action` | 执行案件操作 | 对应角色 |
| GET | `/api/cases/merchants` | 获取商家列表 | 团长 |

### 导出
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/export/refunds` | 导出退款清单CSV | 客服 |

---

## 九、样例数据说明

系统启动时自动初始化以下演示数据：

### 用户表（users）
- 3个演示用户（团长、商家、客服）
- 密码使用bcrypt加密存储

### 案件表（cases）- 可选预置
可通过访问系统后手动创建，初始数据库中无预置案件。

### 版本历史表（case_versions）
记录案件每一步状态变更，包含：
- 案件ID
- 版本号（从1开始递增）
- 变更前状态
- 变更后状态
- 操作人ID、姓名、角色
- 操作备注
- 操作时间

### 凭证表（evidences）
记录每个案件提交的凭证：
- 案件ID
- 版本号
- 上传人ID
- 凭证类型（图片/视频/其他）
- 凭证URL
- 备注
- 上传时间

---

## 十、技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | React | 18 |
| 前端 | TypeScript | 5 |
| 前端 | Vite | 5 |
| 前端 | TailwindCSS | 3 |
| 前端 | Zustand | 4 |
| 前端 | React Router | 6 |
| 前端 | Lucide React | 0.344 |
| 后端 | Express | 4 |
| 后端 | TypeScript | 5 |
| 后端 | better-sqlite3 | 11 |
| 后端 | jsonwebtoken | 9 |
| 后端 | bcryptjs | 2.4 |
| 数据库 | SQLite | 3 |

---

## 十一、常见问题

### Q: 启动后数据库文件在哪？
A: 在项目根目录的 `data/database.sqlite`

### Q: 如何重置数据？
A: 删除 `data/database.sqlite` 文件，重启服务即可重新初始化

### Q: 前端无法访问后端？
A: 确认后端服务已启动（端口3001），检查 vite.config.ts 中的代理配置

### Q: Token过期了怎么办？
A: 重新登录即可，Token有效期24小时

---

**启动命令总结**：
```bash
npm install && npm run dev
```
