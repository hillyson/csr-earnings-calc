#!/usr/bin/env node
/**
 * 富途「自动交换财务账户资料 (AEOI)」PDF -> 标准「利息股息及其他收入汇总」xlsx 转换脚本
 *
 * 富途从 2025 年起，把原本的「利息股息及其他收入汇总.xlsx」换成了 AEOI PDF，
 * 且不再随附参考汇率。本脚本将该 PDF 还原成与历史年份一致的 xlsx 模板，
 * 供本项目的解析器（src/lib/parser/dividend-statement.ts）直接读取。
 *
 * 生成的 xlsx 含三张工作表：
 *   1. 账户信息            —— 持有人 + 账户清单（信息性，解析器不使用）
 *   2. 股息、利息及其他收入 —— 解析器读取：账户名称 / 全年股息 / 全年利息 / 全年其他收入 / 币种
 *   3. 参考汇率            —— 解析器读取：月份 / USD→HKD / HK$100→RMB
 *
 * 汇率：AEOI PDF 不提供汇率。脚本会自动从香港税务局(IRD)官网抓取「目标纳税年度 12 月」的官方平均汇率，
 *       不沿用往年数据。IRD 按财政年度（4 月—次年 3 月）分页，目标年 12 月落在「该年/次年」财年页，
 *       页面 URL 规则：https://www.ird.gov.hk/eng/tax/bus_aer<NN>.htm，其中 NN =（目标年+1）后两位
 *       （如 2025 年 12 月 → 2025/26 财年 → bus_aer26.htm）。
 *
 * 用法：
 *   node scripts/convert-aeoi-pdf.mjs <AEOI.pdf> [选项]
 *
 * 选项：
 *   --out <路径>        输出 xlsx 路径（默认：与 PDF 同目录，<年份>_利息股息及其他收入汇总_<牛牛号>.xlsx）
 *   --year <年份>       覆盖年份（默认：从 PDF 文本自动识别）
 *   --rate-html <path>  从本地保存的 IRD 页面 HTML 解析 Dec 汇率（离线/无网络时使用）
 *   --rate-from <xlsx>  直接从其它 xlsx 复制「参考汇率」表（最高优先级，覆盖自动抓取）
 *   --ird-url <url>     覆盖默认 IRD 页面 URL（默认按财年自动推导）
 *
 * 示例：
 *   node scripts/convert-aeoi-pdf.mjs "富途年度结单/2025_自动交换财务账户资料_14621048.pdf"
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import * as XLSX from 'xlsx'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, basename, join } from 'node:path'

const RATE_NOTE = '*汇率说明:对于持有多种货币的账户，其利息、分红及其他收入，均已统一换算为港币。换算所使用的汇率依据香港税务局(IRD)公布的官方汇率，详情请参考IRD官网 https://www.ird.gov.hk/eng/tax/bus_aer.htm。'

/** 目标纳税年度 12 月所属财政年度页面 URL（IRD 财年 4 月—次年 3 月，故 12 月属「年/年+1」财年）。 */
function irdUrlForYear(year) {
  const nn = String((year + 1) % 100).padStart(2, '0')
  return `https://www.ird.gov.hk/eng/tax/bus_aer${nn}.htm`
}

/**
 * 从 IRD 页面 HTML 文本解析「Dec <year>」整行的 8 个汇率。
 * 列顺序：USD, 英镑, 加元, 瑞郎, 日元(每100), 澳元, 欧元, HK$100兑人民币。
 */
function parseDecRateFromHtml(html, year) {
  const text = html
    .replace(/<[^>]+>/g, ' ')   // 去 HTML 标签（真实 IRD 页面）
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[|]/g, ' ')       // 去 Markdown 表格竖线（已渲染为文本的页面）
    .replace(/\s+/g, ' ')
  // Dec <year> 后跟 8 个汇率，列间允许空白分隔
  const re = new RegExp(`Dec\\s+${year}\\s+` + Array.from({ length: 8 }, () => '([\\d.]+)').join('\\s+'))
  const m = text.match(re)
  if (!m) return null
  return m.slice(1, 9) // 8 个数值字符串
}

