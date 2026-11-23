'use strict';

async function buscarEmLotes(criarConsulta, maximo=MAX_REGISTROS){
  const resultado=[];
  for(let inicio=0;inicio<maximo;inicio+=TAMANHO_LOTE){
    const {data,error}=await criarConsulta().range(inicio,inicio+TAMANHO_LOTE-1);
    if(error)throw error;
    const lote=data||[];
    resultado.push(...lote);
    if(lote.length<TAMANHO_LOTE)return {dados:resultado,truncado:false};
  }
  return {dados:resultado,truncado:true};
}
let consultaDadosToken=0;
async function carregarDados(){
  if(!usuarioAtual)return;
  const v19UserId=usuarioAtual.id;
  const token=++consultaDadosToken;
  invalidarTelas();
  $('refresh').disabled=true;
  setMsg('moduleMessage','Atualizando dados...');
  $('moduleMessage').hidden=false;
  $('recordsInfo').textContent='Carregando registros...';
  try{
    const [p,t,a,v]=await Promise.allSettled([
      db.from('policiais').select('id,matricula,posto_graduacao,qra,nome_completo').eq('ativo',true).order('nome_completo'),
      db.from('tipos_afastamento').select('id,sigla,descricao,dias_fixos').eq('ativo',true).order('sigla'),
      buscarEmLotes(()=>db.from('afastamentos').select('id,policial_id,tipo_id,data_inicio,data_fim,dias,observacoes,cancelado_em,policiais(matricula,qra,nome_completo),tipos_afastamento(sigla)').order('data_inicio',{ascending:false}).order('id',{ascending:false})),
      buscarEmLotes(()=>db.from('vw_averbacoes').select('afastamento_id,policial_id,numero_ciclo,inicio_ciclo,fim_ciclo,total_dias,situacao_averbacao').order('afastamento_id',{ascending:true}))
    ]);
    if(!usuarioAtual || usuarioAtual.id!==v19UserId || token!==consultaDadosToken)return;
    for(const r of [p,t,a])if(r.status==='rejected')throw r.reason;
    if(p.value.error||t.value.error)throw p.value.error||t.value.error;
    policiais=p.value.data||[];tipos=t.value.data||[];registros=a.value.dados;
    registrosTruncados=a.value.truncado;
    erroView=v.status==='rejected'?v.reason:null;
    averbacoes=v.status==='fulfilled'?v.value.dados:[];
    averbacoesTruncadas=v.status==='fulfilled'&&v.value.truncado;
    paginaRegistros=1;
    if(erroView)console.error('Falha ao consultar vw_averbacoes:',erroView);
    $('avisoAverbacao').textContent=erroView
      ? 'Não foi possível consultar a view de averbações: '+(erroView.message||String(erroView))
      : 'Averbação indicativa: DM/LTSP por ciclo de 30 dias; a situação é do ciclo completo, não do evento individual. Os demais tipos são não aplicáveis.'+(averbacoesTruncadas?' Atenção: consulta de averbações atingiu o limite de 20.000 linhas.':'');
    preencherSeletores();preencherFiltroRelatorio();preencherHistorico();atualizarPainel();mostrarAlertas();mostrarAgenda();mostrarRegistros();
    dadosCarregados=true;
    $('moduleMessage').hidden=true;
    await carregarTelaAtual();
  }catch(error){
    if(!usuarioAtual || usuarioAtual.id!==v19UserId || token!==consultaDadosToken)return;
    console.error('Erro ao carregar dados:',error);
    const mensagem='Erro ao consultar dados: '+erroAmigavel(error);
    $('recordsInfo').textContent=mensagem;
    setMsg('moduleMessage',mensagem+' Use Atualizar para tentar novamente.',true);
    $('moduleMessage').hidden=false;
  }finally{
    if(token===consultaDadosToken)$('refresh').disabled=false;
  }
}
