'use strict';

// V15: paginação no servidor. Cada página recupera apenas 100 eventos.
const AUDITORIA_POR_PAGINA=100;
let paginaAuditoria=1,totalAuditoria=0,consultaAuditoriaToken=0;
async function carregarAuditoria(){
  if(!ehAdmin())return;
  const token=++consultaAuditoriaToken,contexto=contextoConsulta();
  iniciarConsultaTela('auditoria');
  const ini=$('auditStart').value,fim=$('auditEnd').value;
  if(ini&&fim&&ini>fim){$('auditInfo').textContent='A data inicial não pode ser posterior à final.';concluirConsultaTela('auditoria',false);return;}
  $('auditInfo').textContent='Consultando página '+paginaAuditoria+' da auditoria...';
  $('auditPrev').disabled=true;$('auditNext').disabled=true;
  let q=db.from('auditoria')
    .select('id,operacao,registro_id,usuario_id,data_hora,dados_anteriores,dados_novos',{count:'exact'})
    .eq('tabela','afastamentos')
    .order('data_hora',{ascending:false})
    .order('id',{ascending:false})
    .range((paginaAuditoria-1)*AUDITORIA_POR_PAGINA,paginaAuditoria*AUDITORIA_POR_PAGINA-1);
  if(ini)q=q.gte('data_hora',ini+'T00:00:00');
  if(fim)q=q.lt('data_hora',somarDias(fim,1)+'T00:00:00');
  const {data,error,count}=await q;
  if(!contexto()||token!==consultaAuditoriaToken)return;
  if(error){
    concluirConsultaTela('auditoria',false);
    console.error('Erro de auditoria:',error);
    auditoria=[];totalAuditoria=0;mostrarAuditoria();
    $('auditInfo').textContent='Auditoria indisponível: '+erroAmigavel(error);
    return;
  }
  auditoria=data||[];totalAuditoria=count??0;
  // Se os últimos registros foram removidos por manutenção, retorna à página válida.
  const ultima=Math.max(1,Math.ceil(totalAuditoria/AUDITORIA_POR_PAGINA));
  if(paginaAuditoria>ultima){paginaAuditoria=ultima;await carregarAuditoria();return;}
  mostrarAuditoria();concluirConsultaTela('auditoria');
}
function operacaoOriginalAuditoria(a){
  // O banco pode registrar operacoes em portugues (INCLUSAO/ALTERACAO)
  // ou em ingles (INSERT/UPDATE/DELETE). Normalizamos para filtrar.
  const valor=String(a.operacao ?? '').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const equivalencias={
    INCLUSAO:'INSERT', INCLUSAO_DE_REGISTRO:'INSERT', INSERCAO:'INSERT',
    ALTERACAO:'UPDATE', ATUALIZACAO:'UPDATE', EDICAO:'UPDATE',
    EXCLUSAO:'DELETE', REMOCAO:'DELETE'
  };
  return equivalencias[valor] || valor;
}
function ehCancelamentoAuditoria(a){
  if(operacaoOriginalAuditoria(a)!=='UPDATE')return false;
  const anterior=snapshotAuditoria(a.dados_anteriores)?.cancelado_em ?? null;
  const posterior=snapshotAuditoria(a.dados_novos)?.cancelado_em ?? null;
  return !anterior && Boolean(posterior);
}
function tipoEventoAuditoria(a){
  return ehCancelamentoAuditoria(a)?'CANCELAMENTO':operacaoOriginalAuditoria(a);
}
function rotuloEventoAuditoria(a){
  const tipo=tipoEventoAuditoria(a);
  return ({INSERT:'INSERT',UPDATE:'UPDATE',CANCELAMENTO:'CANCELAMENTO',DELETE:'DELETE'})[tipo]||tipo;
}
let v20EmailsUsuarios=new Map();
function v20EmailUsuario(id){return v20EmailsUsuarios.get(String(id??''))||String(id??'—');}
async function v20CarregarEmailsAuditoria(){
  if(!ehAdmin()||!usuarioAtual)return;
  const idSessao=usuarioAtual.id,contexto=contextoConsulta();
  const {data,error}=await db.rpc('v6_listar_usuarios');
  if(!contexto()||!usuarioAtual||usuarioAtual.id!==idSessao)return;
  if(error){console.warn('Não foi possível resolver e-mails da auditoria:',error);return;}
  v20EmailsUsuarios=new Map((data||[]).filter(u=>u.id&&u.email).map(u=>[String(u.id),String(u.email)]));
  mostrarAuditoria();
}
function auditoriaFiltrada(){
  const op=$('auditOperation').value.trim().toUpperCase();
  const termo=$('auditSearch').value.trim().toLowerCase();
  return auditoria.filter(a=>{
    const tipo=tipoEventoAuditoria(a);
    const correspondeOperacao=!op||tipo===op;
    const correspondePesquisa=!termo||String(a.registro_id??'').toLowerCase().includes(termo)||String(a.usuario_id??'').toLowerCase().includes(termo)||v20EmailUsuario(a.usuario_id).toLowerCase().includes(termo);
    return correspondeOperacao&&correspondePesquisa;
  });
}
function mostrarAuditoria(){
  if(!ehAdmin())return;
  const tbody=$('auditBody');tbody.replaceChildren();
  const dados=auditoriaFiltrada();
  for(const a of dados){
    const tr=document.createElement('tr');tr.className='audit-event';
    [formatarDataHoraBrasilia(a.data_hora),rotuloEventoAuditoria(a),String(a.registro_id??''),v20EmailUsuario(a.usuario_id)].forEach(v=>celula(tr,v));
    tbody.appendChild(tr);
    const detalhes=document.createElement('tr');detalhes.className='audit-event-details';detalhes.dataset.eventoId=String(a.id);
    const td=celula(detalhes,'');td.colSpan=4;renderizarDetalhesAuditoria(td,a);tbody.appendChild(detalhes);
  }
  const contagem={INSERT:0,UPDATE:0,CANCELAMENTO:0};
  auditoria.forEach(a=>{const op=tipoEventoAuditoria(a);if(Object.hasOwn(contagem,op))contagem[op]++;});
  const paginas=Math.max(1,Math.ceil(totalAuditoria/AUDITORIA_POR_PAGINA));
  $('auditPageLabel').textContent=`Página ${paginaAuditoria} de ${paginas}`;
  $('auditPrev').disabled=paginaAuditoria<=1;
  $('auditNext').disabled=paginaAuditoria>=paginas;
  $('auditInfo').textContent=`${dados.length} evento(s) exibido(s) nesta página; ${totalAuditoria} evento(s) no período consultado. Nesta página: INSERT ${contagem.INSERT}, UPDATE ${contagem.UPDATE}, CANCELAMENTO ${contagem.CANCELAMENTO}. Os filtros de operação e ID atuam apenas na página atual.`;
}
function exportarAuditoriaCsv(){
  if(!ehAdmin())return;
  const linhas=[['Data/hora (Brasília)','Operação','Registro ID','Usuário (e-mail ou ID)','Campo','Valor anterior','Valor novo']];
  for(const evento of auditoriaFiltrada()){
    const base=[formatarDataHoraBrasilia(evento.data_hora),rotuloEventoAuditoria(evento),evento.registro_id??'',v20EmailUsuario(evento.usuario_id)];
    const comparacao=alteracoesAuditoria(evento);
    if(!comparacao.itens.length)linhas.push([...base,'',comparacao.mensagem,'']);
    else for(const item of comparacao.itens)linhas.push([...base,item.rotulo,item.anterior,item.novo]);
  }
  baixarCsv(linhas,'auditoria_afastamentos_'+hojeISO()+'.csv');
}
$('auditReload').addEventListener('click',()=>{paginaAuditoria=1;void carregarAuditoria();});
$('auditClear').addEventListener('click',()=>{['auditStart','auditEnd','auditOperation','auditSearch'].forEach(id=>$(id).value='');paginaAuditoria=1;void carregarAuditoria();});
$('auditOperation').addEventListener('change',mostrarAuditoria);
$('auditSearch').addEventListener('input',mostrarAuditoria);
$('auditCsv').addEventListener('click',exportarAuditoriaCsv);
$('auditPrev').addEventListener('click',()=>{if(paginaAuditoria>1){paginaAuditoria--;void carregarAuditoria();}});
$('auditNext').addEventListener('click',()=>{if(paginaAuditoria*AUDITORIA_POR_PAGINA<totalAuditoria){paginaAuditoria++;void carregarAuditoria();}});
$('auditStart').addEventListener('change',()=>{paginaAuditoria=1;void carregarAuditoria();});
$('auditEnd').addEventListener('change',()=>{paginaAuditoria=1;void carregarAuditoria();});
