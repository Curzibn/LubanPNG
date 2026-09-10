import { DEFAULT_API_BASE, API_BASE_ENV, USER_AGENT } from "./api.js"
import { API_KEY_ENV } from "./config.js"
import { VERSION } from "./version.js"

export const HELP = [
  `lubanpng ${VERSION} — LubanPNG 命令行图片压缩`,
  "",
  "用法：",
  "  lubanpng <命令> [选项]",
  "",
  "命令：",
  "  login                粘贴 API Key，校验后保存到本机",
  "  logout               清除本机保存的 API Key",
  "  compress <路径...>   压缩文件或目录",
  "  usage                查看套餐、本期用量与重置时间",
  "",
  "全局选项：",
  `  --api-base <url>     API 地址（默认 ${DEFAULT_API_BASE}）`,
  "  -h, --help           显示帮助",
  "  -v, --version        显示版本",
  "",
  "compress 选项：",
  "  --out <dir>          输出目录，保持输入目录结构",
  "  --in-place           覆盖原文件",
  "  --recursive          递归处理目录",
  "  --concurrency <n>    并发数（默认 4，最大 16）",
  "",
  "环境变量：",
  `  ${API_KEY_ENV}     API Key（优先于本机配置）`,
  `  ${API_BASE_ENV}    API 地址覆盖`,
  "",
  `User-Agent: ${USER_AGENT}`,
  "",
].join("\n")
