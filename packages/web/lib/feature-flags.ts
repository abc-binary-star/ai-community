'use client'

// 灰度开关：NEXT_PUBLIC_ANNOTATIONS_ENABLED=false 时关闭段落想法入口
export function isAnnotationsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ANNOTATIONS_ENABLED !== 'false'
}
