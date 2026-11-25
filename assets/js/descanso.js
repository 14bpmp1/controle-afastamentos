'use strict';

let descansoToken=0, descansoContexto=null, descansoControle=null, descansoPeriodos=[], descansoEdicao=null, descansoOcupado=false;

function anoBrasilia() {
  return Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(new Date()));
}
function preencherPoliciaisDescanso() {
  const select=$('descansoPolicial'), anterior=select.value, termo=normalizarBuscaPolicial($('descansoBusca').value);
  select.replaceChildren(opcao('','Selecione um policial'));
  for(const p of policiaisCatalogo) {
    if(String(p.id)!==anterior&&!normalizarBuscaPolicial([p.matricula,p.qra,p.nome_completo].join(' ')).includes(termo))continue;
    select.appendChild(opcao(p.id,`${p.matricula} · ${p.qra} · ${p.nome_completo}${p.ativo?'':' (inativo)'}`));
  }
  select.value=anterior;
}
function contextoDescansoSelecionado() {
  return {policial:$('descansoPolicial').value,ano:Number($('descansoAno').value)};
}
function mesmoContextoDescanso(a,b) {return Boolean(a&&b&&a.policial===b.policial&&a.ano===b.ano);}
function limparPeriodoDescanso(forcar=false) {
  if(!forcar&&!confirmarDescarte('descansoPeriodoForm'))return;
  descansoEdicao=null;$('descansoPeriodoForm').reset();$('descansoFim').value='';
  $('descansoTipo').disabled=false;$('descansoDias').max=30;
  $('descansoPeriodoTitulo').textContent='Registrar utilização';registrarFormularioSalvo('descansoPeriodoForm');
  if(!descansoOcupado)bloquearDescanso(false);
}
function reiniciarDescanso() {
  descansoToken++;descansoContexto=null;descansoControle=null;descansoPeriodos=[];descansoOcupado=false;
  $('descansoBusca').value='';$('descansoPolicial').replaceChildren(opcao('','Selecione um policial'));
  $('descansoAno').value=anoBrasilia();$('descansoPrevisaoForm').reset();limparPeriodoDescanso(true);
  $('descansoDetalhes').hidden=true;$('descansoMensagem').textContent='';$('descansoBody').replaceChildren();
  bloquearDescanso(false);
}
function bloquearDescanso(ocupado) {
  descansoOcupado=ocupado;
  for(const id of ['descansoBusca','descansoPolicial','descansoAno','descansoAtualizar','descansoSalvarPrevisao','descansoSalvarPeriodo','descansoLimparPeriodo'])$(id).disabled=ocupado;
  // Um envio captura valores imutáveis; também bloqueia os campos até a resposta.
  for(const id of ['descansoPrevisao','descansoInicio','descansoDias'])$(id).disabled=ocupado;
  $('descansoTipo').disabled=ocupado||Boolean(descansoEdicao);
  $('descansoBody').querySelectorAll('button').forEach(b=>b.disabled=ocupado);
  if(!ocupado&&descansoContexto) {
    const pessoa=policiaisCatalogo.find(p=>String(p.id)===descansoContexto.policial);
    $('descansoSalvarPrevisao').disabled=Boolean(descansoControle&&!ehAdmin())||!pessoa?.ativo;
    $('descansoPrevisao').disabled=$('descansoSalvarPrevisao').disabled;
    $('descansoSalvarPeriodo').disabled=!pessoa?.ativo&&!descansoEdicao;
  }
}
function limparContextoDescanso() {
  descansoControle=null;descansoPeriodos=[];$('descansoDetalhes').hidden=true;$('descansoBody').replaceChildren();
  $('descansoPrevisaoForm').reset();registrarFormularioSalvo('descansoPrevisaoForm');limparPeriodoDescanso(true);
}
async function mudarContextoDescanso() {
  if(descansoOcupado)return;
  if(!confirmarDescarte('descansoPrevisaoForm')||!confirmarDescarte('descansoPeriodoForm')) {
    $('descansoPolicial').value=descansoContexto?.policial||'';$('descansoAno').value=descansoContexto?.ano||anoBrasilia();return;
  }
  descansoToken++;descansoContexto=null;limparContextoDescanso();await carregarDescanso();
}
async function carregarDescanso() {
  if(!usuarioAtual||descansoOcupado)return;
  preencherPoliciaisDescanso();
  if(!$('descansoAno').value)$('descansoAno').value=anoBrasilia();
  const ctx=contextoDescansoSelecionado();
  if(!ctx.policial||!Number.isInteger(ctx.ano)||ctx.ano<1900||ctx.ano>9998) {
    descansoToken++;setMsg('descansoMensagem','Selecione um policial e um ano de referência entre 1900 e 9998.');return;
  }
  const novo=!mesmoContextoDescanso(ctx,descansoContexto);
  if(novo)limparContextoDescanso();
  descansoContexto=ctx;
  const token=++descansoToken, contexto=contextoConsulta();
  const valida=()=>contexto()&&token===descansoToken&&mesmoContextoDescanso(ctx,contextoDescansoSelecionado());
  iniciarConsultaTela('ferias-abono');setMsg('descansoMensagem','Consultando férias e abono...');
  // Não deixa gravar sobre saldos que ainda estão sendo consultados.
  $('descansoDetalhes').hidden=true;
  try {
    const {data:controle}=await resultadoConsulta(db.from('ferias_controles').select('id,policial_id,ano_referencia,mes_previsto').eq('policial_id',ctx.policial).eq('ano_referencia',ctx.ano).maybeSingle());
    conferirConsulta(valida);
    const periodos=[];
    await Promise.all([
      controle?percorrerPorId(()=>db.from('ferias_periodos').select('id,controle_id,data_inicio,data_fim,dias,cancelado_em').eq('controle_id',controle.id),lote=>periodos.push(...lote.map(p=>({...p,tipo:'ferias'}))),valida):Promise.resolve(),
      percorrerPorId(()=>db.from('abono_periodos').select('id,policial_id,ano_referencia,data_inicio,data_fim,dias,cancelado_em').eq('policial_id',ctx.policial).eq('ano_referencia',ctx.ano),lote=>periodos.push(...lote.map(p=>({...p,tipo:'abono'}))),valida)
    ]);
    conferirConsulta(valida);descansoControle=controle;descansoPeriodos=periodos;
    if(!temAlteracoesNaoSalvas('descansoPrevisaoForm')) {
      $('descansoPrevisao').value=controle?.mes_previsto?.slice(0,7)||'';registrarFormularioSalvo('descansoPrevisaoForm');
    }
    renderizarDescanso();$('descansoDetalhes').hidden=false;bloquearDescanso(false);
    concluirConsultaTela('ferias-abono');setMsg('descansoMensagem','Consulta concluída. O mês real corresponde ao início de cada período.');
  } catch(error) {
    if(!valida()||error.name==='AbortError')return;
    concluirConsultaTela('ferias-abono',false);
    const migracao=['42P01','42883','PGRST202','PGRST205'].includes(error.code);
    setMsg('descansoMensagem',migracao?'O módulo precisa da migração de férias e abono no Supabase. Consulte as instruções no README.':'Não foi possível consultar: '+erroAmigavel(error),true);
  }
}
function resumoDescanso(periodos) {
  const ativos=periodos.filter(p=>!p.cancelado_em),ferias=ativos.filter(p=>p.tipo==='ferias');
  const diasFerias=ferias.reduce((s,p)=>s+Number(p.dias),0),diasAbono=ativos.filter(p=>p.tipo==='abono').reduce((s,p)=>s+Number(p.dias),0);
  return {diasFerias,diasAbono,parcelas:ferias.length,saldoFerias:30-diasFerias,saldoAbono:5-diasAbono};
}
function renderizarDescanso() {
  const r=resumoDescanso(descansoPeriodos);
  $('descansoSaldoFerias').textContent=`${r.diasFerias} / ${r.saldoFerias} dias`;
  $('descansoSaldoAbono').textContent=`${r.diasAbono} / ${r.saldoAbono} dias`;
  $('descansoParcelas').textContent=`${r.parcelas} de 3`;
  const body=$('descansoBody');body.replaceChildren();
  for(const p of [...descansoPeriodos].sort((a,b)=>a.data_inicio.localeCompare(b.data_inicio)||String(a.id).localeCompare(String(b.id)))) {
    const tr=document.createElement('tr');
    for(const valor of [p.tipo==='ferias'?'Férias':'Abono',formatarData(p.data_inicio),formatarData(p.data_fim),p.data_inicio.slice(0,7).split('-').reverse().join('/'),p.dias,p.cancelado_em?'Cancelado':'Registrado']) {
      const td=document.createElement('td');td.textContent=valor;tr.appendChild(td);
    }
    const td=document.createElement('td');tr.appendChild(td);
    if(ehAdmin()&&!p.cancelado_em) {
      botaoAcao(td,'Editar',()=>editarPeriodoDescanso(p));botaoAcao(td,'Cancelar',()=>cancelarPeriodoDescanso(p));
    }
    body.appendChild(tr);
  }
  if(!descansoPeriodos.length) {
    const tr=body.insertRow(),td=tr.insertCell();td.colSpan=7;td.textContent='Nenhum período registrado neste ano de referência.';
  }
}
function calcularFimDescanso() {
  const tipo=$('descansoTipo').value,inicio=$('descansoInicio').value,dias=Number($('descansoDias').value);
  $('descansoDias').max=tipo==='ferias'?30:5;
  $('descansoFim').value=inicio&&Number.isInteger(dias)&&dias>0&&dias<=30?somarDias(inicio,dias-1):'';
}
function validarPeriodoDescanso(periodos,tipo,inicio,dias,id=null) {
  if(!['ferias','abono'].includes(tipo)||!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||inicio<'1900-01-01'||inicio>'9998-12-31'||!Number.isInteger(dias)||dias<1||dias>(tipo==='ferias'?30:5))throw new Error('Informe uma data válida e a quantidade de dias permitida.');
  const outros=periodos.filter(p=>!p.cancelado_em&&!(p.tipo===tipo&&String(p.id)===String(id))),fim=somarDias(inicio,dias-1);
  const mesmos=outros.filter(p=>p.tipo===tipo);
  if(tipo==='ferias'&&mesmos.length>=3)throw new Error('As férias permitem até três parcelas por ano de referência.');
  if(mesmos.reduce((s,p)=>s+Number(p.dias),0)+dias>(tipo==='ferias'?30:5))throw new Error('A quantidade excede o saldo disponível.');
  if(outros.some(p=>p.data_inicio<=fim&&p.data_fim>=inicio))throw new Error('Já existe um período de férias ou abono nessas datas.');
  return fim;
}
function editarPeriodoDescanso(p) {
  if(!ehAdmin()||descansoOcupado||!confirmarDescarte('descansoPeriodoForm'))return;
  descansoEdicao={id:p.id,tipo:p.tipo};$('descansoTipo').value=p.tipo;$('descansoTipo').disabled=true;
  $('descansoInicio').value=p.data_inicio;$('descansoDias').value=p.dias;calcularFimDescanso();
  $('descansoPeriodoTitulo').textContent='Editar período de '+(p.tipo==='ferias'?'férias':'abono');
  registrarFormularioSalvo('descansoPeriodoForm');bloquearDescanso(false);$('descansoInicio').focus();
}
async function executarGravacaoDescanso(nome,parametros,aposSalvar) {
  if(!usuarioAtual||descansoOcupado||!mesmoContextoDescanso(descansoContexto,contextoDescansoSelecionado()))return;
  const contexto=contextoConsulta(),ctx={...descansoContexto};bloquearDescanso(true);setMsg('descansoMensagem','Salvando...');
  try {
    const {data,error}=await db.rpc(nome,parametros);
    if(!contexto())return;
    if(error)throw error;
    if(!data?.id)throw new Error('A gravação não foi confirmada. Atualize para conferir os dados antes de tentar novamente.');
    aposSalvar();bloquearDescanso(false);await carregarDescanso();
    if(contexto()&&mesmoContextoDescanso(ctx,descansoContexto)&&!$('descansoDetalhes').hidden)setMsg('descansoMensagem','Registro salvo. Saldos atualizados.');
  } catch(error) {
    if(contexto())setMsg('descansoMensagem','Não foi possível salvar: '+erroAmigavel(error),true);
  } finally {if(contexto())bloquearDescanso(false);}
}
async function salvarPrevisaoDescanso() {
  if(!descansoContexto)return;
  const mes=$('descansoPrevisao').value;
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))return setMsg('descansoMensagem','Informe o mês/ano previsto.',true);
  await executarGravacaoDescanso('salvar_previsao_ferias',{p_policial_id:descansoContexto.policial,p_ano:descansoContexto.ano,p_mes:mes+'-01'},()=>registrarFormularioSalvo('descansoPrevisaoForm'));
}
async function salvarPeriodoDescanso() {
  if(!descansoContexto)return;
  const tipo=$('descansoTipo').value,inicio=$('descansoInicio').value,dias=Number($('descansoDias').value);
  try {
    if(tipo==='ferias'&&!descansoControle)throw new Error('Salve a previsão de férias antes de registrar as parcelas.');
    validarPeriodoDescanso(descansoPeriodos,tipo,inicio,dias,descansoEdicao?.id);
    await executarGravacaoDescanso('salvar_periodo_descanso',{p_tipo:tipo,p_policial_id:descansoContexto.policial,p_ano:descansoContexto.ano,p_inicio:inicio,p_dias:dias,p_id:descansoEdicao?.id??null,p_cancelar:false},()=>limparPeriodoDescanso(true));
  } catch(error) {setMsg('descansoMensagem',error.message,true);}
}
async function cancelarPeriodoDescanso(p) {
  if(!ehAdmin()||descansoOcupado||!confirmarDescarte('descansoPeriodoForm')||!confirm('Cancelar este período? O registro permanecerá no histórico e o saldo será liberado.'))return;
  await executarGravacaoDescanso('salvar_periodo_descanso',{p_tipo:p.tipo,p_policial_id:descansoContexto.policial,p_ano:descansoContexto.ano,p_inicio:p.data_inicio,p_dias:p.dias,p_id:p.id,p_cancelar:true},()=>limparPeriodoDescanso(true));
}
$('descansoAno').value=anoBrasilia();
$('descansoBusca').addEventListener('input',preencherPoliciaisDescanso);
for(const id of ['descansoPolicial','descansoAno'])$(id).addEventListener('change',()=>void mudarContextoDescanso());
$('descansoAtualizar').addEventListener('click',()=>void carregarDescanso());
$('descansoPrevisaoForm').addEventListener('submit',e=>{e.preventDefault();void salvarPrevisaoDescanso();});
$('descansoPeriodoForm').addEventListener('submit',e=>{e.preventDefault();void salvarPeriodoDescanso();});
$('descansoLimparPeriodo').addEventListener('click',()=>limparPeriodoDescanso());
for(const id of ['descansoInicio','descansoDias','descansoTipo'])$(id).addEventListener('input',calcularFimDescanso);
