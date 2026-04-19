import type { YearlyTaxReport } from '../types'

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function generateReportText(report: YearlyTaxReport): string {
  const lines: string[] = []

  lines.push(`境外证券收益个税计算报告`)
  lines.push(`${'='.repeat(50)}`)
  lines.push(`报告年度：${report.year}`)
  lines.push(`生成时间：${new Date().toLocaleString('zh-CN')}`)
  lines.push('')

  lines.push(`一、总览`)
  lines.push(`${'─'.repeat(50)}`)
  lines.push(`股票已实现收益 (CNY)：¥${fmt(report.stock.totalGainCny)}`)
  lines.push(`基金收益 (CNY)：¥${fmt(report.fund.totalGainCny)}`)
  lines.push(`分红/利息 (CNY)：¥${fmt(report.dividend.totalDividendCny)}`)
  lines.push(`应纳税所得额合计 (CNY)：¥${fmt(report.totalTaxableIncomeCny)}`)
  lines.push(`预估应缴税额 (CNY)：¥${fmt(report.totalEstimatedTax)}`)
  lines.push('')

  lines.push(`二、股票交易明细（移动加权平均成本法）`)
  lines.push(`${'─'.repeat(50)}`)
  if (report.stock.realizedGains.length === 0) {
    lines.push('该年度无股票卖出交易')
  } else {
    for (const g of report.stock.realizedGains) {
      lines.push(`${g.symbol} | 卖出日期: ${g.sellDate} | 数量: ${g.sellQuantity}`)
      lines.push(`  卖出金额: ${fmt(g.sellAmount)} ${g.currency} | 成本: ${fmt(g.costBasis)} | 手续费: ${fmt(g.fees)}`)
      lines.push(`  收益: ${fmt(g.gain)} ${g.currency} → ¥${fmt(g.gainCny)}`)
    }
    lines.push('')
    lines.push(`年度股票净收益 (CNY)：¥${fmt(report.stock.totalGainCny)}`)
    lines.push(`应纳税所得额 (CNY)：¥${fmt(report.stock.netTaxableIncomeCny)}`)
    lines.push(`预估税额 (20%)：¥${fmt(report.stock.estimatedTax)}`)
  }
  lines.push('')

  if (report.stock.optionStockGains.length > 0) {
    lines.push(`二-附、期权行权股票交易（已单独完税，不计入应纳税额）`)
    lines.push(`${'─'.repeat(50)}`)
    for (const g of report.stock.optionStockGains) {
      lines.push(`${g.symbol} | 卖出日期: ${g.sellDate} | 数量: ${g.sellQuantity}`)
      lines.push(`  卖出金额: ${fmt(g.sellAmount)} ${g.currency} | 成本: ${fmt(g.costBasis)} | 手续费: ${fmt(g.fees)}`)
      lines.push(`  收益: ${fmt(g.gain)} ${g.currency} → ¥${fmt(g.gainCny)}`)
    }
    lines.push(`期权股票收益合计 (CNY)：¥${fmt(report.stock.optionStockTotalGainCny)}`)
    lines.push('')
  }

  if (report.fund.gains.length > 0) {
    lines.push(`三、基金收益明细（与股票不可互抵）`)
    lines.push(`${'─'.repeat(50)}`)
    for (const g of report.fund.gains) {
      lines.push(`${g.symbol} | 期初: ${fmt(g.startValue)} | 申购: ${fmt(g.buyAmount)} | 赎回: ${fmt(g.sellAmount)} | 期末: ${fmt(g.endValue)} | 收益: ${fmt(g.gain)} HKD → ¥${fmt(g.gainCny)}`)
    }
    lines.push(`基金总收益 (CNY)：¥${fmt(report.fund.totalGainCny)}`)
    lines.push('')
  }

  if (report.dividend.details.length > 0) {
    lines.push(`四、分红/利息税务明细`)
    lines.push(`${'─'.repeat(50)}`)
    for (const d of report.dividend.details) {
      lines.push(`${d.source} | 金额: ¥${fmt(d.amountCny)} | 已代扣: ${(d.withheldRate * 100).toFixed(0)}% | 应补缴: ¥${fmt(d.netPayable)}`)
    }
    lines.push(`分红总额 (CNY)：¥${fmt(report.dividend.totalDividendCny)}`)
    lines.push(`应补缴税额 (CNY)：¥${fmt(report.dividend.netTaxPayable)}`)
    lines.push('')
  }

  if (report.warnings.length > 0) {
    lines.push(`五、数据校验提示`)
    lines.push(`${'─'.repeat(50)}`)
    for (const w of report.warnings) {
      lines.push(`⚠️ ${w.message}`)
    }
    lines.push('')
  }

  if (report.validation) {
    lines.push(`六、对账验证`)
    lines.push(`${'─'.repeat(50)}`)
    lines.push(`已实现收益 (CNY)：¥${fmt(report.validation.calculatedIncome)}`)
    if (report.validation.unrealizedPnlCny != null) {
      lines.push(`未实现盈亏 (CNY)：¥${fmt(report.validation.unrealizedPnlCny)}`)
    }
    if (report.validation.optionStockGainCny) {
      lines.push(`期权股票收益 (CNY)：¥${fmt(report.validation.optionStockGainCny)}`)
    }
    lines.push(`账户净值变化 (CNY)：¥${fmt(report.validation.netAssetChange)}`)
    lines.push(`差额 (CNY)：¥${fmt(report.validation.difference)}`)
    lines.push(`差异率：${(report.validation.differenceRate * 100).toFixed(1)}%`)
    lines.push('')
  }

  lines.push(`数据来源`)
  lines.push(`${'─'.repeat(50)}`)
  for (const s of report.dataSources) {
    lines.push(`✓ ${s}`)
  }
  lines.push('')
  lines.push(`计算方式：移动加权平均成本法`)
  lines.push(`汇率来源：富途年度结单参考汇率（年末汇率）`)
  lines.push(`税率：财产转让所得 20%、股息红利所得 20%（境外已缴税可抵免）`)
  lines.push('')
  lines.push(`* 本报告仅供参考，不构成税务建议。实际申报请咨询专业税务顾问。`)

  return lines.join('\n')
}

export function downloadReport(report: YearlyTaxReport): void {
  const text = generateReportText(report)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `个税计算报告_${report.year}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
