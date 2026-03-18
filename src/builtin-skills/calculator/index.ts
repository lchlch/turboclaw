/**
 * Calculator Skill - 数学计算工具
 */

import { Tool } from '../../core/types.js';

const calculateTool: Tool = {
  name: 'calculate',
  description: '执行数学计算，支持 + - * / ^ sqrt abs 等运算',
  parameters: {
    expression: {
      type: 'string',
      description: '数学表达式，如 "2 + 2 * 3" 或 "sqrt(16)"',
      required: true,
    },
  },
  execute: async ({ expression }) => {
    try {
      // 简单的安全表达式求值
      const expr = String(expression)
        .replace(/\^/g, '**')
        .replace(/sqrt/g, 'Math.sqrt')
        .replace(/abs/g, 'Math.abs')
        .replace(/pow/g, 'Math.pow')
        .replace(/sin/g, 'Math.sin')
        .replace(/cos/g, 'Math.cos')
        .replace(/tan/g, 'Math.tan')
        .replace(/log/g, 'Math.log')
        .replace(/PI/g, 'Math.PI')
        .replace(/E/g, 'Math.E');

      // 只允许数字、运算符和 Math 函数
      if (!/^[\d\+\-\*\/\(\)\.\s\%Math\.sqrtabsinoclgPE]+$/.test(expr)) {
        return '错误: 表达式包含非法字符';
      }

      const result = new Function('return ' + expr)();
      return `结果: ${result}`;
    } catch (e: any) {
      return `计算错误: ${e.message}`;
    }
  },
};

const convertUnitTool: Tool = {
  name: 'convert_unit',
  description: '单位转换，支持长度、重量、温度',
  parameters: {
    value: {
      type: 'number',
      description: '要转换的值',
      required: true,
    },
    from: {
      type: 'string',
      description: '源单位 (如 m, kg, C)',
      required: true,
    },
    to: {
      type: 'string',
      description: '目标单位 (如 ft, lb, F)',
      required: true,
    },
  },
  execute: async ({ value, from, to }) => {
    const v = Number(value);
    const f = String(from).toLowerCase();
    const t = String(to).toLowerCase();

    // 长度转换 (转换为米再转换)
    const lengthUnits: Record<string, number> = {
      m: 1,
      km: 1000,
      cm: 0.01,
      mm: 0.001,
      ft: 0.3048,
      in: 0.0254,
      mi: 1609.344,
    };

    // 重量转换 (转换为千克再转换)
    const weightUnits: Record<string, number> = {
      kg: 1,
      g: 0.001,
      mg: 0.000001,
      lb: 0.453592,
      oz: 0.0283495,
    };

    // 温度转换
    if (f === 'c' && t === 'f') {
      return `${v}°C = ${(v * 9/5 + 32).toFixed(2)}°F`;
    }
    if (f === 'f' && t === 'c') {
      return `${v}°F = ${((v - 32) * 5/9).toFixed(2)}°C`;
    }
    if (f === 'c' && t === 'k') {
      return `${v}°C = ${(v + 273.15).toFixed(2)}K`;
    }
    if (f === 'k' && t === 'c') {
      return `${v}K = ${(v - 273.15).toFixed(2)}°C`;
    }

    // 长度转换
    if (f in lengthUnits && t in lengthUnits) {
      const meters = v * lengthUnits[f];
      const result = meters / lengthUnits[t];
      return `${v} ${from} = ${result.toFixed(4)} ${to}`;
    }

    // 重量转换
    if (f in weightUnits && t in weightUnits) {
      const kg = v * weightUnits[f];
      const result = kg / weightUnits[t];
      return `${v} ${from} = ${result.toFixed(4)} ${to}`;
    }

    return `错误: 不支持的单位转换 ${from} -> ${to}`;
  },
};

// 导出 tools 数组
export default [calculateTool, convertUnitTool];
export const tools = [calculateTool, convertUnitTool];
