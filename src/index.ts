#!/usr/bin/env node
// 指定使用 node 解释器运行此脚本

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// 导入 MCP SDK 中的 Server 类，用于创建 MCP 服务器

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// 导入 StdioServerTransport，用于通过标准输入输出与 MCP 客户端通信

import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
// 导入 MCP 相关的类型定义和错误处理

import { config } from 'dotenv';
// 导入 dotenv 配置，用于加载环境变量

import fetch from 'node-fetch';
// 导入 fetch，用于发送 HTTP 请求
import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 加载环境变量
config();

// 定义 Surge 配置接口
interface SurgeConfig {
  email: string;      // Surge 邮箱
  password: string;   // Surge 密码
  isLoggedIn: boolean; // 登录状态
}

// 类型守卫函数：检查错误对象是否包含 message 属性
// 用于更安全地处理错误信息
function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

// 辅助函数：获取错误消息
// 如果错误对象有 message 属性则返回该属性，否则将错误转为字符串
function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  return String(error);
}

// 执行命令行命令的包装函数
function execPromise(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

// 使用 spawn 执行命令并获取实时输出的包装函数
function spawnPromise(command: string, args: string[], options: any = {}): Promise<{ stdout: string; stderr: string; }> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, { shell: true, ...options });
    
    let stdoutData = '';
    let stderrData = '';
    
    childProcess.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdoutData += chunk;
      console.error(`[OUT] ${chunk.trim()}`);
    });
    
    childProcess.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderrData += chunk;
      console.error(`[ERR] ${chunk.trim()}`);
    });
    
    childProcess.on('error', (error) => {
      console.error(`[SPAWN ERROR] ${error.message}`);
      reject(error);
    });
    
    childProcess.on('close', (code) => {
      console.error(`[PROCESS EXIT] 退出代码: ${code}`);
      if (code === 0 || code === null) {
        resolve({ stdout: stdoutData, stderr: stderrData });
      } else {
        reject(new Error(`进程以非零退出代码退出: ${code}\nStdout: ${stdoutData}\nStderr: ${stderrData}`));
      }
    });
  });
}

// 检查命令是否存在
async function commandExists(command: string): Promise<boolean> {
  try {
    const platform = os.platform();
    const cmd = platform === 'win32' ? 'where' : 'which';
    await execPromise(`${cmd} ${command}`);
    return true;
  } catch (error) {
    return false;
  }
}

