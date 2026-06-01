/**
 * 浏览器端：富途「自动交换财务账户资料 (AEOI)」PDF -> 标准「利息股息及其他收入汇总」xlsx。
 *
 * 与 scripts/convert-aeoi-pdf.mjs 的逻辑一致，但运行在浏览器中：
 *   - 用 pdfjs-dist 解析 PDF 文本
 *   - 汇率取「目标纳税年度 12 月」的香港税务局(IRD)官方平均汇率
 *     （浏览器直连 IRD 会被 CORS 拦截，故汇率以用户输入为主，自动抓取为尽力而为）
 *   - 用 xlsx 生成与历史年份格式一致的工作簿
 */
import * as pdfjsLib from 'pdfjs-dist'
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'
import * as XLSX from 'xlsx'

// Vite 的 `?worker` 导入会把 worker 编译为可在 dev/prod 两种模式下正常加载的 Worker 构造器。
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker()

const RATE_NOTE =
  '*汇率说明:对于持有多种货币的账户，其利息、分红及其他收入，均已统一换算为港币。换算所使用的汇率依据香港税务局(IRD)公布的官方汇率，详情请参考IRD官网 https://www.ird.gov.hk/eng/tax/bus_aer.htm。'

export interface AccountIncomeRow {
  label: string
  balance: number
  dividends: number
  interest: number
  grossProceeds: number
  otherIncome: number
}

export interface AeoiParseResult {
  year: number
  nnid: string
  name: string
  rows: AccountIncomeRow[]
}

export interface DecRate {
  usdToHkd: number
  rmb100: number
}

/** 目标纳税年度 12 月所属财政年度页面 URL（IRD 财年 4 月—次年 3 月）。 */
export function irdUrlForYear(year: number): string {
  const nn = String((year + 1) % 100).padStart(2, '0')
  return `https://www.ird.gov.hk/eng/tax/bus_aer${nn}.htm`
}

function num(raw: string): number {
  return Number(String(raw).replace(/,/g, ''))
}

function fmt2(n: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  })
}

/** 提取 PDF 全部文本，按 y 坐标分行，行内按 x 坐标拼接。 */
export async function extractLines(buffer: ArrayBuffer): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const byY = new Map<number, { x: number; s: string }[]>()
    for (const it of tc.items as Array<{ str?: string; transform?: number[] }>) {
      if (typeof it.str !== 'string' || !it.transform) continue
      const y = Math.round(it.transform[5])
      if (!byY.has(y)) byY.set(y, [])
      byY.get(y)!.push({ x: it.transform[4], s: it.str })
    }
    const ys = [...byY.keys()].sort((a, b) => b - a)
    for (const y of ys) {
      const line = byY
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map(o => o.s)
        .join('')
      if (line.trim()) lines.push(line)
    }
  }
  return lines
}

function detectYear(lines: string[]): number {
  for (const l of lines) {
    const m =
      l.match(/(\d{4})\s*年度申/) ||
      l.match(/Information for\s+(\d{4})/i) ||
      l.match(/–\s*(\d{4})/)
    if (m) return Number(m[1])
  }
  return 0
}

function detectNnid(lines: string[]): string {
  for (const l of lines) {
    const m = l.match(/(?:牛牛号|牛牛號|NNID)\s*[：:]\s*(\d+)/)
    if (m) return m[1]
  }
  return ''
}

function detectName(lines: string[]): string {
  for (const l of lines) {
    const m = l.match(/(?:姓名|Name)\s*[：:]\s*(.+)$/)
    if (m) return m[1].trim()
  }
  return ''
}

/**
 * 从行文本提取账户财务行：<账户名> HKD <价值> HKD <股息> HKD <利息> HKD <总卖出> HKD <其他收入>。
 * 仅中文段落账户名与数值同处一行，英文段落账户名分行，故天然只匹配中文行。
 */
function extractAccountRows(lines: string[]): AccountIncomeRow[] {
  const re =
    /^(.+?)\s+HKD\s+([\d.,]+)\s+HKD\s+([\d.,]+)\s+HKD\s+([\d.,]+)\s+HKD\s+([\d.,]+)\s+HKD\s+([\d.,]+)\s*$/
  const rows: AccountIncomeRow[] = []
  for (const l of lines) {
    const m = l.trim().match(re)
    if (!m) continue
    rows.push({
      label: m[1].trim(),
      balance: num(m[2]),
      dividends: num(m[3]),
      interest: num(m[4]),
      grossProceeds: num(m[5]),
      otherIncome: num(m[6]),
    })
  }
  return rows
}

