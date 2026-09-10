import { createInterface } from "node:readline"
import { CancelledError } from "./errors.js"

export type Io = {
  write: (text: string) => void
  writeError: (text: string) => void
  promptSecret: (label: string) => Promise<string>
}

const readVisibleLine = (label: string): Promise<string> =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(label, (answer) => {
      rl.close()
      resolve(answer)
    })
  })

const readHiddenLine = (label: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const stdin = process.stdin
    const stdout = process.stdout
    stdout.write(label)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding("utf8")
    let value = ""
    const cleanup = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off("data", onData)
    }
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup()
          stdout.write("\n")
          resolve(value)
          return
        }
        if (char === "\u0003") {
          cleanup()
          stdout.write("\n")
          reject(new CancelledError())
          return
        }
        if (char === "\u007f" || char === "\b") {
          if (value !== "") {
            value = value.slice(0, -1)
            stdout.write("\b \b")
          }
          continue
        }
        value += char
        stdout.write("*")
      }
    }
    stdin.on("data", onData)
  })

export const defaultIo: Io = {
  write: (text) => {
    process.stdout.write(text)
  },
  writeError: (text) => {
    process.stderr.write(text)
  },
  promptSecret: (label) =>
    process.stdin.isTTY ? readHiddenLine(label) : readVisibleLine(label),
}
