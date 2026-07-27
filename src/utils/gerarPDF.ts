import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ResumoComissaoBarbeiro, RelatorioComissaoCompleto } from '../lib/api'

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)

const formatDate = (value: string): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

const formatPeriod = (dataInicio: string, dataFim: string): string =>
  `Período: ${formatDate(dataInicio)} a ${formatDate(dataFim)}`

export function gerarPDFResumoComissoes(
  dados: ResumoComissaoBarbeiro[],
  dataInicio: string,
  dataFim: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(40, 40, 40)
  doc.text('Relatório de Comissões', pageWidth / 2, 40, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(90, 90, 90)
  doc.text(formatPeriod(dataInicio, dataFim), pageWidth / 2, 60, { align: 'center' })

  const body = dados.map((d) => [
    d.nome,
    String(d.total_servicos ?? 0),
    formatCurrency(d.valor_servicos),
    formatCurrency(d.comissao_servicos),
    String(d.total_vendas ?? 0),
    formatCurrency(d.valor_vendas),
    formatCurrency(d.comissao_vendas),
    formatCurrency(d.total_a_receber),
  ])

  const totais = {
    total_servicos: dados.reduce((s, d) => s + (d.total_servicos ?? 0), 0),
    valor_servicos: dados.reduce((s, d) => s + (d.valor_servicos ?? 0), 0),
    comissao_servicos: dados.reduce((s, d) => s + (d.comissao_servicos ?? 0), 0),
    total_vendas: dados.reduce((s, d) => s + (d.total_vendas ?? 0), 0),
    valor_vendas: dados.reduce((s, d) => s + (d.valor_vendas ?? 0), 0),
    comissao_vendas: dados.reduce((s, d) => s + (d.comissao_vendas ?? 0), 0),
    total_a_receber: dados.reduce((s, d) => s + (d.total_a_receber ?? 0), 0),
  }

  body.push([
    'TOTAL',
    String(totais.total_servicos),
    formatCurrency(totais.valor_servicos),
    formatCurrency(totais.comissao_servicos),
    String(totais.total_vendas),
    formatCurrency(totais.valor_vendas),
    formatCurrency(totais.comissao_vendas),
    formatCurrency(totais.total_a_receber),
  ])

  autoTable(doc, {
    head: [['Barbeiro', 'Serv.', 'Valor Serv.', 'Comissão', 'Vendas', 'Valor Vend.', 'Comissão', 'A Receber']],
    body,
    startY: 80,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [180, 140, 60], textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [250, 247, 240] },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === dados.length) {
        data.cell.styles.fillColor = [180, 140, 60]
        data.cell.styles.textColor = 255
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  doc.save(`comissoes_${dataInicio}_a_${dataFim}.pdf`)
}

export function gerarPDFRelatorioIndividual(
  relatorio: RelatorioComissaoCompleto,
  dataInicio: string,
  dataFim: string
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40
  let cursorY = 40

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(40, 40, 40)
  doc.text(relatorio.barbeiro.nome, pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 22

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(90, 90, 90)
  doc.text(formatPeriod(dataInicio, dataFim), pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 18

  doc.setFontSize(10)
  doc.setTextColor(70, 70, 70)
  doc.text(
    `Comissão Serviços: ${relatorio.barbeiro.percentual_servico}%  |  Comissão Produtos: ${relatorio.barbeiro.percentual_produto}%`,
    pageWidth / 2,
    cursorY,
    { align: 'center' }
  )
  cursorY += 20

  // Seção: Serviços Realizados
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(60, 140, 60)
  doc.text('Serviços Realizados', margin, cursorY)
  cursorY += 8

  const servicosBody = relatorio.servicos.map((s) => [
    formatDate(s.data),
    s.servico_nome,
    formatCurrency(s.valor_cobrado),
    `${s.percentual_comissao}%`,
    formatCurrency(s.valor_comissao),
  ])

  if (servicosBody.length === 0) {
    servicosBody.push(['-', 'Nenhum serviço no período', '-', '-', '-'])
  }

  autoTable(doc, {
    head: [['Data', 'Serviço', 'Valor', '% Comissão', 'Comissão']],
    body: servicosBody,
    startY: cursorY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [60, 140, 60], textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [240, 248, 240] },
    columnStyles: {
      0: { halign: 'center' },
      1: { halign: 'left' },
      2: { halign: 'right' },
      3: { halign: 'center' },
      4: { halign: 'right' },
    },
  })

  cursorY = (doc as any).lastAutoTable.finalY + 24

  // Seção: Vendas de Produtos
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(60, 100, 180)
  doc.text('Vendas de Produtos', margin, cursorY)
  cursorY += 8

  const vendasBody = relatorio.vendas.map((v) => [
    formatDate(v.data),
    v.produto_nome,
    String(v.quantidade),
    formatCurrency(v.valor_total),
    `${v.percentual_comissao}%`,
    formatCurrency(v.valor_comissao),
  ])

  if (vendasBody.length === 0) {
    vendasBody.push(['-', 'Nenhuma venda no período', '-', '-', '-', '-'])
  }

  autoTable(doc, {
    head: [['Data', 'Produto', 'Qtd', 'Valor Total', '% Comissão', 'Comissão']],
    body: vendasBody,
    startY: cursorY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [60, 100, 180], textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [238, 242, 252] },
    columnStyles: {
      0: { halign: 'center' },
      1: { halign: 'left' },
      2: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'center' },
      5: { halign: 'right' },
    },
  })

  cursorY = (doc as any).lastAutoTable.finalY + 24

  // Seção: Resumo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(40, 40, 40)
  doc.text('Resumo', margin, cursorY)
  cursorY += 8

  const t = relatorio.totais
  const resumoBody = [
    ['Total de Serviços', String(t.total_servicos ?? 0)],
    ['Valor em Serviços', formatCurrency(t.valor_servicos)],
    ['Comissão de Serviços', formatCurrency(t.comissao_servicos)],
    ['Total de Vendas', String(t.total_vendas ?? 0)],
    ['Valor em Vendas', formatCurrency(t.valor_vendas)],
    ['Comissão de Vendas', formatCurrency(t.comissao_vendas)],
    ['Total a Receber', formatCurrency(t.total_a_receber)],
  ]

  autoTable(doc, {
    head: [['Descrição', 'Valor']],
    body: resumoBody,
    startY: cursorY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 5, lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [180, 140, 60], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
      1: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === resumoBody.length - 1) {
        data.cell.styles.fillColor = [180, 140, 60]
        data.cell.styles.textColor = 255
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  const nomeSanitizado = relatorio.barbeiro.nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
  doc.save(`comissoes_${nomeSanitizado}_${dataInicio}_a_${dataFim}.pdf`)
}