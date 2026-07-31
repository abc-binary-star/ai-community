// Hono 应用级别的环境类型：声明挂到 context 上的变量

export interface AuthUser {
  userId: string
  username: string
}

export type AppEnv = {
  Variables: {
    user: AuthUser
  }
}
