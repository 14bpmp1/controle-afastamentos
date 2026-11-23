'use strict';

function registrosFiltrados(){
  const texto=$('filterText').value.toLowerCase().trim();
  const policial=$('filterPolicial').value,mes=$('filterMes').value,averbacao=$('filterAverbacao').value;
  const tipo=$('filterTipo').value,ini=$('filterInicio').value,fim=$('filterFim').value,estado=$('filterSituacao').value;
  const mapa=new Map(averbacoes.map(a=>[String(a.afastamento_id),a]));
  const filtrados=registros.filter(r=>{
    const a=mapa.get(String(r.id));
    const situacaoA=r.cancelado_em?'NAO APLICAVEL':a?.situacao_averbacao||'NAO APLICAVEL';
    return [r.policiais?.matricula,r.policiais?.qra,r.policiais?.nome_completo,r.tipos_afastamento?.sigla].join(' ').toLowerCase().includes(texto)
      && (!policial||String(r.policial_id)===policial)
      && (!mes||r.data_inicio.slice(0,7)===mes)
      && (!tipo||String(r.tipo_id)===tipo)
      && (!ini||r.data_inicio>=ini)
      && (!fim||r.data_inicio<=fim)
      && (!estado||situacao(r)===estado)
      && (!averbacao||situacaoA===averbacao);
  });
  return filtrados;
}
function mostrarRegistros(){
  const tbody=$('recordsBody');tbody.replaceChildren();
  const mapa=new Map(averbacoes.map(a=>[String(a.afastamento_id),a]));
  const filtrados=registrosFiltrados();
  const totalPaginas=Math.max(1,Math.ceil(filtrados.length/TAMANHO_PAGINA));
  paginaRegistros=Math.min(Math.max(1,paginaRegistros),totalPaginas);
  const pagina=filtrados.slice((paginaRegistros-1)*TAMANHO_PAGINA,paginaRegistros*TAMANHO_PAGINA);
  pagina.forEach(r=>{
    const a=mapa.get(String(r.id)),tr=document.createElement('tr'),s=situacao(r);
    const valores=[r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),String(r.dias),s];
    valores.forEach((v,i)=>{
      const td=document.createElement('td');
      if(i===7){const tag=document.createElement('span');tag.className='tag '+(s==='Encerrado'?'done':s==='Cancelado'?'cancel':s==='Ativo'&&r.data_fim<=somarDias(hojeISO(),5)?'soon':'');tag.textContent=v;td.appendChild(tag);}
      else td.textContent=v;
      tr.appendChild(td);
    });
    const av=document.createElement('td'),tag=document.createElement('span');
    tag.className='tag '+(a?.situacao_averbacao==='AVERBAR'?'av':'noav');
    tag.textContent=r.cancelado_em?'Não aplicável':erroView?'Indisponível':a?.situacao_averbacao==='AVERBAR'?'AVERBAR':a?'Não averbar':'Não aplicável';
    av.appendChild(tag);tr.appendChild(av);
    const total=document.createElement('td');total.textContent=a&&!r.cancelado_em?String(a.total_dias):'—';tr.appendChild(total);
    const ciclo=document.createElement('td');ciclo.textContent=a&&!r.cancelado_em?`${formatarData(a.inicio_ciclo)} a ${formatarData(a.fim_ciclo)}`:'—';tr.appendChild(ciclo);
    if(ehAdmin()){
      const td=document.createElement('td'),b=document.createElement('div');b.className='edit-actions';
      if(!r.cancelado_em){
        const edit=document.createElement('button');edit.type='button';edit.className='secondary mini';edit.textContent='Editar';edit.addEventListener('click',()=>editarRegistro(r.id));b.appendChild(edit);
        const cancel=document.createElement('button');cancel.type='button';cancel.className='danger mini';cancel.textContent='Cancelar';cancel.addEventListener('click',()=>{void cancelarRegistro(r.id);});b.appendChild(cancel);
      }else{b.textContent='—';}
      td.appendChild(b);tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  $('recordsInfo').textContent=`${filtrados.length} registro(s) encontrados; ${pagina.length} nesta página. ${registros.length} registros carregados.${registrosTruncados?' ATENÇÃO: limite de 20.000 registros atingido; filtros e exportações podem estar incompletos.':''}`;
  $('recordsPageInfo').textContent=`Página ${paginaRegistros} de ${totalPaginas}`;
  $('recordsPrev').disabled=paginaRegistros<=1;
  $('recordsNext').disabled=paginaRegistros>=totalPaginas;
}
function exportarCsv(){
  const mapa=new Map(averbacoes.map(a=>[String(a.afastamento_id),a]));
  const linhas=[['Matrícula','QRA','Policial','Tipo','Início','Término','Dias','Situação','Averbação','Dias no ciclo','Início ciclo','Fim ciclo']];
  registrosFiltrados().forEach(r=>{
    const a=mapa.get(String(r.id));
    linhas.push([r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),r.dias,situacao(r),r.cancelado_em?'Não aplicável':a?.situacao_averbacao||'Não aplicável',a&&!r.cancelado_em?a.total_dias:'',a&&!r.cancelado_em?formatarData(a.inicio_ciclo):'',a&&!r.cancelado_em?formatarData(a.fim_ciclo):'']);
  });
  // Escapa caracteres de fórmula para reduzir risco de injeção no Excel.
  const celula=v=>{let t=String(v??'');if(/^[\s]*[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
  const csv='\uFEFF'+linhas.map(l=>l.map(celula).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');link.href=url;link.download='relatorio_afastamentos_'+hojeISO()+'.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
