---
name: calculator
description: 数学计算工具
version: 1.0.0
author: turboclaw
tools:
  - name: calculate
    description: 执行数学计算，支持 + - * / ^ sqrt abs 等运算
  - name: convert_unit
    description: 单位转换，如长度、重量、温度等
---

# Calculator Skill

提供数学计算和单位转换功能。

## calculate

执行数学计算表达式。

示例：
- `2 + 2 * 3` = 8
- `sqrt(16) + abs(-5)` = 9
- `2^10` = 1024

## convert_unit

单位转换。

支持的转换：
- 长度：m, km, cm, mm, ft, in, mi
- 重量：kg, g, mg, lb, oz
- 温度：C, F, K