// 检查并安装依赖项
async function checkAndInstallDependencies() {
  console.error('[Dependencies] 开始检查必要的依赖项...');
  
  // 检查 surge CLI
  if (!await commandExists('surge')) {
    console.error('[Dependencies] 未找到 surge CLI，尝试安装...');
    try {
      console.error('[Dependencies] 通过 npm 全局安装 surge...');
      await spawnPromise('npm', ['install', '-g', 'surge']);
      console.error('[Dependencies] surge CLI 安装成功');
    } catch (error) {
      console.error(`[Dependencies] 安装 surge CLI 失败: ${getErrorMessage(error)}`);
      console.error('[Dependencies] 请手动安装 surge: npm install -g surge');
    }
  } else {
    console.error('[Dependencies] surge CLI 已安装');
  }
  
  // 检查 expect
  if (!await commandExists('expect')) {
    console.error('[Dependencies] 未找到 expect 命令，尝试安装...');
    
    try {
      const platform = os.platform();
      
      if (platform === 'darwin') {
        // macOS - 尝试使用 brew 安装
        if (await commandExists('brew')) {
          console.error('[Dependencies] 使用 Homebrew 安装 expect...');
          await spawnPromise('brew', ['install', 'expect']);
          console.error('[Dependencies] expect 安装成功');
        } else {
          console.error('[Dependencies] 未找到 Homebrew，无法自动安装 expect');
          console.error('[Dependencies] 请手动安装 Homebrew，然后执行: brew install expect');
        }
      } else if (platform === 'linux') {
        // Linux - 尝试使用 apt、yum 或 apk 安装
        if (await commandExists('apt-get')) {
          console.error('[Dependencies] 使用 apt-get 安装 expect...');
          await spawnPromise('sudo', ['apt-get', 'update']);
          await spawnPromise('sudo', ['apt-get', 'install', '-y', 'expect']);
          console.error('[Dependencies] expect 安装成功');
        } else if (await commandExists('yum')) {
          console.error('[Dependencies] 使用 yum 安装 expect...');
          await spawnPromise('sudo', ['yum', 'install', '-y', 'expect']);
          console.error('[Dependencies] expect 安装成功');
        } else if (await commandExists('apk')) {
          console.error('[Dependencies] 使用 apk 安装 expect...');
          await spawnPromise('apk', ['add', 'expect']);
          console.error('[Dependencies] expect 安装成功');
        } else if (await commandExists('dnf')) {
          console.error('[Dependencies] 使用 dnf 安装 expect...');
          await spawnPromise('sudo', ['dnf', 'install', '-y', 'expect']);
          console.error('[Dependencies] expect 安装成功');
        } else if (await commandExists('zypper')) {
          console.error('[Dependencies] 使用 zypper 安装 expect...');
          await spawnPromise('sudo', ['zypper', 'install', '-y', 'expect']);
          console.error('[Dependencies] expect 安装成功');
        } else if (await commandExists('pacman')) {
          console.error('[Dependencies] 使用 pacman 安装 expect...');
          await spawnPromise('sudo', ['pacman', '-S', '--noconfirm', 'expect']);
          console.error('[Dependencies] expect 安装成功');
        } else {
          console.error('[Dependencies] 未找到支持的包管理器，无法自动安装 expect');
          console.error('[Dependencies] 请手动安装 expect');
          console.error('[Dependencies] 支持的包管理器: apt-get, yum, apk, dnf, zypper, pacman');
        }
      } else if (platform === 'win32') {
        console.error('[Dependencies] Windows 系统不支持自动安装 expect');
        console.error('[Dependencies] Windows 用户可以考虑安装 WSL 或使用替代方法');
      } else {
        console.error(`[Dependencies] 不支持的操作系统: ${platform}，无法自动安装 expect`);
      }
    } catch (error) {
      console.error(`[Dependencies] 安装 expect 失败: ${getErrorMessage(error)}`);
      console.error('[Dependencies] 请根据您的操作系统手动安装 expect');
    }
  } else {
    console.error('[Dependencies] expect 已安装');
  }
  
  console.error('[Dependencies] 依赖项检查完成');
}

