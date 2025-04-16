# MCP Surge Server

一个基于 Model Context Protocol (MCP) 的 Surge.sh 工具服务，允许 AI 模型通过标准化的接口与 Surge 进行交互。

## 功能

- 登录到 Surge.sh 账户
- 部署项目到 Surge.sh（生成随机域名）

## 安装

```bash
npm install @xhy/mcp-surge-server
```

## 使用方法

### 作为命令行工具

```bash
npx mcp-surge
```

### 在 Claude 中使用

在 Claude 中，可以使用以下工具：

- `surge_login`: 登录到 Surge.sh 账户
  - 参数：
    - `email`: Surge 账户邮箱
    - `password`: Surge 账户密码

- `surge_deploy`: 部署项目到 Surge.sh
  - 参数：
    - `directory`: 要部署的目录路径

## 开发

### 安装依赖

```bash
npm install
```

### 构建项目

```bash
npm run build
```

### 运行开发模式

```bash
npm run watch
```

### 使用 Inspector 测试

```bash
npm run inspector
```

## 许可证

MIT 