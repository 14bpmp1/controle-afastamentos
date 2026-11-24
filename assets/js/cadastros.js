'use strict';

// V5: gerenciamento de cadastros com RLS no servidor.
async function carregarCadastros(){
  if(!ehAdmin())return;
  const valida=contextoConsulta(), pessoas=[], categorias=[];
  try{
    await Promise.all([
      percorrerPorId(()=>db.from('policiais').select('id,matricula,posto_graduacao,qra,nome_completo,ativo'),lote=>pessoas.push(...lote),valida),
      percorrerPorId(()=>db.from('tipos_afastamento').select('id,sigla,descricao,dias_fixos,ativo'),lote=>categorias.push(...lote),valida)
    ]);
    conferirConsulta(valida);
    todosPoliciais=pessoas.sort((a,b)=>a.matricula.localeCompare(b.matricula,'pt-BR'));
    todosTipos=categorias.sort((a,b)=>a.sigla.localeCompare(b.sigla,'pt-BR'));
    renderizarCadastros();
  }catch(error){
    if(!valida()||error.name==='AbortError')return;
    setMsg('admMsgPolicial','Não foi possível consultar os cadastros: '+erroAmigavel(error),true);
  }
}
function celula(tr,valor){const td=document.createElement('td');td.textContent=String(valor??'');tr.appendChild(td);return td;}
function botaoAcao(td,rotulo,acao){
  const b=document.createElement('button');b.type='button';
  const l=rotulo.toLowerCase();const remover=l==='desativar';
  b.className='secondary mini v20-icon-action'+(remover?' v20-danger':'');
  b.textContent=l==='editar'?'✎':remover?'🗑':l==='reativar'?'↻':rotulo;
  b.title=rotulo+(remover?' (desativação lógica; histórico preservado)':'');
  b.setAttribute('aria-label',b.title);b.addEventListener('click',acao);td.appendChild(b);
}
function renderizarCadastros(){
  const pb=$('admBodyPoliciais'),tb=$('admBodyTipos');pb.replaceChildren();tb.replaceChildren();
  for(const p of todosPoliciais){
    const tr=document.createElement('tr');
    [p.matricula,p.posto_graduacao,p.qra,p.nome_completo,p.ativo?'Ativo':'Inativo'].forEach(v=>celula(tr,v));
    const td=celula(tr,'');td.textContent='';
    botaoAcao(td,'Editar',()=>editarPolicialAdmin(p.id));
    botaoAcao(td,p.ativo?'Desativar':'Reativar',()=>alternarCadastro('policiais',p));
    pb.appendChild(tr);
  }
  for(const t of todosTipos){
    const tr=document.createElement('tr');
    [t.sigla,t.descricao,t.dias_fixos??'Variável',t.ativo?'Ativo':'Inativo'].forEach(v=>celula(tr,v));
    const td=celula(tr,'');td.textContent='';
    botaoAcao(td,'Editar',()=>editarTipoAdmin(t.id));
    botaoAcao(td,t.ativo?'Desativar':'Reativar',()=>alternarCadastro('tipos_afastamento',t));
    tb.appendChild(tr);
  }
}
function limparPolicialAdmin(){editPolicialId=null;$('policialAdminForm').reset();$('policialFormTitle').textContent='Cadastrar policial fictício';$('admMsgPolicial').textContent='';}
function limparTipoAdmin(){editTipoId=null;$('tipoAdminForm').reset();$('tipoFormTitle').textContent='Cadastrar tipo de afastamento';$('admMsgTipo').textContent='';}
function editarPolicialAdmin(id){
  const p=todosPoliciais.find(x=>x.id===id);if(!p)return;
  editPolicialId=id;$('admMatricula').value=p.matricula;$('admPosto').value=p.posto_graduacao;
  $('admQra').value=p.qra;$('admNome').value=p.nome_completo;
  $('policialFormTitle').textContent='Editar policial '+p.matricula;
  $('cadastrosPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function editarTipoAdmin(id){
  const t=todosTipos.find(x=>x.id===id);if(!t)return;
  editTipoId=id;$('admSigla').value=t.sigla;$('admDescricao').value=t.descricao;
  $('admDiasFixos').value=t.dias_fixos??'';
  $('tipoFormTitle').textContent='Editar tipo '+t.sigla;
  $('cadastrosPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function salvarPolicialAdmin(){
  if(!ehAdmin())return;
  const btn=$('admSalvarPolicial');btn.disabled=true;
  try{
    const obj={matricula:$('admMatricula').value.trim().toUpperCase(),posto_graduacao:$('admPosto').value.trim(),qra:$('admQra').value.trim(),nome_completo:$('admNome').value.trim()};
    if(Object.values(obj).some(v=>!v))throw new Error('Preencha todos os campos.');
    const res=editPolicialId!==null
      ?await db.from('policiais').update(obj).eq('id',editPolicialId).select('id').single()
      :await db.from('policiais').insert(obj).select('id').single();
    if(res.error)throw res.error;
    limparPolicialAdmin();await carregarDados();setMsg('admMsgPolicial','Cadastro salvo com sucesso.');
  }catch(e){console.error(e);setMsg('admMsgPolicial','Erro ao salvar: '+erroAmigavel(e),true);}
  finally{btn.disabled=false;}
}
async function salvarTipoAdmin(){
  if(!ehAdmin())return;
  const btn=$('admSalvarTipo');btn.disabled=true;
  try{
    const bruto=$('admDiasFixos').value.trim();
    const dias=bruto===''?null:Number(bruto);
    if(dias!==null&&(!Number.isInteger(dias)||dias<1||dias>3650))throw new Error('Dias fixos devem ser um número entre 1 e 3650.');
    const obj={sigla:$('admSigla').value.trim().toUpperCase(),descricao:$('admDescricao').value.trim(),dias_fixos:dias};
    if(!obj.sigla||!obj.descricao)throw new Error('Preencha a sigla e a descrição.');
    const res=editTipoId!==null
      ?await db.from('tipos_afastamento').update(obj).eq('id',editTipoId).select('id').single()
      :await db.from('tipos_afastamento').insert(obj).select('id').single();
    if(res.error)throw res.error;
    limparTipoAdmin();await carregarDados();setMsg('admMsgTipo','Tipo salvo com sucesso.');
  }catch(e){console.error(e);setMsg('admMsgTipo','Erro ao salvar: '+erroAmigavel(e),true);}
  finally{btn.disabled=false;}
}
async function alternarCadastro(tabela,registro){
  if(!ehAdmin())return;
  const novo=!registro.ativo;
  const nome=tabela==='policiais'?registro.matricula:registro.sigla;
  if(!confirm(`${novo?'Reativar':'Desativar'} ${nome}? O histórico de afastamentos será preservado.`))return;
  const idMsg=tabela==='policiais'?'admMsgPolicial':'admMsgTipo';
  const {data,error}=await db.from(tabela).update({ativo:novo}).eq('id',registro.id).select('id').single();
  if(error||!data){setMsg(idMsg,'Erro ao alterar cadastro: '+erroAmigavel(error||new Error('Nenhuma linha atualizada.')),true);return;}
  await carregarDados();setMsg(idMsg,`Cadastro ${novo?'reativado':'desativado'} com sucesso.`);
}
function mostrarAbaAdmin(tipo){
  $('adminPoliciais').hidden=tipo!=='policiais';$('adminTipos').hidden=tipo!=='tipos';
  $('tabPoliciais').classList.toggle('active',tipo==='policiais');
  $('tabTipos').classList.toggle('active',tipo==='tipos');
}

// V27: importação CSV administrativa, com conferência e inserções sem sobrescrever cadastros.
let importacaoAnalise=null;
function importarCsvLinhas(texto){
  const linhas=[];let linha=[],campo='',aspas=false;
  texto=texto.replace(/^\uFEFF/,'');
  for(let i=0;i<texto.length;i++){
    const c=texto[i];
    if(c==='"'){if(aspas&&texto[i+1]==='"'){campo+='"';i++;}else aspas=!aspas;}
    else if(c===';'&&!aspas){linha.push(campo);campo='';}
    else if((c==='\n'||c==='\r')&&!aspas){
      if(c==='\r'&&texto[i+1]==='\n')i++;
      linha.push(campo);if(linha.some(v=>v.trim()))linhas.push(linha);
      linha=[];campo='';
    }else campo+=c;
  }
  if(aspas)throw new Error('CSV contém aspas não fechadas.');
  linha.push(campo);if(linha.some(v=>v.trim()))linhas.push(linha);
  return linhas;
}
function importTexto(v){return String(v||'').trim();}
function importLimpar(){
  importacaoAnalise=null;$('importConfirmar').disabled=true;
  $('importPreview').replaceChildren();$('importResumo').textContent='';
}
$('importArquivo').addEventListener('change',importLimpar);
$('importModelo').addEventListener('click',()=>{
  const modelo='\uFEFFmatricula;posto_graduacao;qra;nome_completo\r\n123456;CAP QOPM;SILVA;JOAO DA SILVA\r\n';
  const url=URL.createObjectURL(new Blob([modelo],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='modelo_importacao_policiais.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('importAnalisar').addEventListener('click',async()=>{
  importLimpar();
  if(!ehAdmin()){setMsg('importResumo','Acesso restrito ao administrador.',true);return;}
  const arquivo=$('importArquivo').files[0];
  if(!arquivo){setMsg('importResumo','Selecione um arquivo CSV.',true);return;}
  if(arquivo.size>2*1024*1024){setMsg('importResumo','O arquivo deve ter até 2 MB.',true);return;}
  try{
    const texto=await arquivo.text(),linhas=importarCsvLinhas(texto);
    if(linhas.length<2)throw new Error('Arquivo sem linhas de dados.');
    if(linhas.length>5001)throw new Error('Máximo de 5.000 linhas por arquivo.');
    const cabecalho=linhas[0].map(x=>importTexto(x).toLowerCase());
    if(cabecalho.join(';')!=='matricula;posto_graduacao;qra;nome_completo')
      throw new Error('Cabeçalho inválido. Baixe o modelo CSV e mantenha as quatro colunas.');
    // Consulta no banco, não somente nos registros ativos carregados na tela.
    const matriculasExistentes=new Set();
    for(let inicio=0;;inicio+=500){
      const {data,error}=await db.from('policiais').select('matricula').range(inicio,inicio+499);
      if(error)throw error;
      for(const p of data||[])matriculasExistentes.add(importTexto(p.matricula).toUpperCase());
      if(!data||data.length<500)break;
    }
    const repetidasArquivo=new Set(),registros=[];
    linhas.slice(1).forEach((valores,idx)=>{
      const [matricula,posto_graduacao,qra,nome_completo]=valores.map(importTexto);
      const obj={matricula:(matricula||'').toUpperCase(),posto_graduacao,qra,nome_completo};
      let erro='';
      if(valores.length!==4)erro='Número de colunas inválido';
      else if(Object.values(obj).some(v=>!v))erro='Campo obrigatório vazio';
      else if(obj.matricula.length>40||obj.posto_graduacao.length>100||obj.qra.length>100||obj.nome_completo.length>200)erro='Texto excede o tamanho permitido';
      else if(matriculasExistentes.has(obj.matricula))erro='Matrícula já cadastrada';
      else if(repetidasArquivo.has(obj.matricula))erro='Matrícula repetida no arquivo';
      repetidasArquivo.add(obj.matricula);
      registros.push({linha:idx+2,obj,erro});
    });
    importacaoAnalise=registros;
    const corpo=$('importPreview');corpo.replaceChildren();
    for(const r of registros.slice(0,300)){
      const tr=document.createElement('tr');
      [r.linha,r.obj.matricula,r.obj.qra,r.obj.nome_completo,r.erro||'Pronto para importar'].forEach(v=>celula(tr,v));
      corpo.appendChild(tr);
    }
    const validos=registros.filter(r=>!r.erro).length;
    $('importResumo').textContent=`${registros.length} linhas analisadas: ${validos} válidas, ${registros.length-validos} rejeitadas. ${registros.length>300?'Prévia limitada a 300 linhas.':''}`;
    $('importConfirmar').disabled=!validos;
  }catch(e){setMsg('importResumo','Erro ao analisar: '+erroAmigavel(e),true);}
});
$('importConfirmar').addEventListener('click',async()=>{
  if(!ehAdmin()||!importacaoAnalise)return;
  const validos=importacaoAnalise.filter(r=>!r.erro);
  if(!validos.length)return;
  if(!confirm(`Importar ${validos.length} cadastros? Os existentes não serão alterados.`))return;
  const botao=$('importConfirmar'),analisar=$('importAnalisar');
  botao.disabled=true;analisar.disabled=true;
  let inseridos=0,erros=0;const falhas=[];
  try{
    // Inserção individual permite relatar cada falha; privilégios e unicidade são verificados pelo banco.
    for(const r of validos){
      if(!ehAdmin())break;
      const {error}=await db.from('policiais').insert(r.obj);
      if(error){erros++;falhas.push(`Linha ${r.linha}: ${erroAmigavel(error)}`);}
      else inseridos++;
      $('importResumo').textContent=`Importação em andamento: ${inseridos+erros}/${validos.length} processados...`;
    }
    await carregarDados();
    $('importResumo').textContent=`Importação concluída: ${inseridos} inseridos, ${erros} erros. ${falhas.slice(0,12).join(' | ')}${falhas.length>12?' (demais erros omitidos)':''}`;
    importacaoAnalise=null;
  }catch(e){setMsg('importResumo','Importação interrompida: '+erroAmigavel(e)+`. ${inseridos} inseridos até agora.`,true);}
  finally{analisar.disabled=false;botao.disabled=true;}
});

$('tabPoliciais').addEventListener('click',()=>mostrarAbaAdmin('policiais'));
$('tabTipos').addEventListener('click',()=>mostrarAbaAdmin('tipos'));
$('policialAdminForm').addEventListener('submit',e=>{e.preventDefault();void salvarPolicialAdmin();});
$('tipoAdminForm').addEventListener('submit',e=>{e.preventDefault();void salvarTipoAdmin();});
$('admLimparPolicial').addEventListener('click',limparPolicialAdmin);
$('admLimparTipo').addEventListener('click',limparTipoAdmin);