// 生成随机字符串的辅助函数，用于创建随机域名
function generateRandomString(length: number): string {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Surge 服务器类：实现 MCP 协议的 Surge 工具服务
class SurgeServer {
  private server: Server;                    // MCP 服务器实例
  private config: SurgeConfig | null = null; // Surge 配置信息
  private tempNetrcFile: string | null = null; // 临时 .netrc 文件路径

  // 构造函数：初始化 MCP 服务器
  constructor() {
    // 创建 MCP 服务器实例，设置名称和版本
    this.server = new Server(
      {
        name: 'surge-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {}, // 定义服务器能力
        },
        // timeoutMs: 300000, // SDK中不支持此选项
      }
    );

    // 设置工具处理器
    this.setupToolHandlers();
    
    // 错误处理
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    
    // 监听 SIGINT 信号（Ctrl+C），优雅关闭服务
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  // 清理资源：关闭 MCP 服务器和临时文件
  private async cleanup() {
    // 删除临时 .netrc 文件
    if (this.tempNetrcFile && fs.existsSync(this.tempNetrcFile)) {
      try {
        fs.unlinkSync(this.tempNetrcFile);
        console.error('已删除临时 .netrc 文件');
      } catch (error) {
        console.error('删除临时 .netrc 文件失败:', error);
      }
    }
    
    await this.server.close();
  }

  // 确保 Surge 配置存在
  // 如果未配置，则抛出错误
  private ensureConfig() {
    if (!this.config) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Surge 配置未设置。请先使用 surge_login 工具登录。'
      );
    }
    return this.config;
  }

  // 确保用户已登录
  private ensureLoggedIn() {
    const config = this.ensureConfig();
    if (!config.isLoggedIn) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        '尚未登录 Surge。请先使用 surge_login 工具登录。'
      );
    }
    return config;
  }

  // 设置工具处理器：定义可用的工具和对应的处理函数
  private setupToolHandlers() {
    // 处理工具列表请求：返回所有可用工具的定义
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'surge_login',
          description: '登录到 Surge.sh 账户',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                description: 'Surge 账户邮箱',
              },
              password: {
                type: 'string',
                description: 'Surge 账户密码',
              },
            },
            required: ['email', 'password'],
          },
        },
        {
          name: 'surge_deploy',
          description: '部署项目到 Surge.sh（生成随机域名）',
          inputSchema: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: '要部署的目录路径，例如：/Users/xhy/soft-application/mcp-server/surge-mcp',
              },
            },
            required: ['directory'],
          },
        }
      ],
    }));

    // 处理工具调用请求：根据工具名称分发到对应的处理函数
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.error(`[Tool Call] 工具: ${request.params.name}, 参数:`, JSON.stringify(request.params.arguments));
      
      switch (request.params.name) {
        case 'surge_login':
          return await this.handleSurgeLogin(request.params.arguments);
        case 'surge_deploy':
          return await this.handleSurgeDeploy(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `未知工具: ${request.params.name}`
          );
      }
    });
  }

  // 处理 Surge 登录请求
  private async handleSurgeLogin(args: any) {
    console.error('[Login] 开始处理登录请求');
    
    // 检查必要的参数是否存在
    if (!args.email || !args.password) {
      throw new McpError(
        ErrorCode.InvalidParams,
        '缺少必要的登录参数: email 和 password'
      );
    }

    try {
      // 保存 Surge 配置
      this.config = {
        email: args.email,
        password: args.password,
        isLoggedIn: false
      };

      console.error('[Login] 尝试使用 .netrc 方法登录 Surge...');
      
      // 优先使用 .netrc 方法，更可靠且不依赖 expect
      const homeDir = os.homedir();
      const netrcPath = path.join(homeDir, '.netrc');
      
      // 备份原始 .netrc 文件（如果存在）
      let originalNetrcContent = '';
      if (fs.existsSync(netrcPath)) {
        originalNetrcContent = fs.readFileSync(netrcPath, 'utf8');
        const backupPath = path.join(homeDir, `.netrc.backup.${Date.now()}`);
        fs.writeFileSync(backupPath, originalNetrcContent, { mode: 0o600 });
        console.error(`[Login] 已备份原 .netrc 文件到 ${backupPath}`);
      }
      
      // 先尝试交互式登录获取令牌
      console.error('[Login] 尝试交互式登录获取令牌...');
      
      // 创建临时脚本来自动登录
      const tmpDir = os.tmpdir();
      const loginScriptPath = path.join(tmpDir, `surge_login_${Date.now()}.exp`);
      
      const expectScript = `#!/usr/bin/expect -f
set timeout 30
spawn surge login
expect "email:" { send "${args.email}\\r" }
expect "password:" { send "${args.password}\\r" }
expect eof
catch wait result
exit [lindex $result 3]`;
      
      console.error(`[Login] 创建临时登录脚本: ${loginScriptPath}`);
      fs.writeFileSync(loginScriptPath, expectScript, { mode: 0o755 });
      
      try {
        // 检查 expect 是否可用
        if (await commandExists('expect')) {
          console.error('[Login] 使用 expect 进行交互式登录...');
          const { stdout: loginOutput, stderr: loginError } = await execPromise(`expect ${loginScriptPath}`);
          console.error(`[Login] 交互式登录输出: ${loginOutput}`);
          
          // 验证登录是否成功
          const { stdout: whoamiOutput } = await execPromise('surge whoami');
          if (whoamiOutput.includes(args.email)) {
            console.error('[Login] 交互式登录成功');
            
            // 清理临时脚本
            try {
              fs.unlinkSync(loginScriptPath);
            } catch (e) {
              console.error(`[Login] 清理临时脚本失败: ${getErrorMessage(e)}`);
            }
            
            this.config.isLoggedIn = true;
            return {
              content: [
                {
                  type: 'text',
                  text: `成功登录到 Surge`,
                },
              ],
            };
          } else {
            throw new Error(`交互式登录后验证失败: ${whoamiOutput}`);
          }
        } else {
          // 如果没有 expect，使用正确的 .netrc 格式
          console.error('[Login] expect 不可用，尝试 .netrc 方法（正确格式）...');
          
          // 写入正确格式的 Surge 凭据
          const netrcContent = `machine surge.surge.sh
    login ${args.email}
    password ${args.password}`;
        
          console.error(`[Login] 写入正确格式的凭据到 ${netrcPath}`);
          fs.writeFileSync(netrcPath, netrcContent, { mode: 0o600 });
        }
      } catch (expectError) {
        console.error(`[Login] expect 登录失败: ${getErrorMessage(expectError)}`);
        
        // 清理临时脚本
        try {
          fs.unlinkSync(loginScriptPath);
        } catch (e) {
          // 忽略清理错误
        }
        
        // 如果 expect 失败，回退到 .netrc 方法
        console.error('[Login] 回退到 .netrc 方法...');
        const netrcContent = `machine surge.surge.sh
    login ${args.email}
    password ${args.password}`;
      
                 console.error(`[Login] 写入 .netrc 格式凭据到 ${netrcPath}`);
         fs.writeFileSync(netrcPath, netrcContent, { mode: 0o600 });
       }
      
      try {
        // 验证登录
        const { stdout } = await execPromise('surge whoami');
        console.error(`[Login] whoami 响应: ${stdout.trim()}`);
        
        if (stdout.includes(args.email)) {
          this.config.isLoggedIn = true;
          console.error('[Login] 登录成功');
          
          // 恢复原始 .netrc 文件
          if (originalNetrcContent) {
            fs.writeFileSync(netrcPath, originalNetrcContent, { mode: 0o600 });
            console.error('[Login] 已恢复原 .netrc 文件');
          } else {
            // 如果原来没有 .netrc 文件，则删除
            fs.unlinkSync(netrcPath);
            console.error('[Login] 已删除临时 .netrc 文件');
          }
          
          return {
            content: [
              {
                type: 'text',
                text: `成功登录到 Surge`,
              },
            ],
          };
        } else {
          // 恢复原始 .netrc 文件
          if (originalNetrcContent) {
            fs.writeFileSync(netrcPath, originalNetrcContent, { mode: 0o600 });
          } else {
            fs.unlinkSync(netrcPath);
          }
          
          throw new Error(`登录验证失败，未找到邮箱: ${stdout}`);
        }
      } catch (whoamiError) {
        // 恢复原始 .netrc 文件
        if (originalNetrcContent) {
          fs.writeFileSync(netrcPath, originalNetrcContent, { mode: 0o600 });
        } else {
          try {
            fs.unlinkSync(netrcPath);
          } catch (e) {
            // 忽略删除错误
          }
        }
        
        throw new Error(`Surge 登录失败: ${getErrorMessage(whoamiError)}`);
      }
    } catch (error) {
      console.error(`[Login] 处理登录请求时发生错误: ${getErrorMessage(error)}`);
      throw new McpError(
        ErrorCode.InternalError,
        `登录 Surge 失败: ${getErrorMessage(error)}`
      );
    }
  }

  // 处理 Surge 部署请求
  private async handleSurgeDeploy(args: any) {
    console.error('[Deploy] 开始处理部署请求');
    
    // 确保已登录
    this.ensureLoggedIn();
    
    // 检查参数
    if (!args.directory) {
      throw new McpError(
        ErrorCode.InvalidParams,
        '必须提供要部署的目录路径'
      );
    }

    const directory = args.directory;
    console.error(`[Deploy] 部署目录: ${directory}`);
    
    // 检查目录是否存在
    if (!fs.existsSync(directory)) {
      console.error(`[Deploy] 错误: 目录不存在`);
      throw new McpError(
        ErrorCode.InvalidParams,
        `目录不存在: ${directory}`
      );
    }
    
    // 确保路径是目录
    if (!fs.statSync(directory).isDirectory()) {
      console.error(`[Deploy] 错误: 路径不是目录`);
      throw new McpError(
        ErrorCode.InvalidParams,
        `指定的路径不是目录: ${directory}`
      );
    }
    
    try {
      // 生成随机子域名
      const randomSubdomain = generateRandomString(10);
      const domain = `${randomSubdomain}.surge.sh`;
      console.error(`[Deploy] 生成随机域名: ${domain}`);
      
      // 检查目录内容
      try {
        const { stdout: dirContent } = await execPromise(`ls -la "${directory}"`);
        console.error(`[Deploy] 目录内容:\n${dirContent}`);
      } catch (e) {
        console.error(`[Deploy] 无法列出目录内容: ${getErrorMessage(e)}`);
      }
      
      // 检查目录大小
      try {
        const { stdout: dirSize } = await execPromise(`du -sh "${directory}"`);
        console.error(`[Deploy] 目录大小: ${dirSize}`);
      } catch (e) {
        console.error(`[Deploy] 无法获取目录大小: ${getErrorMessage(e)}`);
      }
      
      // 部署到 Surge
      console.error(`[Deploy] 开始部署过程... 这可能需要一些时间`);
      
      try {
        // 不使用 netrc 文件，直接部署
        const { stdout, stderr } = await spawnPromise('surge', [
          `--project`, directory,
          `--domain`, domain
        ]);
        
        console.error(`[Deploy] 部署完成`);
        
        // 检查是否部署成功
        if (stdout.includes('Success') || stdout.includes('project is published')) {
          console.error(`[Deploy] 部署成功: https://${domain}`);
          return {
            content: [
              {
                type: 'text',
                text: `成功部署到: https://${domain}\n`,
              },
            ],
          };
        } else {
          console.error(`[Deploy] 部署可能有问题，未检测到成功消息`);
          // 我们仍然返回结果，因为有时候surge不会明确输出"Success"
          return {
            content: [
              {
                type: 'text',
                text: `部署完成，请访问: https://${domain}\n`,
              },
            ],
          };
        }
      } catch (error) {
        console.error(`[Deploy] 部署过程中发生错误: ${getErrorMessage(error)}`);
        throw new Error(`部署失败: ${getErrorMessage(error)}`);
      }
    } catch (error) {
      console.error(`[Deploy] 处理部署请求时发生错误: ${getErrorMessage(error)}`);
      throw new McpError(
        ErrorCode.InternalError,
        `部署到 Surge 失败: ${getErrorMessage(error)}`
      );
    }
  }

  // 运行服务器
  async run() {
    // 创建标准输入输出传输层
    const transport = new StdioServerTransport();
    console.error('[Server] 启动 Surge MCP 服务器');
    
    // 连接服务器到传输层
    await this.server.connect(transport);
    console.error('[Server] Surge MCP server running on stdio');
  }
}

// 创建并运行 Surge 服务器实例
const server = new SurgeServer();

// 先检查并安装依赖，然后启动服务器
checkAndInstallDependencies()
  .then(() => {
    return server.run();
  })
  .catch((error) => {
    console.error(`[Fatal Error] ${getErrorMessage(error)}`);
    process.exit(1);
  }); 