/** 抓取/读取 IRD 页面并解析目标年 12 月汇率，返回「参考汇率」工作表用的 9 列数据行。 */
async function fetchIrdDecRateRow(year, opts = {}) {
  let html
  let source
  if (opts.rateHtmlPath) {
    html = readFileSync(resolve(opts.rateHtmlPath), 'utf8')
    source = `本地 HTML ${basename(opts.rateHtmlPath)}`
  } else {
    const url = opts.irdUrl || irdUrlForYear(year)
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`IRD 页面请求失败 (${res.status}): ${url}`)
    html = await res.text()
    source = url
  }
  const vals = parseDecRateFromHtml(html, year)
  if (!vals) {
    throw new Error(`未能在 IRD 页面中找到「Dec ${year}」汇率行（来源：${source}）。`)
  }
  // 组装为模板第 3 行：月份 + 8 个汇率
  return { row: [`Dec ${year}`, ...vals], source }
}

/** 构建「参考汇率」工作表 AOA（格式与历史模板一致，解析器读取 col0=月份, col1=USD, col8=HK$100兑人民币）。 */
function buildRateSheetAOA(dataRow) {
  return [
    ['For year \nending on \nlast day \nof month', 'Average Rate in Hong Kong Dollar for:', '', '', '', '', '', '', 'HK $100 for\nRenminbi\n(Chinese Yuan)'],
    ['', 'USD\nDollar', 'Pound\nSterling', 'Canadian\nDollar', 'Swiss\nFranc', 'Japanese\nYen\n(per 100)', 'Australian\nDollar', 'Euro', '', ''],
    dataRow,
    [''],
    [RATE_NOTE],
  ]
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') args.out = argv[++i]
    else if (a === '--rate-from') args.rateFrom = argv[++i]
    else if (a === '--rate-html') args.rateHtml = argv[++i]
    else if (a === '--ird-url') args.irdUrl = argv[++i]
    else if (a === '--year') args.year = Number(argv[++i])
    else args._.push(a)
  }
  return args
}

/** 提取 PDF 全部文本，按 y 坐标分行，行内按 x 坐标拼接（空串拼接，保留原有空格分隔）。 */
async function extractLines(pdfPath) {
  const data = new Uint8Array(readFileSync(pdfPath))
  const doc = await getDocument({ data, useSystemFonts: true }).promise
  const lines = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const byY = new Map()
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue
      const y = Math.round(it.transform[5])
      if (!byY.has(y)) byY.set(y, [])
      byY.get(y).push({ x: it.transform[4], s: it.str })
    }
    const ys = [...byY.keys()].sort((a, b) => b - a)
    for (const y of ys) {
      const line = byY.get(y).sort((a, b) => a.x - b.x).map(o => o.s).join('')
      if (line.trim()) lines.push(line)
    }
  }
  return lines
}

function detectYear(lines, override) {
  if (override) return override
  for (const l of lines) {
    const m = l.match(/(\d{4})\s*年度申/) || l.match(/Information for\s+(\d{4})/i) || l.match(/–\s*(\d{4})/)
    if (m) return Number(m[1])
  }
  return 0
}

function detectNnid(lines) {
  for (const l of lines) {
    const m = l.match(/(?:牛牛号|牛牛號|NNID)\s*[：:]\s*(\d+)/)
    if (m) return m[1]
  }
  return ''
}

function detectName(lines) {
  for (const l of lines) {
    const m = l.match(/(?:姓名|Name)\s*[：:]\s*(.+)$/)
    if (m) return m[1].trim()
  }
  return ''
}

function num(raw) {
  return Number(String(raw).replace(/,/g, ''))
}

function fmt2(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
}

/**
 * 从行文本中提取账户财务行。
 * 目标行形如：<账户名> HKD <价值> HKD <股息> HKD <利息> HKD <总卖出> HKD <其他收入>
 * 仅中文段落的账户名与数值同处一行，英文段落账户名分行，故天然只匹配中文行。
 */
function extractAccountRows(lines) {
  const re = /^(.+?)\s+HKD\s+([\d.,]+)\s+HKD\s+([\d.,]+)\s+HKD\s+([\d.,]+)\s+HKD\s+([\d.,]+)\s+HKD\s+([\d.,]+)\s*$/
  const rows = []
  for (const l of lines) {
    const m = l.trim().match(re)
    if (!m) continue
    const label = m[1].trim()
    // 排除表头（如 "...股息 利息 总卖出 其他收入"）——表头不含 HKD 数值，已被正则排除
    rows.push({
      label,
      balance: num(m[2]),
      dividends: num(m[3]),
      interest: num(m[4]),
      grossProceeds: num(m[5]),
      otherIncome: num(m[6]),
    })
  }
  return rows
}

