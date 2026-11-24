'use strict';

// V16: histórico individual consultado diretamente no banco e paginado.
const HISTORICO_POR_PAGINA=100;
let paginaHistorico=1,totalHistorico=0,registrosHistorico=[],historicoToken=0;
let averbacoesHistorico=[],erroViewHistorico=null;
function preencherHistorico(){
  const seletor=$('historyPolicial'),anterior=seletor.value,porId=new Map();
  for(const p of policiaisCatalogo)porId.set(String(p.id),`${p.matricula} · ${p.qra} · ${p.nome_completo}${p.ativo?'':' (inativo)'}`);
  seletor.replaceChildren(opcao('','Selecione um policial'));
  [...porId.entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).forEach(([id,nome])=>seletor.appendChild(opcao(id,nome)));
  if(porId.has(anterior))seletor.value=anterior;
}
async function consultarHistorico(){
  const contexto=contextoConsulta();
  const token=++historicoToken,id=$('historyPolicial').value,ini=$('historyStart').value,fim=$('historyEnd').value;
  const valida=()=>contexto()&&token===historicoToken;
  averbacoesHistorico=[];erroViewHistorico=null;
  if(!id){registrosHistorico=[];totalHistorico=0;mostrarHistorico();return;}
  if(ini&&fim&&ini>fim){registrosHistorico=[];totalHistorico=0;mostrarHistorico();$('historyInfo').textContent='A data inicial não pode ser posterior à final.';return;}
  $('historyInfo').textContent='Consultando histórico no Supabase...';
  $('historyPrev').disabled=true;$('historyNext').disabled=true;$('historyCsv').disabled=true;
  let q=db.from('afastamentos')
    .select('id,policial_id,tipo_id,data_inicio,data_fim,dias,cancelado_em,policiais(matricula,qra,nome_completo),tipos_afastamento(sigla)',{count:'exact'})
    .eq('policial_id',id).order('data_inicio',{ascending:false}).order('id',{ascending:false})
    .range((paginaHistorico-1)*HISTORICO_POR_PAGINA,paginaHistorico*HISTORICO_POR_PAGINA-1);
  if(ini)q=q.gte('data_inicio',ini);
  if(fim)q=q.lte('data_inicio',fim);
  if($('historyCancelados').value!=='sim')q=q.is('cancelado_em',null);
  const {data,error,count}=await q;
  if(!valida())return;
  if(error){registrosHistorico=[];totalHistorico=0;mostrarHistorico();$('historyInfo').textContent='Erro na consulta: '+erroAmigavel(error);return;}
  totalHistorico=count??0;
  const ultima=Math.max(1,Math.ceil(totalHistorico/HISTORICO_POR_PAGINA));
  if(paginaHistorico>ultima){paginaHistorico=ultima;await consultarHistorico();return;}
  const linhas=data||[];
  try{averbacoesHistorico=await buscarAverbacoes(linhas.filter(r=>!r.cancelado_em).map(r=>r.id),valida);}
  catch(error){if(!valida())return;erroViewHistorico=error;}
  if(!valida())return;
  registrosHistorico=linhas;mostrarHistorico();
}
function mostrarHistorico(){
  const tbody=$('historyBody'),info=$('historyInfo');tbody.replaceChildren();
  const id=$('historyPolicial').value,dados=id?registrosHistorico:[];
  // Os indicadores de duração/tipos/cancelados descrevem apenas a página visível.
  $('historyCount').textContent=id?totalHistorico:'—';
  $('historyDays').textContent=id?dados.filter(r=>!r.cancelado_em).reduce((s,r)=>s+Number(r.dias||0),0):'—';
  $('historyTypes').textContent=id?new Set(dados.map(r=>r.tipo_id)).size:'—';
  $('historyCanceled').textContent=id?dados.filter(r=>r.cancelado_em).length:'—';
  const mapa=new Map(averbacoesHistorico.map(a=>[String(a.afastamento_id),a]));
  for(const r of dados){
    const a=!r.cancelado_em?mapa.get(String(r.id)):null,tr=document.createElement('tr');
    [r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),r.dias,situacao(r),r.cancelado_em?'Não aplicável':erroViewHistorico?'Indisponível':a?.situacao_averbacao||'Não disponível',a?formatarData(a.inicio_ciclo):'—',a?formatarData(a.fim_ciclo):'—'].forEach(v=>{const td=document.createElement('td');td.textContent=String(v??'');tr.appendChild(td);});
    tbody.appendChild(tr);
  }
  if(!dados.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=8;td.textContent=id?'Nenhum registro encontrado para os filtros.':'Selecione um policial para consultar o histórico.';tr.appendChild(td);tbody.appendChild(tr);}
  const paginas=Math.max(1,Math.ceil(totalHistorico/HISTORICO_POR_PAGINA));
  $('historyPageLabel').textContent=`Página ${paginaHistorico} de ${paginas}`;
  $('historyPrev').disabled=!id||paginaHistorico<=1;
  $('historyNext').disabled=!id||paginaHistorico>=paginas;
  $('historyCsv').disabled=!dados.length;
  info.textContent=`${totalHistorico} afastamento(s) encontrado(s) no banco; ${dados.length} nesta página. Os indicadores de dias, tipos e cancelamentos mostram somente a página atual. CSV exporta somente a página atual. Averbação indicativa consultada para os registros desta página.`;
}
function exportarHistoricoCsv(){
  if(!$('historyPolicial').value||!registrosHistorico.length)return;
  const mapa=new Map(averbacoesHistorico.map(a=>[String(a.afastamento_id),a]));
  const linhas=[['Matrícula','QRA','Policial','Tipo','Início','Término','Dias','Situação','Averbação indicativa','Início ciclo','Fim ciclo']];
  for(const r of registrosHistorico){const a=!r.cancelado_em?mapa.get(String(r.id)):null;
    linhas.push([r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),r.dias,situacao(r),r.cancelado_em?'Não aplicável':erroViewHistorico?'Indisponível':a?.situacao_averbacao||'Não disponível',a?formatarData(a.inicio_ciclo):'',a?formatarData(a.fim_ciclo):'']);
  }
  const cel=v=>{let t=String(v??'');if(/^[\s]*[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
  const csv='\uFEFF'+linhas.map(l=>l.map(cel).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');link.href=url;link.download='historico_policial_pagina_'+paginaHistorico+'_'+hojeISO()+'.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
['historyPolicial','historyStart','historyEnd','historyCancelados'].forEach(id=>$(id).addEventListener('change',()=>{paginaHistorico=1;void consultarHistorico();}));
$('historyClear').addEventListener('click',()=>{['historyPolicial','historyStart','historyEnd'].forEach(id=>$(id).value='');$('historyCancelados').value='nao';paginaHistorico=1;void consultarHistorico();});
$('historyCsv').addEventListener('click',exportarHistoricoCsv);
$('historyPrev').addEventListener('click',()=>{if(paginaHistorico>1){paginaHistorico--;void consultarHistorico();}});
$('historyNext').addEventListener('click',()=>{if(paginaHistorico*HISTORICO_POR_PAGINA<totalHistorico){paginaHistorico++;void consultarHistorico();}});
