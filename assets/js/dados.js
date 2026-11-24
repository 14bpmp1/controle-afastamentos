'use strict';

const COLUNAS_AFASTAMENTO = 'id,policial_id,tipo_id,data_inicio,data_fim,dias,observacoes,cancelado_em,policiais(matricula,qra,nome_completo),tipos_afastamento(sigla)';
const COLUNAS_AVERBACAO = 'afastamento_id,policial_id,numero_ciclo,inicio_ciclo,fim_ciclo,total_dias,situacao_averbacao';
const LOTE_CONSULTA = 500;
let policiaisCatalogo = [], tiposCatalogo = [];

function contextoConsulta() {
  const sessao = usuarioAtual, geracao = geracaoTelas;
  return () => Boolean(sessao && usuarioAtual === sessao && geracao === geracaoTelas);
}
function conferirConsulta(valida) {
  if (!valida()) { const erro = new Error('Consulta substituída.'); erro.name = 'AbortError'; throw erro; }
}
async function resultadoConsulta(consulta) {
  const resultado = await consulta;
  if (resultado.error) throw resultado.error;
  return resultado;
}
// Cursor por ID evita acumular páginas anteriores na memória. Sem teto de 20 mil.
async function percorrerPorId(criarConsulta, consumir, valida = () => true) {
  let ultimo = null;
  while (true) {
    conferirConsulta(valida);
    let q = criarConsulta().order('id', { ascending: true }).limit(LOTE_CONSULTA);
    if (ultimo !== null) q = q.gt('id', ultimo);
    const { data } = await resultadoConsulta(q);
    conferirConsulta(valida);
    if (!data?.length) break;
    await consumir(data);
    const proximo = data[data.length - 1].id;
    if (proximo === ultimo) throw new Error('A paginação não avançou. Atualize e tente novamente.');
    ultimo = proximo;
  }
}
// Views existentes não têm ID próprio; a ordenação usa afastamento + ciclo.
async function percorrerAverbacoes(criarConsulta, consumir, valida = () => true) {
  let inicio = 0;
  while (true) {
    conferirConsulta(valida);
    const { data } = await resultadoConsulta(criarConsulta()
      .order('afastamento_id', { ascending: true }).order('numero_ciclo', { ascending: true })
      .range(inicio, inicio + LOTE_CONSULTA - 1));
    conferirConsulta(valida);
    if (!data?.length) break;
    await consumir(data);
    inicio += data.length;
  }
}
async function buscarAverbacoes(ids, valida) {
  const dados = [], unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 100) {
    await percorrerAverbacoes(() => db.from('vw_averbacoes').select(COLUNAS_AVERBACAO)
      .in('afastamento_id', unicos.slice(i, i + 100)), lote => dados.push(...lote), valida);
  }
  return dados;
}
function baixarCsv(linhas, nome) {
  const csv = '\uFEFF' + linhas.map(l => l.map(celulaCsvSegura).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = nome;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
let consultaDadosToken = 0;
async function carregarDados() {
  if (!usuarioAtual) return;
  const token = ++consultaDadosToken;
  invalidarTelas();
  const contexto = contextoConsulta(), valida = () => contexto() && token === consultaDadosToken;
  $('refresh').disabled = true;
  setMsg('moduleMessage', 'Atualizando cadastros...'); $('moduleMessage').hidden = false;
  try {
    const pessoas = [], categorias = [];
    await Promise.all([
      percorrerPorId(() => db.from('policiais').select('id,matricula,posto_graduacao,qra,nome_completo,ativo'), lote => pessoas.push(...lote), valida),
      percorrerPorId(() => db.from('tipos_afastamento').select('id,sigla,descricao,dias_fixos,ativo'), lote => categorias.push(...lote), valida)
    ]);
    conferirConsulta(valida);
    policiaisCatalogo = pessoas.sort((a,b) => a.nome_completo.localeCompare(b.nome_completo, 'pt-BR'));
    tiposCatalogo = categorias.sort((a,b) => a.sigla.localeCompare(b.sigla, 'pt-BR'));
    policiais = policiaisCatalogo.filter(p => p.ativo); tipos = tiposCatalogo.filter(t => t.ativo);
    preencherSeletores(); preencherFiltroRelatorio(); preencherHistorico();
    dadosCarregados = true; $('moduleMessage').hidden = true;
    await carregarTelaAtual();
  } catch (error) {
    if (!valida() || error.name === 'AbortError') return;
    console.error('Erro ao carregar dados:', error);
    setMsg('moduleMessage', 'Erro ao consultar dados: ' + erroAmigavel(error) + ' Use Atualizar para tentar novamente.', true);
    $('moduleMessage').hidden = false;
  } finally {
    if (token === consultaDadosToken) $('refresh').disabled = false;
  }
}

function cancelarConsultasAtuais() {
  consultaRegistrosToken++; historicoToken++; relatorioToken++; consultaAuditoriaToken++;
  painelToken++; alertasToken++; agendaToken++; totaisRelatorioToken++;
  clearTimeout(timerBuscaRegistros); indiceRegistros=null;
  cancelarCsvRegistros=true; exportacaoRelatorioCancelada=true;
  limparTotaisRelatorio();
}