/** 同一账户数据在多语言段落重复出现，按 5 个数值签名去重；账户名优先取繁体中文。 */
function dedupeRows(rows) {
  const bySig = new Map()
  for (const r of rows) {
    const sig = [r.balance, r.dividends, r.interest, r.grossProceeds, r.otherIncome].join('|')
    const existing = bySig.get(sig)
    if (!existing) {
      bySig.set(sig, r)
    } else {
      // 标签优先级：含繁体「證券」> 含简体「证券」> 其它
      const score = (lbl) => (/證/.test(lbl) ? 2 : /证/.test(lbl) ? 1 : 0)
      if (score(r.label) > score(existing.label)) bySig.set(sig, r)
    }
  }
  return [...bySig.values()]
}

function loadRateSheetAOA(xlsxPath) {
  const wb = XLSX.read(readFileSync(xlsxPath), { type: 'buffer' })
  const ws = wb.Sheets['参考汇率']
  if (!ws) return null
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const pdfPath = args._[0]
  if (!pdfPath || !existsSync(pdfPath)) {
    console.error('用法: node scripts/convert-aeoi-pdf.mjs <AEOI.pdf> [--out <xlsx>] [--year <年份>] [--rate-html <html>] [--rate-from <xlsx>] [--ird-url <url>]')
    process.exit(1)
  }

  const absPdf = resolve(pdfPath)
  const pdfDir = dirname(absPdf)

  const lines = await extractLines(absPdf)
  const year = detectYear(lines, args.year)
  const nnid = detectNnid(lines)
  const name = detectName(lines)

  if (!year) {
    console.error('无法从 PDF 识别年份，请用 --year 指定。')
    process.exit(1)
  }

  const rawRows = extractAccountRows(lines)
  const rows = dedupeRows(rawRows).filter(
    r => r.balance || r.dividends || r.interest || r.grossProceeds || r.otherIncome,
  )

  if (rows.length === 0) {
    console.error('未能从 PDF 提取到任何账户财务行，请检查 PDF 格式。')
    process.exit(1)
  }

  // ---- 工作表 1：账户信息 ----
  const accountInfoAOA = [['姓名', '牛牛号', '账户名称', '年份']]
  for (const r of rows) {
    accountInfoAOA.push([name || '', nnid || '', r.label, String(year)])
  }

  // ---- 工作表 2：股息、利息及其他收入 ----
  // 表头与历史年份保持一致；币种统一 HKD（AEOI 已统一换算为港币）。
  const dividendAOA = [['牛牛号', '年份', '账户名称', '全年股息', '全年利息', '全年其他收入', '币种']]
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

  // ---- 工作表 3：参考汇率 ----
  // 优先级：--rate-from 指定 xlsx 覆盖 > 自动抓取/解析 IRD 目标年 12 月汇率（默认）
  let rateAOA = null
  let rateNote = ''
  let rateRowForLog = null
  if (args.rateFrom && existsSync(resolve(args.rateFrom))) {
    rateAOA = loadRateSheetAOA(resolve(args.rateFrom))
    rateNote = `复制自 ${basename(resolve(args.rateFrom))}`
  } else {
    const { row, source } = await fetchIrdDecRateRow(year, {
      rateHtmlPath: args.rateHtml,
      irdUrl: args.irdUrl,
    })
    rateAOA = buildRateSheetAOA(row)
    rateRowForLog = row
    rateNote = `IRD Dec ${year} 官方汇率（来源：${source}）`
  }
  if (!rateAOA) {
    console.error(`无法确定 ${year} 年汇率。`)
    process.exit(1)
  }

  // ---- 组装并写出 ----
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(accountInfoAOA), '账户信息')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dividendAOA), '股息、利息及其他收入')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rateAOA), '参考汇率')

  const outPath = args.out
    ? resolve(args.out)
    : join(pdfDir, `${year}_利息股息及其他收入汇总_${nnid || 'unknown'}.xlsx`)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  writeFileSync(outPath, buf)

  // ---- 摘要 ----
  console.log('转换完成')
  console.log('  来源 PDF :', basename(absPdf))
  console.log('  年份     :', year)
  console.log('  牛牛号   :', nnid)
  console.log('  持有人   :', name)
  console.log('  汇率     :', rateNote)
  if (rateRowForLog) {
    console.log(`            ${rateRowForLog[0]}: USD→HKD=${rateRowForLog[1]}, HK$100→RMB=${rateRowForLog[8]}`)
  }
  console.log('  输出文件 :', outPath)
  console.log('  股息/利息/其他收入明细:')
  for (const r of rows) {
    console.log(`    - ${r.label}: 股息=${fmt2(r.dividends)} 利息=${fmt2(r.interest)} 其他=${fmt2(r.otherIncome)} HKD (价值=${fmt2(r.balance)}, 总卖出=${fmt2(r.grossProceeds)})`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
