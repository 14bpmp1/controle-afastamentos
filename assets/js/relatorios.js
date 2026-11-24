'use strict';

// V17: relatório gerencial paginado no Supabase.
const RELATORIO_POR_PAGINA=100;
let paginaRelatorio=1,totalRelatorio=0,registrosRelatorio=[],relatorioToken=0,relatorioCarregando=false;
function validarPeriodoRelatorio(){
  const ini=$('reportStart').value,fim=$('reportEnd').value;
  if(ini&&fim&&ini>fim){$('reportInfo').textContent='A data inicial não pode ser posterior à data final.';return false;}
  return true;
}
async function consultarRelatorio(){
  if(!usuarioAtual||!dadosCarregados)return;
  const contexto=contextoConsulta();
  const token=++relatorioToken;
  const chave=JSON.stringify(filtrosRelatorioAtuais());
  if(chave!==chaveTotaisRelatorio){limparTotaisRelatorio();chaveTotaisRelatorio=chave;}
  if(!validarPeriodoRelatorio()){
    registrosRelatorio=[];totalRelatorio=0;relatorioCarregando=false;mostrarRelatorio();
    $('reportInfo').textContent='A data inicial não pode ser posterior à data final.';return;
  }
  relatorioCarregando=true;
  $('reportInfo').textContent='Consultando relatório no Supabase...';
  $('reportPrev').disabled=true;$('reportNext').disabled=true;
  $('reportCsv').disabled=true;$('reportPrint').disabled=true;$('reportTotals').disabled=true;
  let q=db.from('afastamentos')
    .select('id,policial_id,tipo_id,data_inicio,data_fim,dias,cancelado_em,policiais(matricula,qra,nome_completo),tipos_afastamento(sigla)',{count:'exact'})
    .is('cancelado_em',null)
    .order('data_inicio',{ascending:false}).order('id',{ascending:false})
    .range((paginaRelatorio-1)*RELATORIO_POR_PAGINA,paginaRelatorio*RELATORIO_POR_PAGINA-1);
  const ini=$('reportStart').value,fim=$('reportEnd').value;
  if(ini)q=q.gte('data_inicio',ini);
  if(fim)q=q.lte('data_inicio',fim);
  if($('reportPolicial').value)q=q.eq('policial_id',$('reportPolicial').value);
  if($('reportTipo').value)q=q.eq('tipo_id',$('reportTipo').value);
  try{
    const {data,error,count}=await q;
    if(!contexto()||token!==relatorioToken)return;
    if(error)throw error;
    totalRelatorio=count??0;
    const ultima=Math.max(1,Math.ceil(totalRelatorio/RELATORIO_POR_PAGINA));
    if(paginaRelatorio>ultima){paginaRelatorio=ultima;void consultarRelatorio();return;}
    registrosRelatorio=data||[];relatorioCarregando=false;mostrarRelatorio();
  }catch(error){
    if(!contexto()||token!==relatorioToken)return;
    console.error('Erro ao consultar relatório:',error);
    registrosRelatorio=[];totalRelatorio=0;relatorioCarregando=false;mostrarRelatorio();
    $('reportInfo').textContent='Falha na consulta do relatório: '+erroAmigavel(error);
    $('reportCsv').disabled=true;$('reportPrint').disabled=true;$('reportCsvFull').disabled=true;$('reportTotals').disabled=true;
  }
}
function mostrarRelatorio(){
  const dados=registrosRelatorio,tbody=$('reportBody');tbody.replaceChildren();
  $('reportCount').textContent=totalRelatorio;
  $('reportPeople').textContent=new Set(dados.map(r=>r.policial_id)).size;
  $('reportDays').textContent=dados.reduce((s,r)=>s+Number(r.dias||0),0);
  for(const r of dados){
    const tr=document.createElement('tr');
    [r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),r.dias,situacao(r)].forEach(v=>{const td=document.createElement('td');td.textContent=String(v);tr.appendChild(td);});
    tbody.appendChild(tr);
  }
  const paginas=Math.max(1,Math.ceil(totalRelatorio/RELATORIO_POR_PAGINA));
  $('reportPageLabel').textContent=`Página ${paginaRelatorio} de ${paginas}`;
  $('reportPrev').disabled=relatorioCarregando||paginaRelatorio<=1;
  $('reportNext').disabled=relatorioCarregando||paginaRelatorio>=paginas;
  $('reportCsv').disabled=relatorioCarregando||!dados.length;
  $('reportCsvFull').disabled=relatorioCarregando||exportacaoRelatorioEmAndamento||!totalRelatorio;
  $('reportPrint').disabled=relatorioCarregando||!dados.length;
  $('reportTotals').disabled=relatorioCarregando||totaisRelatorioRodando||!totalRelatorio;
  $('reportInfo').textContent=`${totalRelatorio} afastamento(s) no banco com estes filtros. Exibindo ${dados.length} registro(s) na página ${paginaRelatorio}. Policiais distintos e dias somados apenas nesta página. CSV da página e impressão incluem somente esta página; use Exportar relatório completo CSV para obter todos os registros filtrados e Calcular totais do período para conferir o conjunto completo.`;
  $('reportPrintInfo').textContent=`14º BPM — Relatório de Afastamentos | Período: ${formatarData($('reportStart').value)||'sem início definido'} a ${formatarData($('reportEnd').value)||'sem fim definido'} | Página ${paginaRelatorio} | Gerado em ${formatarData(hojeISO())}`;
}
function exportarRelatorioCsv(){
  if(relatorioCarregando||!registrosRelatorio.length||!validarPeriodoRelatorio())return;
  const linhas=[['Matrícula','QRA','Policial','Tipo','Início','Término','Dias','Situação']];
  registrosRelatorio.forEach(r=>linhas.push([r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),r.dias,situacao(r)]));
  const celula=v=>{let t=String(v??'');if(/^[\s]*[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
  const csv='\uFEFF'+linhas.map(l=>l.map(celula).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');link.href=url;link.download='relatorio_gerencial_pagina_'+paginaRelatorio+'_'+hojeISO()+'.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
['reportStart','reportEnd','reportPolicial','reportTipo'].forEach(id=>$(id).addEventListener('change',()=>{paginaRelatorio=1;void consultarRelatorio();}));
$('reportClear').addEventListener('click',()=>{['reportStart','reportEnd','reportPolicial','reportTipo'].forEach(id=>$(id).value='');paginaRelatorio=1;void consultarRelatorio();});
$('reportPrev').addEventListener('click',()=>{if(paginaRelatorio>1){paginaRelatorio--;void consultarRelatorio();}});
$('reportNext').addEventListener('click',()=>{if(paginaRelatorio*RELATORIO_POR_PAGINA<totalRelatorio){paginaRelatorio++;void consultarRelatorio();}});
$('reportPrint').addEventListener('click',()=>{if(!relatorioCarregando&&registrosRelatorio.length&&validarPeriodoRelatorio())window.print();});
$('reportCsv').addEventListener('click',exportarRelatorioCsv);
// V18: exportação completa em lotes; nenhuma linha parcial é baixada se ocorrer erro.
let exportacaoRelatorioEmAndamento=false;
let exportacaoRelatorioCancelada=false;
const LOTE_EXPORTACAO_RELATORIO=500;
function cancelarExportacaoRelatorio(){
  if(exportacaoRelatorioEmAndamento){exportacaoRelatorioCancelada=true;$('reportExportStatus').textContent='Cancelando exportação após a consulta em andamento...';}
}
function filtrosRelatorioAtuais(){
  return {ini:$('reportStart').value,fim:$('reportEnd').value,policial:$('reportPolicial').value,tipo:$('reportTipo').value};
}
function filtrosRelatorioIguais(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function celulaCsvSegura(v){
  let t=String(v??'');
  if(/^[\s\uFEFF\u200B]*[=+@-]/.test(t))t="'"+t;
  return '"'+t.replace(/"/g,'""')+'"';
}
function linhaCsvRelatorio(r){
  return [r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),r.dias,situacao(r)].map(celulaCsvSegura).join(';');
}
async function exportarRelatorioCompletoCsv(){
  if(exportacaoRelatorioEmAndamento||relatorioCarregando||!validarPeriodoRelatorio()||!totalRelatorio)return;
  const filtros=filtrosRelatorioAtuais(), contexto=contextoConsulta();
  exportacaoRelatorioEmAndamento=true;exportacaoRelatorioCancelada=false;
  const botao=$('reportCsvFull'),cancelar=$('reportCancelExport');
  botao.disabled=true;cancelar.hidden=false;
  const status=$('reportExportStatus');
  const linhas=[['Matrícula','QRA','Policial','Tipo','Início','Término','Dias','Situação'].map(celulaCsvSegura).join(';')];
  let carregados=0,ultimoId=null,ultimaData=null;
  try{
    // Cursor composto por data_inicio + id evita o limite de offset do PostgREST em históricos extensos.
    // Usa a mesma ordenação do relatório na tela: data_inicio DESC, id DESC.
    while(true){
      if(!contexto()||exportacaoRelatorioCancelada)throw new Error('Exportação cancelada. Nenhum arquivo parcial foi gerado.');
      if(!contexto()||!filtrosRelatorioIguais(filtros,filtrosRelatorioAtuais()))throw new Error('Os filtros foram alterados. Reinicie a exportação.');
      status.textContent=`Preparando CSV completo... ${carregados} registro(s) recebidos.`;
      let q=db.from('afastamentos')
        .select('id,policial_id,tipo_id,data_inicio,data_fim,dias,cancelado_em,policiais(matricula,qra,nome_completo),tipos_afastamento(sigla)')
        .is('cancelado_em',null)
        .order('data_inicio',{ascending:false}).order('id',{ascending:false})
        .limit(LOTE_EXPORTACAO_RELATORIO);
      if(filtros.ini)q=q.gte('data_inicio',filtros.ini);
      if(filtros.fim)q=q.lte('data_inicio',filtros.fim);
      if(filtros.policial)q=q.eq('policial_id',filtros.policial);
      if(filtros.tipo)q=q.eq('tipo_id',filtros.tipo);
      if(ultimaData!==null){
        // Chave de paginação: datas anteriores, ou mesma data e ID inferior.
        q=q.or(`data_inicio.lt.${ultimaData},and(data_inicio.eq.${ultimaData},id.lt.${ultimoId})`);
      }
      const {data,error}=await q;
      if(error)throw error;
      if(!contexto()||exportacaoRelatorioCancelada)throw new Error('Exportação cancelada. Nenhum arquivo parcial foi gerado.');
      const lote=data||[];
      if(!lote.length)break;
      for(const r of lote)linhas.push(linhaCsvRelatorio(r));
      carregados+=lote.length;
      const ultimo=lote[lote.length-1];ultimaData=ultimo.data_inicio;ultimoId=ultimo.id;

    }
    if(!contexto()||!filtrosRelatorioIguais(filtros,filtrosRelatorioAtuais()))throw new Error('Os filtros foram alterados. Reinicie a exportação.');
    if(!carregados)throw new Error('Nenhum registro encontrado para exportar.');
    const csv='\uFEFF'+linhas.join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const link=document.createElement('a');link.href=url;
    link.download='relatorio_gerencial_completo_'+hojeISO()+'.csv';
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
    status.textContent=`Exportação concluída: ${carregados} afastamento(s) no arquivo CSV. A base pode ter mudado durante a consulta.`;
  }catch(error){
    console.error('Falha na exportação completa:',error);
    if(contexto())status.textContent='Não foi possível concluir: '+erroAmigavel(error)+' Nenhum CSV parcial foi baixado.';
  }finally{
    exportacaoRelatorioEmAndamento=false;cancelar.hidden=true;
    botao.disabled=relatorioCarregando||!totalRelatorio;
  }
}
$('reportCsvFull').addEventListener('click',()=>{void exportarRelatorioCompletoCsv();});
$('reportCancelExport').addEventListener('click',cancelarExportacaoRelatorio);

let totaisRelatorioToken=0, totaisRelatorioRodando=false, chaveTotaisRelatorio=null;
function limparTotaisRelatorio() {
  totaisRelatorioToken++; totaisRelatorioRodando=false; chaveTotaisRelatorio=null;
  $('reportFullTotals').hidden=true; $('reportTotalsCancel').hidden=true;
  $('reportTotalsStatus').textContent='';
  $('reportTotalPeople').textContent='—'; $('reportTotalDays').textContent='—'; $('reportTotalRows').textContent='—';
}
async function calcularTotaisRelatorio() {
  if(!usuarioAtual||relatorioCarregando||totaisRelatorioRodando||!totalRelatorio||!validarPeriodoRelatorio())return;
  const filtros=filtrosRelatorioAtuais(), contexto=contextoConsulta(), token=++totaisRelatorioToken;
  const valida=()=>contexto()&&token===totaisRelatorioToken&&filtrosRelatorioIguais(filtros,filtrosRelatorioAtuais());
  totaisRelatorioRodando=true; $('reportTotals').disabled=true; $('reportTotalsCancel').hidden=false; $('reportFullTotals').hidden=true;
  const pessoas=new Set(); let dias=0, total=0;
  try {
    await percorrerPorId(()=>{
      let q=db.from('afastamentos').select('id,policial_id,dias').is('cancelado_em',null);
      if(filtros.ini)q=q.gte('data_inicio',filtros.ini);
      if(filtros.fim)q=q.lte('data_inicio',filtros.fim);
      if(filtros.policial)q=q.eq('policial_id',filtros.policial);
      if(filtros.tipo)q=q.eq('tipo_id',filtros.tipo);
      return q;
    }, lote=>{
      for(const r of lote){pessoas.add(String(r.policial_id));dias+=Number(r.dias||0);total++;}
      $('reportTotalsStatus').textContent=`Calculando totais: ${total} registro(s) conferidos...`;
    },valida);
    conferirConsulta(valida);
    $('reportTotalRows').textContent=total; $('reportTotalPeople').textContent=pessoas.size; $('reportTotalDays').textContent=dias;
    $('reportFullTotals').hidden=false;
    $('reportTotalsStatus').textContent='Totais de todos os registros filtrados, excluindo cancelados. Dias são a soma das durações, não dias únicos de calendário. A base pode mudar durante a consulta.';
  } catch(error) {
    if(contexto()&&token===totaisRelatorioToken)$('reportTotalsStatus').textContent='Não foi possível concluir os totais. '+(error.name==='AbortError'?'Consulta cancelada.':erroAmigavel(error));
  } finally {
    if(token===totaisRelatorioToken){
      totaisRelatorioRodando=false; $('reportTotalsCancel').hidden=true;
      $('reportTotals').disabled=relatorioCarregando||!totalRelatorio;
    }
  }
}
$('reportTotals').addEventListener('click',()=>{void calcularTotaisRelatorio();});
$('reportTotalsCancel').addEventListener('click',()=>{
  limparTotaisRelatorio();
  $('reportTotalsStatus').textContent='Cálculo cancelado. Nenhum total parcial foi apresentado.';
  $('reportTotals').disabled=relatorioCarregando||!totalRelatorio;
});
