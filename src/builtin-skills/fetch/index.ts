/**
 * Fetch Skill - HTTP 请求工具
 */

import { Tool } from '../../core/types.js';

const fetchUrlTool: Tool = {
  name: 'fetch_url',
  description: '发送 HTTP GET 请求获取 URL 内容',
  parameters: {
    url: {
      type: 'string',
      description: '要获取的 URL',
      required: true,
    },
    maxLength: {
      type: 'number',
      description: '最大返回字符数，默认 5000',
      required: false,
    },
  },
  execute: async ({ url, maxLength = 5000 }) => {
    try {
      const response = await fetch(String(url), {
        headers: {
          'User-Agent': 'TurboClaw/1.0',
        },
      });

      if (!response.ok) {
        return `HTTP 错误: ${response.status} ${response.statusText}`;
      }

      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        const data = await response.json();
        return JSON.stringify(data, null, 2).slice(0, Number(maxLength));
      }

      const text = await response.text();
      
      // 如果是 HTML，尝试提取正文
      if (contentType.includes('text/html')) {
        // 简单的 HTML 标签去除
        const cleanText = text
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (cleanText.length > Number(maxLength)) {
          return cleanText.slice(0, Number(maxLength)) + '\n... (内容已截断)';
        }
        return cleanText;
      }

      if (text.length > Number(maxLength)) {
        return text.slice(0, Number(maxLength)) + '\n... (内容已截断)';
      }
      return text;
    } catch (e: any) {
      return `请求错误: ${e.message}`;
    }
  },
};

const fetchJsonTool: Tool = {
  name: 'fetch_json',
  description: '获取 JSON API 数据并格式化返回',
  parameters: {
    url: {
      type: 'string',
      description: 'API URL',
      required: true,
    },
  },
  execute: async ({ url }) => {
    try {
      const response = await fetch(String(url), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'TurboClaw/1.0',
        },
      });

      if (!response.ok) {
        return `HTTP 错误: ${response.status} ${response.statusText}`;
      }

      const data = await response.json();
      return JSON.stringify(data, null, 2);
    } catch (e: any) {
      return `请求错误: ${e.message}`;
    }
  },
};

export default [fetchUrlTool, fetchJsonTool];
export const tools = [fetchUrlTool, fetchJsonTool];
