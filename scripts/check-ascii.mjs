// The script-tag bundle runs on pages that may not declare UTF-8: any non-ASCII byte there can break it
import { readFileSync } from 'node:fs'

for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, 'utf8')
  const index = text.search(/[^\p{ASCII}]/u)
  if (index >= 0) {
    console.error(`${file}: non-ASCII character at ${index}: …${text.slice(Math.max(0, index - 40), index + 10)}…`)
    process.exit(1)
  }
}
