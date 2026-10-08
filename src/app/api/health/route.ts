import { NextResponse } from 'next/server'

/**
 * GET /api/health：同源健康检查（恒 200）——探测 Next 服务自身可达性，
 * 供 E2E 拦截制造失败与部署探活使用。
 */
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
