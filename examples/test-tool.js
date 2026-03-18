/**
 * 工具测试脚本 - 验证工具系统工作正常
 */

import { ToolRegistry, createFileSystemTools, createShellTools } from '../dist/tools/registry.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = join(tmpdir(), 'turboclaw-test-' + Date.now());

async function runTests() {
  console.log('🧪 工具系统测试\n');
  
  // 创建测试目录
  mkdirSync(testDir, { recursive: true });
  console.log(`测试目录: ${testDir}\n`);
  
  const registry = new ToolRegistry();
  
  // 注册工具
  for (const tool of createFileSystemTools(testDir)) {
    registry.register(tool);
  }
  for (const tool of createShellTools(testDir, false)) {
    registry.register(tool);
  }
  
  console.log('已注册工具:', registry.list().map(t => t.name).join(', '));
  
  // 测试 write_file
  console.log('\n--- 测试 write_file ---');
  const writeResult = await registry.get('write_file').execute({
    path: 'test.txt',
    content: 'Hello TurboClaw!'
  });
  console.log('结果:', writeResult);
  
  // 测试 read_file
  console.log('\n--- 测试 read_file ---');
  const readResult = await registry.get('read_file').execute({
    path: 'test.txt'
  });
  console.log('结果:', readResult);
  
  // 测试 list_files
  console.log('\n--- 测试 list_files ---');
  const listResult = await registry.get('list_files').execute({
    path: '.'
  });
  console.log('结果:', listResult);
  
  // 测试 bash (安全模式)
  console.log('\n--- 测试 bash (安全模式) ---');
  const bashResult = await registry.get('bash').execute({
    command: 'ls -la'
  });
  console.log('结果:', bashResult.substring(0, 200) + '...');
  
  // 测试越界访问
  console.log('\n--- 测试路径安全 ---');
  const unsafeResult = await registry.get('read_file').execute({
    path: '../../../etc/passwd'
  });
  console.log('结果:', unsafeResult);
  
  // 清理
  rmSync(testDir, { recursive: true });
  
  console.log('\n✅ 测试完成');
}

runTests().catch(console.error);
