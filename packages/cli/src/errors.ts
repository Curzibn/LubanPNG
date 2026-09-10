export class UsageError extends Error {
  readonly exitCode = 2

  constructor(message: string) {
    super(message)
    this.name = "UsageError"
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: number

  constructor(status: number, code: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

export class CancelledError extends Error {
  constructor() {
    super("已取消")
    this.name = "CancelledError"
  }
}
