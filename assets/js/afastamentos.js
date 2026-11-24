'use strict';

// V25: aviso pontual somente após a inclusão bem-sucedida de um afastamento.
// Consulta a view existente sem alterar qualquer regra de averbação.
async function v25AvisarAverbacaoAposCadastro(id, policialId){
  try{
    const {data,error}=await db.from('vw_averbacoes')
      .select('afastamento_id,policial_id,numero_ciclo,inicio_ciclo,fim_ciclo,total_dias,situacao_averbacao')
      .eq('afastamento_id',id).eq('policial_id',policialId).limit(1);
    if(error)throw error;
    const a=(data||[])[0];
    if(a?.situacao_averbacao!=='AVERBAR')return;
    const p=policiais.find(x=>String(x.id)===String(policialId));
    const nome=p?`${p.qra} — ${p.nome_completo}`:`Policial ${policialId}`;
    alert(`⚠ ATENÇÃO: AVERBAÇÃO NECESSÁRIA\n\nO afastamento cadastrado para ${nome} possui indicação de AVERBAR.\n\nCiclo: ${formatarData(a.inicio_ciclo)} a ${formatarData(a.fim_ciclo)}\nTotal no ciclo: ${a.total_dias} dia(s).\n\nAviso indicativo conforme as regras atuais do sistema.`);
  }catch(error){
    console.error('Não foi possível verificar a indicação de averbação após o cadastro:',error);
    setMsg('formMessage','Registro salvo com sucesso, mas não foi possível verificar a indicação de averbação. Consulte a coluna Averbação nos registros.',true);
  }
}
function normalizarBuscaPolicial(texto){return String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();}
function filtrarPoliciaisCadastro(){
  const seletor=$('policial'),campo=$('policialBusca'),termo=normalizarBuscaPolicial(campo.value);
  const anterior=seletor.value;
  const encontrados=policiais.filter(p=>[p.matricula,p.qra,p.nome_completo].some(v=>normalizarBuscaPolicial(v).includes(termo)));
  const exatos=termo?encontrados.filter(p=>[p.matricula,p.qra,p.nome_completo].some(v=>normalizarBuscaPolicial(v)===termo)):[];
  seletor.replaceChildren(opcao('','Selecione o policial'));
  encontrados.forEach(p=>seletor.appendChild(opcao(p.id,`${p.matricula} · ${p.qra} · ${p.nome_completo}`)));
  // Seleciona automaticamente apenas quando a identificação não é ambígua.
  const identificado=exatos.length===1?exatos[0]:encontrados.length===1&&termo?encontrados[0]:null;
  if(identificado)seletor.value=String(identificado.id);
  else if(!termo && encontrados.some(p=>String(p.id)===anterior))seletor.value=anterior;
  else seletor.value='';
  const info=$('policialBuscaInfo');
  if(identificado){
    info.textContent=`✓ Policial identificado: ${identificado.qra} — ${identificado.nome_completo} | Matrícula: ${identificado.matricula}.`;
  }else if(!termo){
    info.textContent=`${policiais.length} policiais disponíveis. Digite o QRA, matrícula ou nome.`;
  }else if(!encontrados.length){
    info.textContent='Nenhum policial encontrado. Verifique os dados digitados.';
  }else{
    info.textContent=`${encontrados.length} correspondências. Continue digitando ou escolha o policial na lista abaixo.`;
  }
}