/** 多语言段落重复出现，按 5 个数值签名去重；账户名优先取繁体中文。 */
function dedupeRows(rows: AccountIncomeRow[]): AccountIncomeRow[] {
  const bySig = new Map<string, AccountIncomeRow>()
  for (const r of rows) {
    const sig = [r.balance, r.dividends, r.interest, r.grossProceeds, r.otherIncome].join('|')
    const existing = bySig.get(sig)
    if (!existing) {
      bySig.set(sig, r)
    } else {
      const score = (lbl: string) => (/證/.test(lbl) ? 2 : /证/.test(lbl) ? 1 : 0)
      if (score(r.label) > score(existing.label)) bySig.set(sig, r)
    }
  }
  return [...bySig.values()]
}

/** 解析 AEOI PDF，返回年份/牛牛号/持有人/账户收入行（仅保留非全零行）。 */
export async function parseAeoiPdf(buffer: ArrayBuffer): Promise<AeoiParseResult> {
  const lines = await extractLines(buffer)
  const year = detectYear(lines)
  const nnid = detectNnid(lines)
  const name = detectName(lines)
  const rows = dedupeRows(extractAccountRows(lines)).filter(
    r => r.balance || r.dividends || r.interest || r.grossProceeds || r.otherIncome,
  )
  return { year, nnid, name, rows }
}

/** 从 IRD 页面 HTML 文本解析「Dec <year>」整行 8 个汇率（USD…HK$100兑人民币）。 */
export function parseDecRateFromHtml(html: string, year: number): string[] | null {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
  const re = new RegExp(
    `Dec\\s+${year}\\s+` + Array.from({ length: 8 }, () => '([\\d.]+)').join('\\s+'),
  )
  const m = text.match(re)
  if (!m) return null
  return m.slice(1, 9)
}

/**
 * 尽力而为地从 IRD 官网抓取目标年 12 月汇率。
 * 浏览器跨域通常会被 CORS 拦截而抛错——调用方应回退到手动输入。
 */
export async function tryFetchIrdRate(year: number): Promise<DecRate> {
  const res = await fetch(irdUrlForYear(year))
  if (!res.ok) throw new Error(`IRD 请求失败 (${res.status})`)
  const html = await res.text()
  const vals = parseDecRateFromHtml(html, year)
  if (!vals) throw new Error(`未找到 Dec ${year} 汇率`)
  return { usdToHkd: Number(vals[0]), rmb100: Number(vals[7]) }
}

/** 汇率保留原始精度（IRD 汇率为 4 位小数），不可按金额四舍五入到 2 位。 */
function rateStr(n: number): string {
  return String(n)
}

/** 构建「参考汇率」工作表 AOA（解析器读取 col0=月份, col1=USD, col8=HK$100兑人民币）。 */
function buildRateAOA(year: number, rate: DecRate): unknown[][] {
  const usd = rateStr(rate.usdToHkd)
  const rmb = rateStr(rate.rmb100)
  return [
    [
      'For year \nending on \nlast day \nof month',
      'Average Rate in Hong Kong Dollar for:',
      '', '', '', '', '', '',
      'HK $100 for\nRenminbi\n(Chinese Yuan)',
    ],
    ['', 'USD\nDollar', 'Pound\nSterling', 'Canadian\nDollar', 'Swiss\nFranc', 'Japanese\nYen\n(per 100)', 'Australian\nDollar', 'Euro', '', ''],
    [`Dec ${year}`, usd, '', '', '', '', '', '', rmb],
    [''],
    [RATE_NOTE],
  ]
}

export interface BuildOptions {
  year: number
  nnid: string
  name: string
  rows: AccountIncomeRow[]
  rate: DecRate
}

/** 生成与历史年份格式一致的工作簿，返回 xlsx 二进制。 */
export function buildWorkbookArray(opts: BuildOptions): Uint8Array {
  const { year, nnid, name, rows, rate } = opts

  const accountInfoAOA: unknown[][] = [['姓名', '牛牛号', '账户名称', '年份']]
  for (const r of rows) accountInfoAOA.push([name || '', nnid || '', r.label, String(year)])

  const dividendAOA: unknown[][] = [
    ['牛牛号', '年份', '账户名称', '全年股息', '全年利息', '全年其他收入', '币种'],
  ]
  for (const r of rows) {
    dividendAOA.push([
      nnid || '',
      String(year),
      r.label,
      fmt2(r.dividends),
      fmt2(r.interest),
      fmt2(r.otherIncome),
      'HKD',
    ])
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(accountInfoAOA), '账户信息')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dividendAOA), '股息、利息及其他收入')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildRateAOA(year, rate)), '参考汇率')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}

export function outputFilename(year: number, nnid: string): string {
  return `${year}_利息股息及其他收入汇总_${nnid || 'unknown'}.xlsx`
}
