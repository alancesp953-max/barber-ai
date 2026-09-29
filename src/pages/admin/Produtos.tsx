import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NativeSelect,
  NumberInput,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import {
  Plus,
  Trash2,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  AlertTriangle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getProdutos,
  createProduto,
  deleteProduto,
  updateProduto,
  registrarEntradaEstoque,
  registrarSaidaEstoque,
  getMovimentacoes,
  getBarbers,
} from '../../lib/api'
import type { Produto, MovimentacaoEstoque } from '../../lib/api'
import type { Barber } from '../../types/database'
import { PageHeader } from '../../components/PageHeader'


const inputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
  label: { color: '#cfcfcf' },
}

const modalStyles = {
  content: { background: '#1a1a1a', border: '1px solid rgba(197,160,89,0.2)' },
  header: { background: '#1a1a1a' },
  body: { background: '#1a1a1a' },
}

export default function Produtos() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [barbeiros, setBarbeiros] = useState<Barber[]>([])
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState<string | null>(null)
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtroProduto, setFiltroProduto] = useState('')
  const [formNome, setFormNome] = useState('')
  const [formPreco, setFormPreco] = useState('')
  const [formEstoque, setFormEstoque] = useState<number | string>('0')
  const [formEstoqueMinimo, setFormEstoqueMinimo] = useState<number | string>('5')
  const [movQuantidade, setMovQuantidade] = useState<number | string>('1')
  const [movObservacao, setMovObservacao] = useState('')
  const [movBarbeiroId, setMovBarbeiroId] = useState('')
  const [movComissao, setMovComissao] = useState(0)
  const [valorTotal, setValorTotal] = useState(0)

  useEffect(() => {
    if (produtoSelecionado && movQuantidade) {
      const qtd = Number(movQuantidade) || 0
      setValorTotal((produtoSelecionado.preco_venda || 0) * qtd)
    } else {
      setValorTotal(0)
    }
  }, [produtoSelecionado, movQuantidade])

  async function loadProdutos() {
    try {
      const [data, barbeirosData] = await Promise.all([getProdutos(), getBarbers()])
      setProdutos(data)
      setBarbeiros(barbeirosData)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProdutos()
  }, [])

  async function loadMovimentacoes(produtoId?: string) {
    try {
      const data = await getMovimentacoes(produtoId)
      setMovimentacoes(data)
    } catch (err) {
      console.error(err)
    }
  }

  function abrirModal(tipo: string, produto?: Produto) {
    setError(null)
    setModalAberto(tipo)
    setProdutoSelecionado(produto || null)
    setMovQuantidade('1')
    setMovObservacao('')
    setMovBarbeiroId('')
    setMovComissao(0)
    if (produto && tipo === 'movimentacoes') loadMovimentacoes(produto.id)
    if (tipo === 'produto') {
      setFormNome(produto?.nome || '')
      setFormPreco(String(produto?.preco_venda || ''))
      setFormEstoque(produto?.estoque_atual ?? 0)
      setFormEstoqueMinimo(produto?.estoque_minimo ?? 5)
    }
  }

  function fecharModal() {
    setModalAberto(null)
    setProdutoSelecionado(null)
    setError(null)
    setMovBarbeiroId('')
    setMovComissao(0)
  }

  function handleBarbeiroChange(id: string) {
    setMovBarbeiroId(id)
    const barbeiro = barbeiros.find((b) => b.id === id)
    setMovComissao(barbeiro?.percentual_produto ?? 0)
  }

  async function handleSalvarProduto() {
    if (!formNome.trim()) {
      setError('Nome é obrigatório')
      return
    }
    setSaving(true)
    try {
      if (produtoSelecionado) {
        await updateProduto(produtoSelecionado.id, {
          nome: formNome.trim(),
          preco_venda: Number(formPreco.replace(',', '.')) || 0,
          estoque_atual: Number(formEstoque) || 0,
          estoque_minimo: Number(formEstoqueMinimo) || 5,
        })
      } else {
        await createProduto({
          nome: formNome.trim(),
          preco_venda: Number(formPreco.replace(',', '.')) || 0,
          estoque_atual: Number(formEstoque) || 0,
          estoque_minimo: Number(formEstoqueMinimo) || 5,
        })
      }
      fecharModal()
      await loadProdutos()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleEntrada() {
    if (!produtoSelecionado) return
    const qtd = Number(movQuantidade)
    if (!qtd || qtd <= 0) {
      setError('Quantidade inválida')
      return
    }
    setSaving(true)
    try {
      await registrarEntradaEstoque({
        produto_id: produtoSelecionado.id,
        quantidade: qtd,
        motivo: 'compra',
        observacao: movObservacao || undefined,
      })
      fecharModal()
      await loadProdutos()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaida() {
    if (!produtoSelecionado) return
    const qtd = Number(movQuantidade)
    if (!qtd || qtd <= 0) {
      setError('Quantidade inválida')
      return
    }
    setSaving(true)
    try {
      await registrarSaidaEstoque({
        produto_id: produtoSelecionado.id,
        quantidade: qtd,
        motivo: 'venda',
        observacao: movObservacao || undefined,
        barbeiro_id: movBarbeiroId || undefined,
      })
      fecharModal()
      await loadProdutos()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleExcluir(id: string) {
    if (!confirm('Excluir permanentemente?')) return
    try {
      await deleteProduto(id)
      await loadProdutos()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const produtosFiltrados = produtos.filter((p) =>
    p.nome.toLowerCase().includes(filtroProduto.toLowerCase()),
  )

  const getStatus = (p: Produto) => {
    const estoque = Number(p.estoque_atual)
    const minimo = Number(p.estoque_minimo)
    if (estoque === 0) return { color: 'red', texto: 'Sem estoque' }
    if (estoque <= minimo) return { color: 'orange', texto: 'Estoque baixo' }
    return { color: 'teal', texto: 'OK' }
  }

  const estoqueZero = (p: Produto) => Number(p.estoque_atual) === 0
  const estoqueBaixo = (p: Produto) => Number(p.estoque_atual) <= Number(p.estoque_minimo)

  return (
    <Stack gap="md">
      <PageHeader
        title="Produtos"
        description="Estoque e movimentações"
        action={
          <Button color="gold" c="#0A0A0A" leftSection={<Plus size={16} />} onClick={() => abrirModal('produto')}>
            Novo Produto
          </Button>
        }
      />

      <TextInput
        placeholder="Buscar produto..."
        value={filtroProduto}
        onChange={(e) => setFiltroProduto(e.currentTarget.value)}
        styles={inputStyles}
        maw={400}
      />

      {loading ? (
        <Group justify="center" py="xl">
          <Loader color="gold" />
        </Group>
      ) : (
        <Paper withBorder p="lg" radius="lg">
          {produtosFiltrados.length === 0 ? (
            <Text c="dimmed" ta="center" py="md">
              {filtroProduto ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={800}>
              <Table highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Produto</Table.Th>
                    <Table.Th>Preço</Table.Th>
                    <Table.Th>Estoque</Table.Th>
                    <Table.Th>Mínimo</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Ações</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {produtosFiltrados.map((p) => {
                    const st = getStatus(p)
                    return (
                      <Table.Tr
                        key={p.id}
                        style={{ background: estoqueZero(p) ? 'rgba(40,10,10,0.4)' : undefined }}
                      >
                        <Table.Td>
                          <Group gap="xs">
                            <Package size={16} color="#c5a059" />
                            <Text fw={500}>{p.nome}</Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>R$ {Number(p.preco_venda).toFixed(2)}</Table.Td>
                        <Table.Td>
                          <Text
                            fw={700}
                            c={estoqueZero(p) ? 'red.4' : estoqueBaixo(p) ? 'orange.4' : 'teal.4'}
                          >
                            {p.estoque_atual}
                          </Text>
                        </Table.Td>
                        <Table.Td>{p.estoque_minimo}</Table.Td>
                        <Table.Td>
                          <Badge
                            color={st.color}
                            variant="light"
                            leftSection={estoqueBaixo(p) ? <AlertTriangle size={12} /> : undefined}
                          >
                            {st.texto}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={6} wrap="wrap">
                            <Button
                              size="compact-xs"
                              color="gold"
                              c="#0A0A0A"
                              leftSection={<ArrowDownToLine size={12} />}
                              onClick={() => abrirModal('entrada', p)}
                            >
                              Entrada
                            </Button>
                            <Button
                              size="compact-xs"
                              color="orange"
                              c="#0A0A0A"
                              leftSection={<ArrowUpFromLine size={12} />}
                              disabled={estoqueZero(p)}
                              onClick={() => abrirModal('saida', p)}
                            >
                              Saída
                            </Button>
                            <Button
                              size="compact-xs"
                              variant="outline"
                              color="gray"
                              leftSection={<History size={12} />}
                              onClick={() => abrirModal('movimentacoes', p)}
                            >
                              Histórico
                            </Button>
                            <Button
                              size="compact-xs"
                              variant="outline"
                              color="gray"
                              onClick={() => abrirModal('produto', p)}
                            >
                              Editar
                            </Button>
                            <ActionIcon
                              variant="outline"
                              color="red"
                              size="sm"
                              onClick={() => handleExcluir(p.id)}
                            >
                              <Trash2 size={14} />
                            </ActionIcon>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Paper>
      )}

      <Modal
        opened={modalAberto === 'produto'}
        onClose={fecharModal}
        title={
          <Title order={4} c="gold">
            {produtoSelecionado ? 'Editar Produto' : 'Novo Produto'}
          </Title>
        }
        centered
        styles={modalStyles}
      >
        <Stack gap="md">
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <TextInput
            label="Nome *"
            value={formNome}
            onChange={(e) => setFormNome(e.currentTarget.value)}
            placeholder="Ex: Shampoo"
            styles={inputStyles}
          />
          <TextInput
            label="Preço (R$)"
            value={formPreco}
            onChange={(e) => setFormPreco(e.currentTarget.value)}
            placeholder="39,90"
            styles={inputStyles}
          />
          <NumberInput
            label="Estoque Inicial"
            value={formEstoque}
            onChange={setFormEstoque}
            min={0}
            styles={inputStyles}
          />
          <NumberInput
            label="Estoque Mínimo"
            value={formEstoqueMinimo}
            onChange={setFormEstoqueMinimo}
            min={0}
            styles={inputStyles}
          />
          <Group justify="flex-end">
            <Button variant="outline" color="gray" onClick={fecharModal}>
              Cancelar
            </Button>
            <Button color="gold" c="#0A0A0A" onClick={handleSalvarProduto} loading={saving}>
              Salvar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={modalAberto === 'entrada' && !!produtoSelecionado}
        onClose={fecharModal}
        title={
          <Title order={4} c="gold">
            Registrar Entrada
          </Title>
        }
        centered
        styles={modalStyles}
      >
        {produtoSelecionado && (
          <Stack gap="md">
            <Text c="dimmed" size="sm">
              Produto:{' '}
              <Text span c="gold" fw={600}>
                {produtoSelecionado.nome}
              </Text>
              <br />
              Estoque atual: <strong>{produtoSelecionado.estoque_atual}</strong>
            </Text>
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <NumberInput
              label="Quantidade *"
              value={movQuantidade}
              onChange={setMovQuantidade}
              min={1}
              styles={inputStyles}
            />
            <TextInput
              label="Observação"
              value={movObservacao}
              onChange={(e) => setMovObservacao(e.currentTarget.value)}
              placeholder="Compra do fornecedor"
              styles={inputStyles}
            />
            <Group justify="flex-end">
              <Button variant="outline" color="gray" onClick={fecharModal}>
                Cancelar
              </Button>
              <Button color="gold" c="#0A0A0A" onClick={handleEntrada} loading={saving}>
                Registrar Entrada
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={modalAberto === 'saida' && !!produtoSelecionado}
        onClose={fecharModal}
        title={
          <Title order={4} c="gold">
            Registrar Saída (Venda)
          </Title>
        }
        centered
        styles={modalStyles}
      >
        {produtoSelecionado && (
          <Stack gap="md">
            <Text c="dimmed" size="sm">
              Produto:{' '}
              <Text span c="gold" fw={600}>
                {produtoSelecionado.nome}
              </Text>
              <br />
              Estoque atual: <strong>{produtoSelecionado.estoque_atual}</strong>
              <br />
              Preço unitário:{' '}
              <Text span c="gold" fw={600}>
                R$ {Number(produtoSelecionado.preco_venda).toFixed(2)}
              </Text>
            </Text>
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <NativeSelect
              label="Barbeiro que vendeu *"
              value={movBarbeiroId}
              onChange={(e) => handleBarbeiroChange(e.currentTarget.value)}
              data={[
                { value: '', label: 'Selecione um barbeiro' },
                ...barbeiros.map((b) => ({ value: b.id, label: b.nome })),
              ]}
              styles={inputStyles}
            />
            {movBarbeiroId && (
              <Alert color="gold" variant="light">
                Comissão do barbeiro: <strong>{movComissao}%</strong>
                {valorTotal > 0 && (
                  <span> — R$ {((valorTotal * movComissao) / 100).toFixed(2)}</span>
                )}
              </Alert>
            )}
            <NumberInput
              label="Quantidade *"
              value={movQuantidade}
              onChange={setMovQuantidade}
              min={1}
              max={produtoSelecionado.estoque_atual}
              styles={inputStyles}
            />
            <TextInput
              label="Valor Total (R$)"
              value={`R$ ${valorTotal.toFixed(2)}`}
              readOnly
              styles={{
                ...inputStyles,
                input: { ...inputStyles.input, color: '#c5a059', fontWeight: 700 },
              }}
            />
            <TextInput
              label="Observação"
              value={movObservacao}
              onChange={(e) => setMovObservacao(e.currentTarget.value)}
              placeholder="Venda avulsa"
              styles={inputStyles}
            />
            <Group justify="flex-end">
              <Button variant="outline" color="gray" onClick={fecharModal}>
                Cancelar
              </Button>
              <Button
                color="orange"
                c="#0A0A0A"
                onClick={handleSaida}
                loading={saving}
                disabled={!movBarbeiroId}
              >
                Registrar Saída
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={modalAberto === 'movimentacoes' && !!produtoSelecionado}
        onClose={fecharModal}
        title={
          <Title order={4} c="gold">
            Histórico — {produtoSelecionado?.nome}
          </Title>
        }
        centered
        size="xl"
        styles={modalStyles}
      >
        {produtoSelecionado && (
          <Stack gap="md">
            {movimentacoes.length === 0 ? (
              <Text c="dimmed" ta="center" py="md">
                Nenhuma movimentação.
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={600}>
                <Table verticalSpacing="sm" fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Data</Table.Th>
                      <Table.Th>Tipo</Table.Th>
                      <Table.Th>Qtd</Table.Th>
                      <Table.Th>Barbeiro</Table.Th>
                      <Table.Th>Comissão</Table.Th>
                      <Table.Th>Motivo</Table.Th>
                      <Table.Th>Obs</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {movimentacoes.map((m) => (
                      <Table.Tr key={m.id}>
                        <Table.Td>{new Date(m.created_at).toLocaleDateString('pt-BR')}</Table.Td>
                        <Table.Td>
                          <Badge color={m.tipo === 'entrada' ? 'teal' : 'red'} variant="light">
                            {m.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text fw={700} c={m.tipo === 'entrada' ? 'teal.4' : 'red.4'}>
                            {m.tipo === 'entrada' ? '+' : '-'}
                            {m.quantidade}
                          </Text>
                        </Table.Td>
                        <Table.Td c="dimmed">{m.barbeiros?.nome || '-'}</Table.Td>
                        <Table.Td c="dimmed">
                          {m.comissao_percentual != null ? `${m.comissao_percentual}%` : '-'}
                        </Table.Td>
                        <Table.Td c="dimmed" tt="capitalize">
                          {m.motivo === 'venda'
                            ? 'Venda'
                            : m.motivo === 'compra'
                              ? 'Compra'
                              : m.motivo === 'ajuste'
                                ? 'Ajuste'
                                : 'Perda'}
                        </Table.Td>
                        <Table.Td c="dimmed" fz="xs">
                          {m.observacao || '-'}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
            <Group justify="flex-end">
              <Button variant="outline" color="gray" onClick={fecharModal}>
                Fechar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}
