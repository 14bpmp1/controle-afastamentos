'use strict';

function situacao(r){const h=hojeISO();if(r.cancelado_em)return 'Cancelado';if(r.data_fim<h)return 'Encerrado';if(r.data_inicio>h)return 'Programado';return 'Ativo';}
function atualizarPainel(){
  const h=hojeISO(),limite=somarDias(h,5),validos=registros.filter(r=>!r.cancelado_em),ativos=validos.filter(r=>r.data_inicio<=h&&r.data_fim>=h);
  $('statPoliciais').textContent=policiais.length;
  $('statAtivos').textContent=ativos.length;
  $('statProximos').textContent=ativos.filter(r=>r.data_fim<=limite).length;
  $('statEncerrados').textContent=validos.filter(r=>r.data_fim<h).length;
  const ciclos=new Set(averbacoes.filter(a=>a.situacao_averbacao==='AVERBAR').map(a=>`${a.policial_id}:${a.numero_ciclo}`));
  $('statAverbacoes').textContent=erroView?'—':ciclos.size;
}
// V13: exportacao dos alertas visiveis, sem alterar registros ou regras de averbacao.
function alertasDoPeriodo(){
  const h=hojeISO(),janela=Number($('alertsWindow').value)||5,limite=somarDias(h,janela);
  return registros.filter(r=>!r.cancelado_em && r.data_inicio<=h && r.data_fim>=h && r.data_fim<=limite)
    .sort((a,b)=>a.data_fim.localeCompare(b.data_fim)||String(a.policiais?.matricula||'').localeCompare(String(b.policiais?.matricula||'')));
}
function exportarAlertasCsv(){
  const dados=alertasDoPeriodo(),h=hojeISO();
  if(!dados.length){alert('Não há alertas no período selecionado para exportar.');return;}
  const linhas=[['Matrícula','QRA','Nome','Tipo','Início','Término','Dias restantes','Retorno previsto','Observação']];
  dados.forEach(r=>{
    const dias=Math.round((Date.parse(r.data_fim+'T00:00:00Z')-Date.parse(h+'T00:00:00Z'))/86400000);
    linhas.push([r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),dias,formatarData(somarDias(r.data_fim,1)),'Retorno estimado, sem ajuste por feriados, fins de semana ou prorrogações']);
  });
  const celula=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,'\u0027$&').replace(/"/g,'""')+'"';
  const csv='\uFEFF'+linhas.map(l=>l.map(celula).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');link.href=url;link.download='alertas_retorno_'+h+'.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('alertsCsv').addEventListener('click',exportarAlertasCsv);
function mostrarAlertas(){
  const tbody=$('alertsBody'),resumo=$('alertsSummary'),info=$('alertsInfo');
  tbody.replaceChildren();resumo.replaceChildren();
  const h=hojeISO();
  const alertas=alertasDoPeriodo();
  const hoje=alertas.filter(r=>r.data_fim===h).length;
  const amanha=alertas.filter(r=>r.data_fim===somarDias(h,1)).length;
  for(const texto of [`${alertas.length} retorno(s) no período`,`${hoje} termina(m) hoje`,`${amanha} termina(m) amanhã`]){
    const span=document.createElement('span');span.textContent=texto;resumo.appendChild(span);
  }
  if(!alertas.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.className='alert-empty';td.textContent='Nenhum afastamento em andamento termina neste período.';tr.appendChild(td);tbody.appendChild(tr);}
  for(const r of alertas){
    const tr=document.createElement('tr');
    const dias=Math.round((Date.parse(r.data_fim+'T00:00:00Z')-Date.parse(h+'T00:00:00Z'))/86400000);
    const valores=[r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_fim),dias===0?'Hoje':dias===1?'Amanhã':`${dias} dias`,formatarData(somarDias(r.data_fim,1))];
    valores.forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i===5 && dias<=1){const tag=document.createElement('span');tag.className='tag soon';tag.textContent=v;td.replaceChildren(tag);}tr.appendChild(td);});
    tbody.appendChild(tr);
  }
  info.textContent='*Retorno previsto é o dia seguinte ao término, sem considerar fins de semana, feriados, prorrogações ou novas licenças. O painel não envia notificações automáticas.'+(registrosTruncados?' Atenção: a consulta atingiu o limite de 20.000 afastamentos; os alertas podem estar incompletos.':'');
}
$('alertsWindow').addEventListener('change',mostrarAlertas);
// V14: agenda de afastamentos futuros; leitura somente dos dados já carregados.
function agendaDoPeriodo(){
  const h=hojeISO(),dias=Number($('agendaWindow').value)||30,limite=somarDias(h,dias);
  return registros.filter(r=>!r.cancelado_em && r.data_inicio>h && r.data_inicio<=limite)
    .sort((a,b)=>a.data_inicio.localeCompare(b.data_inicio)||String(a.policiais?.matricula||'').localeCompare(String(b.policiais?.matricula||'')));
}
function mostrarAgenda(){
  const tbody=$('agendaBody'),resumo=$('agendaSummary');tbody.replaceChildren();resumo.replaceChildren();
  const dados=agendaDoPeriodo(),h=hojeISO(),pessoas=new Set(dados.map(r=>String(r.policial_id)));
  for(const msg of [`${dados.length} afastamento(s) programado(s)`,`${pessoas.size} policial(is)`, `Próximos ${$('agendaWindow').value} dias`]){
    const span=document.createElement('span');span.textContent=msg;resumo.appendChild(span);
  }
  if(!dados.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=8;td.className='alert-empty';td.textContent='Nenhum afastamento programado para o período selecionado.';tr.appendChild(td);tbody.appendChild(tr);}
  for(const r of dados){
    const faltam=Math.round((Date.parse(r.data_inicio+'T00:00:00Z')-Date.parse(h+'T00:00:00Z'))/86400000);
    const valores=[r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),r.dias,faltam===1?'Amanhã':`${faltam} dias`];
    const tr=document.createElement('tr');valores.forEach(v=>{const td=document.createElement('td');td.textContent=String(v??'');tr.appendChild(td);});tbody.appendChild(tr);
  }
  $('agendaInfo').textContent='Somente afastamentos com início após hoje. Consulta baseada nos registros carregados.'+(registrosTruncados?' Atenção: a base atingiu o limite de 20.000 registros; a agenda pode estar incompleta.':'');
}
function exportarAgendaCsv(){
  const dados=agendaDoPeriodo(),h=hojeISO();
  if(!dados.length){alert('Não há afastamentos programados no período selecionado para exportar.');return;}
  const linhas=[['Matrícula','QRA','Nome','Tipo','Início','Término','Dias','Dias até o início']];
  dados.forEach(r=>{
    const faltam=Math.round((Date.parse(r.data_inicio+'T00:00:00Z')-Date.parse(h+'T00:00:00Z'))/86400000);
    linhas.push([r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),r.dias,faltam]);
  });
  const celula=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replace(/"/g,'""')+'"';
  const csv='\uFEFF'+linhas.map(l=>l.map(celula).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');link.href=url;link.download='agenda_afastamentos_'+h+'.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('agendaWindow').addEventListener('change',mostrarAgenda);
$('agendaCsv').addEventListener('click',exportarAgendaCsv);
