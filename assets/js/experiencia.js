'use strict';

// Rascunhos ficam apenas na memória desta aba. Login e filtros não são formulários de cadastro.
const formulariosProtegidos=new Map();
let avisoSaidaAtivo=false;
function estadoCampos(campos) {
  return JSON.stringify(campos.map(el=>el.type==='checkbox'?el.checked:el.value));
}
function protegerCampos(chave,rotulo,campos) {
  formulariosProtegidos.set(chave,{rotulo,campos,original:estadoCampos(campos)});
  atualizarAvisoAlteracoes();
}
function registrarFormularioSalvo(chave) {
  const registro=formulariosProtegidos.get(chave);
  if(registro)registro.original=estadoCampos(registro.campos);
  atualizarAvisoAlteracoes();
}
function formulariosAlterados(chave) {
  if(!usuarioAtual)return [];
  return [...formulariosProtegidos.entries()].filter(([id,r])=>(!chave||id===chave||id.startsWith(chave+':'))&&estadoCampos(r.campos)!==r.original);
}
function temAlteracoesNaoSalvas(chave) {return formulariosAlterados(chave).length>0;}
function confirmarDescarte(chave) {
  return !temAlteracoesNaoSalvas(chave)||window.confirm('Há alterações não salvas. Deseja descartá-las e continuar?');
}
function avisarAntesDeSair(evento) {
  if(!temAlteracoesNaoSalvas())return;
  evento.preventDefault();evento.returnValue='Há alterações não salvas.';
}
function atualizarAvisoAlteracoes() {
  const alterados=formulariosAlterados();
  const texto=alterados.length?'Alterações não salvas: '+[...new Set(alterados.map(([,r])=>r.rotulo))].join(', ')+'. Salve antes de fechar ou recarregar a página.':'';
  if($('unsavedNotice').textContent!==texto)$('unsavedNotice').textContent=texto;
  $('unsavedNotice').hidden=!alterados.length;
  if(Boolean(alterados.length)!==avisoSaidaAtivo) {
    avisoSaidaAtivo=Boolean(alterados.length);
    if(avisoSaidaAtivo)window.addEventListener('beforeunload',avisarAntesDeSair);
    else window.removeEventListener('beforeunload',avisarAntesDeSair);
  }
}
function limparProtecaoUsuarios() {
  for(const chave of formulariosProtegidos.keys())if(chave.startsWith('usuarios:'))formulariosProtegidos.delete(chave);
  atualizarAvisoAlteracoes();
}
function reiniciarProtecaoFormularios() {
  formulariosProtegidos.clear();
  for(const [id,rotulo,campos] of [
    ['afastamentoForm','Afastamento',['policial','tipo','inicio','dias','observacoes']],
    ['policialAdminForm','Cadastro de policial',['admMatricula','admPosto','admQra','admNome']],
    ['tipoAdminForm','Tipo de afastamento',['admSigla','admDescricao','admDiasFixos']],
    ['descansoPrevisaoForm','Previsão de férias',['descansoPrevisaoMes','descansoPrevisaoAno']],
    ['descansoPeriodoForm','Período de férias/abono',['descansoTipo','descansoInicio','descansoDias']]
  ])protegerCampos(id,rotulo,campos.map($));
}
document.addEventListener('input',atualizarAvisoAlteracoes);
document.addEventListener('change',atualizarAvisoAlteracoes);
document.addEventListener('reset',()=>queueMicrotask(atualizarAvisoAlteracoes));
reiniciarProtecaoFormularios();

const FUSO_SISTEMA='America/Sao_Paulo';
const consultasConcluidas=new Map();
function formatarDataHoraBrasilia(valor) {
  if(valor===null||valor===undefined||valor==='')return '—';
  const data=new Date(valor);
  return Number.isNaN(data.getTime())?String(valor??'—'):new Intl.DateTimeFormat('pt-BR',{timeZone:FUSO_SISTEMA,dateStyle:'short',timeStyle:'medium'}).format(data);
}
function fonteConsultaRota(rota) {return rota==='novo-afastamento'?'base':rota==='seguranca'?null:rota;}
function mostrarUltimaConsulta() {
  const el=$('lastUpdate');
  if(!usuarioAtual){el.textContent='';el.hidden=true;return;}
  const fonte=fonteConsultaRota(rotaAtual),registro=consultasConcluidas.get(fonte);
  el.hidden=false;
  if(!fonte){el.textContent='';el.hidden=true;return;}
  const anterior=registro?.instante?`Última consulta concluída: ${formatarDataHoraBrasilia(registro.instante)} (horário de Brasília).`:'Nenhuma consulta concluída nesta tela.';
  el.textContent=anterior+(registro?.estado==='carregando'?' Atualizando...':registro?.estado==='erro'?' A nova consulta não foi concluída.':'');
}
function iniciarConsultaTela(fonte) {
  const anterior=consultasConcluidas.get(fonte);
  consultasConcluidas.set(fonte,{instante:anterior?.instante??null,estado:'carregando'});mostrarUltimaConsulta();
}
function concluirConsultaTela(fonte,sucesso=true) {
  const anterior=consultasConcluidas.get(fonte);
  consultasConcluidas.set(fonte,{instante:sucesso?Date.now():anterior?.instante??null,estado:sucesso?'ok':'erro'});mostrarUltimaConsulta();
}
function limparUltimasConsultas() {consultasConcluidas.clear();mostrarUltimaConsulta();}

function intervaloAtalhoPeriodo(atalho,referencia=new Date()) {
  const partes=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:FUSO_SISTEMA,year:'numeric',month:'2-digit'}).formatToParts(referencia).map(p=>[p.type,p.value]));
  let ano=Number(partes.year),mes=Number(partes.month);
  if(atalho==='ano-atual')return {inicio:`${ano}-01-01`,fim:`${ano}-12-31`};
  if(!['mes-atual','mes-anterior'].includes(atalho))throw new Error('Atalho de período inválido.');
  if(atalho==='mes-anterior'&&--mes===0){mes=12;ano--;}
  const prefixo=`${ano}-${String(mes).padStart(2,'0')}`;
  return {inicio:prefixo+'-01',fim:prefixo+'-'+String(new Date(Date.UTC(ano,mes,0)).getUTCDate()).padStart(2,'0')};
}
function aplicarAtalhoPeriodo(destino,atalho) {
  const periodo=intervaloAtalhoPeriodo(atalho);
  if(destino==='relatorios') {
    $('reportStart').value=periodo.inicio;$('reportEnd').value=periodo.fim;paginaRelatorio=1;void consultarRelatorio();
  } else if(destino==='historico') {
    $('historyStart').value=periodo.inicio;$('historyEnd').value=periodo.fim;paginaHistorico=1;void consultarHistorico();
  }
}
document.querySelectorAll('[data-periodo]').forEach(botao=>botao.addEventListener('click',()=>aplicarAtalhoPeriodo(botao.dataset.destino,botao.dataset.periodo)));