function preencherSeletores(){
  const p=$('policial'),t=$('tipo'),policialAnterior=p.value,tipoAnteriorCadastro=t.value;
  const rotuloPolicial=p.selectedOptions[0]?.textContent,rotuloTipo=t.selectedOptions[0]?.textContent;
  t.replaceChildren(opcao('','Selecione o tipo'));
  filtrarPoliciaisCadastro();
  if([...p.options].some(o=>o.value===policialAnterior))p.value=policialAnterior;
  tipos.forEach(x=>t.appendChild(opcao(x.id,`${x.sigla} - ${x.descricao}`)));
  if(editandoId!==null){
    if(policialAnterior&&![...p.options].some(o=>o.value===policialAnterior))p.appendChild(opcao(policialAnterior,rotuloPolicial||'Cadastro inativo'));
    if(tipoAnteriorCadastro&&![...t.options].some(o=>o.value===tipoAnteriorCadastro))t.appendChild(opcao(tipoAnteriorCadastro,rotuloTipo||'Tipo inativo'));
    p.value=policialAnterior;
  }
  if([...t.options].some(o=>o.value===tipoAnteriorCadastro))t.value=tipoAnteriorCadastro;
  const filtro=$('filterPolicial'),selecionado=filtro.value;filtro.replaceChildren(opcao('','Todos'));
  policiaisCatalogo.forEach(x=>filtro.appendChild(opcao(x.id,`${x.matricula} · ${x.qra}`)));filtro.value=selecionado;
  const ft=$('filterTipo'),tipoAnterior=ft.value;ft.replaceChildren(opcao('','Todos'));tiposCatalogo.forEach(x=>ft.appendChild(opcao(x.id,`${x.sigla} - ${x.descricao}`)));ft.value=tipoAnterior;
}
$('policialBusca').addEventListener('input',filtrarPoliciaisCadastro);
function preencherFiltroRelatorio(){
  const p=$('reportPolicial'),t=$('reportTipo'),pv=p.value,tv=t.value;
  p.replaceChildren(opcao('','Todos'));t.replaceChildren(opcao('','Todos'));
  policiaisCatalogo.forEach(x=>p.appendChild(opcao(x.id,`${x.matricula} · ${x.qra} · ${x.nome_completo}`)));
  tiposCatalogo.forEach(x=>t.appendChild(opcao(x.id,`${x.sigla} - ${x.descricao}`)));
  p.value=pv;t.value=tv;
}
function atualizarTipo(){const t=tipos.find(x=>String(x.id)===$('tipo').value);if(t&&t.dias_fixos!==null){$('dias').value=t.dias_fixos;$('dias').readOnly=true;}else{$('dias').value='';$('dias').readOnly=false;}calcularTermino();}
function calcularTermino(){const ini=$('inicio').value,n=Number($('dias').value);$('fim').value=ini&&Number.isInteger(n)&&n>=1&&n<=3650?somarDias(ini,n-1):'';}
function limparFormulario({forcar=false}={}){
  if(!forcar&&!confirmarDescarte('afastamentoForm'))return;
  editandoId=null;
  preencherSeletores();
  $('afastamentoForm').reset();$('dias').readOnly=false;
  $('policial').disabled=false;
  $('policialBusca').disabled=false;$('policialBusca').value='';filtrarPoliciaisCadastro();
  $('formTitle').textContent='Novo afastamento';
  $('formHelp').textContent='Preencha os dados para cadastrar um afastamento fictício.';
  $('saveButton').textContent='Salvar afastamento';
  $('cancelEditButton').hidden=true;
  $('formMessage').textContent='';
  registrarFormularioSalvo('afastamentoForm');
}
function editarRegistro(id){
  if(!ehAdmin())return;
  const r=registros.find(x=>String(x.id)===String(id));
  if(!r||r.cancelado_em)return;
  if(!confirmarDescarte('afastamentoForm'))return;
  editandoId=r.id;
  $('policialBusca').value='';filtrarPoliciaisCadastro();
  if(![...$('policial').options].some(o=>o.value===String(r.policial_id)))$('policial').appendChild(opcao(r.policial_id,`${r.policiais?.matricula||r.policial_id} · ${r.policiais?.nome_completo||'Cadastro inativo'}`));
  if(![...$('tipo').options].some(o=>o.value===String(r.tipo_id)))$('tipo').appendChild(opcao(r.tipo_id,r.tipos_afastamento?.sigla||'Tipo inativo'));
  $('policial').value=String(r.policial_id);
  $('policialBusca').disabled=true;
  $('policial').disabled=true; // Evita mover um afastamento para outro policial.
  $('tipo').value=String(r.tipo_id);
  $('inicio').value=r.data_inicio;
  $('observacoes').value=r.observacoes||'';
  const t=tiposCatalogo.find(x=>String(x.id)===String(r.tipo_id));
  $('dias').value=String(r.dias);
  $('dias').readOnly=t?.dias_fixos!==null && t?.dias_fixos!==undefined;
  calcularTermino();
  $('formTitle').textContent='Editar afastamento #'+r.id;
  $('formHelp').textContent='Somente administradores. A alteração fica registrada na auditoria.';
  $('saveButton').textContent='Salvar alterações';
  $('cancelEditButton').hidden=false;
  setMsg('formMessage','Editando registro #'+r.id);
  registrarFormularioSalvo('afastamentoForm');
  navegarPara('novo-afastamento');
}
async function salvarAfastamento(){
  const botao=$('saveButton');
  try{
    if(!usuarioAtual)throw new Error('Sessão não autenticada.');
    if(editandoId!==null&&!ehAdmin())throw new Error('Apenas administradores podem editar registros.');
    const policial_id=Number($('policial').value),tipo_id=Number($('tipo').value),data_inicio=$('inicio').value,data_fim=$('fim').value,dias=Number($('dias').value);
    if(!policial_id||!tipo_id||!data_inicio||!data_fim||!Number.isInteger(dias)||dias<1)throw new Error('Preencha todos os campos obrigatórios.');
    const t=tiposCatalogo.find(x=>x.id===tipo_id);
    if(t?.dias_fixos!==null&&t?.dias_fixos!==undefined&&dias!==t.dias_fixos)throw new Error('A duração deve respeitar os dias fixos do tipo.');
    botao.disabled=true;setMsg('formMessage','Salvando...');
    const payload={tipo_id,data_inicio,data_fim,observacoes:$('observacoes').value.trim()||null};
    const inclusaoNova=editandoId===null;
    let resultado;
    if(editandoId!==null){
      resultado=await db.from('afastamentos').update(payload).eq('id',editandoId).select('id');
      if(!resultado.error && resultado.data?.length!==1)throw new Error('A edição não foi autorizada ou o registro não existe.');
    }else{
      resultado=await db.from('afastamentos').insert({...payload,policial_id,criado_por:usuarioAtual.id}).select('id');
      if(!resultado.error && resultado.data?.length!==1)throw new Error('O cadastro não foi confirmado.');
    }
    if(resultado.error)throw resultado.error;
    limparFormulario({forcar:true});
    setMsg('formMessage','Registro salvo com sucesso!');
    await carregarDados();
    if(inclusaoNova)await v25AvisarAverbacaoAposCadastro(resultado.data[0].id,policial_id);
  }catch(error){console.error('Erro ao salvar:',error);setMsg('formMessage',error.code==='23P01'?'Já existe afastamento sobreposto para este policial.':'Não foi possível salvar: '+erroAmigavel(error),true);}
  finally{botao.disabled=false;}
}
async function cancelarRegistro(id){
  if(!ehAdmin())return;
  const r=registros.find(x=>String(x.id)===String(id));
  if(!r||r.cancelado_em)return;
  if(!confirm(`Cancelar o afastamento #${r.id} de ${r.policiais?.qra||'policial'} (${formatarData(r.data_inicio)} a ${formatarData(r.data_fim)})?\n\nO registro permanecerá no histórico.`))return;
  try{
    const {data,error}=await db.from('afastamentos').update({cancelado_em:new Date().toISOString(),cancelado_por:usuarioAtual.id}).eq('id',id).is('cancelado_em',null).select('id');
    if(error)throw error;
    if(data?.length!==1)throw new Error('Não foi possível confirmar o cancelamento. Atualize a página.');
    if(String(editandoId)===String(id))limparFormulario({forcar:true});
    await carregarDados();
  }catch(error){console.error('Erro ao cancelar:',error);alert('Não foi possível cancelar: '+erroAmigavel(error));}
}
