'use strict';

const ROTULOS_AUDITORIA={id:'ID do afastamento',policial_id:'Policial',tipo_id:'Tipo de afastamento',data_inicio:'Data de início',data_fim:'Data de término',dias:'Dias',observacoes:'Observações',cancelado_em:'Cancelado em',cancelado_por:'Cancelado por',criado_em:'Criado em',criado_por:'Criado por',atualizado_em:'Atualizado em',nome:'Nome',perfil:'Perfil',ativo:'Ativo'};
function snapshotAuditoria(valor) {
  if(typeof valor==='string'){try{valor=JSON.parse(valor);}catch{return null;}}
  return valor&&typeof valor==='object'&&!Array.isArray(valor)?valor:null;
}
function valorCanonicoAuditoria(valor) {
  if(Array.isArray(valor))return valor.map(valorCanonicoAuditoria);
  if(valor&&typeof valor==='object')return Object.fromEntries(Object.keys(valor).sort().map(k=>[k,valorCanonicoAuditoria(valor[k])]));
  return valor;
}
function formatarValorAuditoria(campo,valor) {
  if(valor===null)return 'Não informado';
  if(valor==='')return '(vazio)';
  if(typeof valor==='boolean')return valor?'Sim':'Não';
  if(typeof valor==='object')return JSON.stringify(valor,null,2);
  const texto=String(valor);
  if(campo==='policial_id'){
    const p=policiaisCatalogo.find(p=>String(p.id)===texto);
    return p?`${texto} · ${p.qra}`:texto;
  }
  if(campo==='tipo_id'){
    const t=tiposCatalogo.find(t=>String(t.id)===texto);
    return t?`${texto} · ${t.sigla}`:texto;
  }
  if(['criado_por','cancelado_por','usuario_id'].includes(campo))return v20EmailUsuario(valor);
  if(/^\d{4}-\d{2}-\d{2}$/.test(texto))return formatarData(texto);
  if(/(_em|_at)$/.test(campo)&&/^\d{4}-\d{2}-\d{2}T/.test(texto))return formatarDataHoraBrasilia(texto)+' (Brasília)';
  return texto;
}
function alteracoesAuditoria(evento) {
  const antes=snapshotAuditoria(evento.dados_anteriores),depois=snapshotAuditoria(evento.dados_novos),operacao=operacaoOriginalAuditoria(evento);
  if(!antes&&!depois)return {itens:[],mensagem:'Os valores anterior e novo não estão disponíveis neste evento.'};
  const campos=[...new Set([...Object.keys(antes||{}),...Object.keys(depois||{})])];
  const itens=[];
  for(const campo of campos) {
    const tinha=antes&&Object.hasOwn(antes,campo),tem=depois&&Object.hasOwn(depois,campo);
    if(tinha&&tem&&JSON.stringify(valorCanonicoAuditoria(antes[campo]))===JSON.stringify(valorCanonicoAuditoria(depois[campo])))continue;
    const rotulo=Object.hasOwn(ROTULOS_AUDITORIA,campo)?ROTULOS_AUDITORIA[campo]:campo.replaceAll('_',' ');
    const anterior=tinha?formatarValorAuditoria(campo,antes[campo]):operacao==='INSERT'?'Não se aplica (inclusão)':antes?'Campo ausente':'Não disponível';
    const novo=tem?formatarValorAuditoria(campo,depois[campo]):operacao==='DELETE'?'Não se aplica (exclusão)':depois?'Campo ausente':'Não disponível';
    itens.push({campo,rotulo,anterior,novo});
  }
  return {itens,mensagem:itens.length?'':'Os valores disponíveis não apresentam diferenças.'};
}
function renderizarDetalhesAuditoria(td,evento) {
  td.className='audit-details-cell';
  const comparacao=alteracoesAuditoria(evento),detalhes=document.createElement('details'),resumo=document.createElement('summary');
  detalhes.className='audit-change-details';
  resumo.textContent=rotuloEventoAuditoria(evento)+' — '+(comparacao.itens.length?`Ver ${comparacao.itens.length} campo(s) alterado(s)`:'Ver detalhes');
  detalhes.appendChild(resumo);
  if(!comparacao.itens.length){const p=document.createElement('p');p.textContent=comparacao.mensagem;detalhes.appendChild(p);}
  else {
    const tabela=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr'),tbody=document.createElement('tbody');
    tabela.className='audit-diff';
    for(const nome of ['Campo','Valor anterior','Valor novo']){const th=document.createElement('th');th.scope='col';th.textContent=nome;tr.appendChild(th);}
    thead.appendChild(tr);
    for(const item of comparacao.itens){const linha=document.createElement('tr');[item.rotulo,item.anterior,item.novo].forEach(v=>celula(linha,v));tbody.appendChild(linha);}
    tabela.append(thead,tbody);detalhes.appendChild(tabela);
  }
  td.appendChild(detalhes);
}
