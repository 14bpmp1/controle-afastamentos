'use strict';

const HISTORICO_POR_PAGINA=100;
let paginaHistorico=1,totalHistorico=0,registrosHistorico=[],historicoToken=0,historicoCarregando=false;
let averbacoesHistorico=[],erroViewHistorico=null;
let totaisHistorico=null,chaveHistoricoCompleto=null,totaisHistoricoToken=0,totaisHistoricoRodando=false;
let historicoExportToken=0,historicoExportando=false;

function filtrosHistoricoAtuais() {
  return {policial:$('historyPolicial').value,ini:$('historyStart').value,fim:$('historyEnd').value,cancelados:$('historyCancelados').value==='sim'};
}
function periodoHistoricoValido(f) {return !f.ini||!f.fim||f.ini<=f.fim;}
function consultaHistoricoFiltrada(f,colunas=COLUNAS_AFASTAMENTO,opcoes={}) {
  let q=db.from('afastamentos').select(colunas,opcoes).eq('policial_id',f.policial);
  if(f.ini)q=q.gte('data_inicio',f.ini);
  if(f.fim)q=q.lte('data_inicio',f.fim);
  if(!f.cancelados)q=q.is('cancelado_em',null);
  return q;
}
function atualizarAcoesHistorico() {
  const f=filtrosHistoricoAtuais(),pronto=Boolean(usuarioAtual&&dadosCarregados&&f.policial&&periodoHistoricoValido(f)&&!historicoCarregando&&totalHistorico);
  $('historyCsv').disabled=!pronto||!registrosHistorico.length;
  $('historyCsvFull').disabled=!pronto||historicoExportando;
  $('historyTotals').disabled=!pronto||totaisHistoricoRodando;
}
function mostrarTotaisHistorico() {
  $('historyCount').textContent=$('historyPolicial').value?(totaisHistorico?.total??totalHistorico):'—';
  $('historyDays').textContent=totaisHistorico?.dias??'—';
  $('historyTypes').textContent=totaisHistorico?.tipos??'—';
  $('historyCanceled').textContent=totaisHistorico?.cancelados??'—';
}
function limparHistoricoCompleto() {
  totaisHistoricoToken++;historicoExportToken++;
  totaisHistorico=null;chaveHistoricoCompleto=null;totaisHistoricoRodando=false;historicoExportando=false;
  $('historyTotalsCancel').hidden=true;$('historyCancelExport').hidden=true;
  $('historyTotalsStatus').textContent='';$('historyExportStatus').textContent='';
  mostrarTotaisHistorico();atualizarAcoesHistorico();
}
function preencherHistorico() {
  const seletor=$('historyPolicial'),anterior=seletor.value;
  seletor.replaceChildren(opcao('','Selecione um policial'));
  for(const p of policiaisCatalogo)seletor.appendChild(opcao(p.id,`${p.matricula} · ${p.qra} · ${p.nome_completo}${p.ativo?'':' (inativo)'}`));
  if([...seletor.options].some(o=>o.value===anterior))seletor.value=anterior;
}
async function consultarHistorico() {
  if(!usuarioAtual||!dadosCarregados)return;
  const contexto=contextoConsulta(),token=++historicoToken,f=filtrosHistoricoAtuais();
  const valida=()=>contexto()&&token===historicoToken;
  const chave=JSON.stringify(f);
  if(chave!==chaveHistoricoCompleto){limparHistoricoCompleto();chaveHistoricoCompleto=chave;}
  averbacoesHistorico=[];erroViewHistorico=null;registrosHistorico=[];
  if(!f.policial||!periodoHistoricoValido(f)) {
    historicoCarregando=false;totalHistorico=0;mostrarHistorico();
    if(f.policial){$('historyInfo').textContent='A data inicial não pode ser posterior à final.';concluirConsultaTela('historico',false);}
    else {consultasConcluidas.delete('historico');mostrarUltimaConsulta();}
    return;
  }
  iniciarConsultaTela('historico');
  historicoCarregando=true;$('historyBody').replaceChildren();
  $('historyInfo').textContent='Consultando histórico...';
  $('historyPrev').disabled=true;$('historyNext').disabled=true;atualizarAcoesHistorico();
  try {
    const {data,count}=await resultadoConsulta(consultaHistoricoFiltrada(f,COLUNAS_AFASTAMENTO,{count:'exact'})
      .order('data_inicio',{ascending:false}).order('id',{ascending:false})
      .range((paginaHistorico-1)*HISTORICO_POR_PAGINA,paginaHistorico*HISTORICO_POR_PAGINA-1));
    conferirConsulta(valida);totalHistorico=count??0;
    const ultima=Math.max(1,Math.ceil(totalHistorico/HISTORICO_POR_PAGINA));
    if(paginaHistorico>ultima){paginaHistorico=ultima;return consultarHistorico();}
    const linhas=data||[];
    let av=[],erroAv=null;
    try {av=await buscarAverbacoes(linhas.filter(r=>!r.cancelado_em).map(r=>r.id),valida);}
    catch(error){conferirConsulta(valida);erroAv=error;}
    conferirConsulta(valida);
    registrosHistorico=linhas;averbacoesHistorico=av;erroViewHistorico=erroAv;historicoCarregando=false;mostrarHistorico();concluirConsultaTela('historico',!erroAv);
  } catch(error) {
    if(!valida()||error.name==='AbortError')return;
    concluirConsultaTela('historico',false);
    historicoCarregando=false;totalHistorico=0;registrosHistorico=[];limparHistoricoCompleto();mostrarHistorico();
    $('historyInfo').textContent='Não foi possível consultar o histórico: '+erroAmigavel(error);
  }
}
function mostrarHistorico() {
  const tbody=$('historyBody'),f=filtrosHistoricoAtuais();tbody.replaceChildren();
  const mapa=new Map(averbacoesHistorico.map(a=>[String(a.afastamento_id),a]));
  for(const r of registrosHistorico) {
    const a=!r.cancelado_em?mapa.get(String(r.id)):null,tr=document.createElement('tr');
    const valores=[r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),r.dias,situacao(r),r.cancelado_em?'Não aplicável':erroViewHistorico?'Indisponível':a?.situacao_averbacao||'Não disponível',a?formatarData(a.inicio_ciclo):'—',a?formatarData(a.fim_ciclo):'—'];
    for(const valor of valores){const td=document.createElement('td');td.textContent=String(valor??'');tr.appendChild(td);}
    tbody.appendChild(tr);
  }
  if(!registrosHistorico.length) {
    const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=8;
    td.textContent=f.policial?'Nenhum registro encontrado para os filtros.':'Selecione um policial para consultar o histórico.';
    tr.appendChild(td);tbody.appendChild(tr);
  }
  const paginas=Math.max(1,Math.ceil(totalHistorico/HISTORICO_POR_PAGINA));
  $('historyPageLabel').textContent=`Página ${paginaHistorico} de ${paginas}`;
  $('historyPrev').disabled=!f.policial||paginaHistorico<=1;
  $('historyNext').disabled=!f.policial||paginaHistorico>=paginas;
  mostrarTotaisHistorico();atualizarAcoesHistorico();
  $('historyInfo').textContent=f.policial
    ? `${totalHistorico} afastamento(s) no filtro; ${registrosHistorico.length} nesta página. Calcular totais e Exportar histórico completo consideram todas as páginas. Dias somam as durações integrais dos registros não cancelados; tipos e cancelamentos respeitam a opção Incluir cancelados.`
    : 'Selecione um policial para consultar o histórico.';
}
function linhasHistoricoCsv(dados,av,erroAv=null) {
  const mapa=new Map(av.map(a=>[String(a.afastamento_id),a]));
  return dados.map(r=>{
    const a=!r.cancelado_em?mapa.get(String(r.id)):null;
    return [r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),r.dias,situacao(r),r.cancelado_em?'Não aplicável':erroAv?'Indisponível':a?.situacao_averbacao||'Não disponível',a?formatarData(a.inicio_ciclo):'',a?formatarData(a.fim_ciclo):''];
  });
}
const CABECALHO_HISTORICO=['Matrícula','QRA','Policial','Tipo','Início','Término','Dias','Situação','Averbação indicativa','Início ciclo','Fim ciclo'];
function exportarHistoricoCsv() {
  if(historicoCarregando||!$('historyPolicial').value||!registrosHistorico.length)return;
  baixarCsv([CABECALHO_HISTORICO,...linhasHistoricoCsv(registrosHistorico,averbacoesHistorico,erroViewHistorico)],'historico_policial_pagina_'+paginaHistorico+'_'+hojeISO()+'.csv');
}
async function calcularTotaisHistorico() {
  const f=filtrosHistoricoAtuais();
  if(!usuarioAtual||!dadosCarregados||historicoCarregando||totaisHistoricoRodando||!f.policial||!periodoHistoricoValido(f)||!totalHistorico)return;
  const contexto=contextoConsulta(),token=++totaisHistoricoToken;
  const valida=()=>contexto()&&token===totaisHistoricoToken&&JSON.stringify(f)===JSON.stringify(filtrosHistoricoAtuais());
  totaisHistoricoRodando=true;totaisHistorico=null;mostrarTotaisHistorico();atualizarAcoesHistorico();
  $('historyTotalsCancel').hidden=false;$('historyTotalsStatus').textContent='Calculando histórico completo...';
  let total=0,dias=0,cancelados=0;const tiposEncontrados=new Set();
  try {
    await percorrerPorId(()=>consultaHistoricoFiltrada(f,'id,tipo_id,dias,cancelado_em'),lote=>{
      for(const r of lote){total++;tiposEncontrados.add(String(r.tipo_id));if(r.cancelado_em)cancelados++;else dias+=Number(r.dias||0);}
      $('historyTotalsStatus').textContent=`Calculando histórico completo: ${total} registro(s)...`;
    },valida);
    conferirConsulta(valida);
    totaisHistorico={total,dias,cancelados,tipos:tiposEncontrados.size};mostrarTotaisHistorico();
    $('historyTotalsStatus').textContent='Totais de todas as páginas do filtro. Dias excluem cancelados e representam a duração integral dos afastamentos, não dias únicos de calendário. A base pode mudar durante a consulta.';
  } catch(error) {
    if(contexto()&&token===totaisHistoricoToken)$('historyTotalsStatus').textContent='Cálculo não concluído. '+(error.name==='AbortError'?'Consulta cancelada.':erroAmigavel(error));
  } finally {
    if(token===totaisHistoricoToken){totaisHistoricoRodando=false;$('historyTotalsCancel').hidden=true;atualizarAcoesHistorico();}
  }
}
async function exportarHistoricoCompletoCsv() {
  const f=filtrosHistoricoAtuais();
  if(!usuarioAtual||!dadosCarregados||historicoCarregando||historicoExportando||!f.policial||!periodoHistoricoValido(f)||!totalHistorico)return;
  const contexto=contextoConsulta(),token=++historicoExportToken;
  const valida=()=>contexto()&&token===historicoExportToken&&JSON.stringify(f)===JSON.stringify(filtrosHistoricoAtuais());
  historicoExportando=true;atualizarAcoesHistorico();$('historyCancelExport').hidden=false;
  $('historyExportStatus').textContent='Preparando histórico completo...';
  const linhas=[CABECALHO_HISTORICO];
  try {
    await percorrerAfastamentosOrdenados(()=>consultaHistoricoFiltrada(f),async lote=>{
      const av=await buscarAverbacoes(lote.filter(r=>!r.cancelado_em).map(r=>r.id),valida);
      conferirConsulta(valida);linhas.push(...linhasHistoricoCsv(lote,av));
      $('historyExportStatus').textContent=`Preparando histórico completo: ${linhas.length-1} registro(s)...`;
    },valida);
    conferirConsulta(valida);
    if(linhas.length===1)throw new Error('Nenhum registro encontrado para exportar.');
    baixarCsv(linhas,`historico_policial_${f.policial}_completo_${hojeISO()}.csv`);
    $('historyExportStatus').textContent=`Histórico completo exportado: ${linhas.length-1} registro(s). A base pode mudar durante a consulta.`;
  } catch(error) {
    if(contexto()&&token===historicoExportToken)$('historyExportStatus').textContent='Exportação interrompida. Nenhum CSV parcial foi baixado. '+(error.name==='AbortError'?'':erroAmigavel(error));
  } finally {
    if(token===historicoExportToken){historicoExportando=false;$('historyCancelExport').hidden=true;atualizarAcoesHistorico();}
  }
}
['historyPolicial','historyStart','historyEnd','historyCancelados'].forEach(id=>$(id).addEventListener('change',()=>{paginaHistorico=1;void consultarHistorico();}));
$('historyClear').addEventListener('click',()=>{['historyPolicial','historyStart','historyEnd'].forEach(id=>$(id).value='');$('historyCancelados').value='nao';paginaHistorico=1;void consultarHistorico();});
$('historyCsv').addEventListener('click',exportarHistoricoCsv);
$('historyCsvFull').addEventListener('click',()=>{void exportarHistoricoCompletoCsv();});
$('historyTotals').addEventListener('click',()=>{void calcularTotaisHistorico();});
$('historyTotalsCancel').addEventListener('click',()=>{
  totaisHistoricoToken++;totaisHistoricoRodando=false;totaisHistorico=null;mostrarTotaisHistorico();
  $('historyTotalsCancel').hidden=true;$('historyTotalsStatus').textContent='Cálculo cancelado. Nenhum total parcial foi apresentado.';atualizarAcoesHistorico();
});
$('historyCancelExport').addEventListener('click',()=>{
  historicoExportToken++;historicoExportando=false;$('historyCancelExport').hidden=true;
  $('historyExportStatus').textContent='Exportação cancelada. Nenhum CSV parcial foi baixado.';atualizarAcoesHistorico();
});
$('historyPrev').addEventListener('click',()=>{if(paginaHistorico>1){paginaHistorico--;void consultarHistorico();}});
$('historyNext').addEventListener('click',()=>{if(paginaHistorico*HISTORICO_POR_PAGINA<totalHistorico){paginaHistorico++;void consultarHistorico();}});
