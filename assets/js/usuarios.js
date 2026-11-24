'use strict';

// V6: gestao de perfis via RPC com verificacao de admin no servidor.
async function carregarUsuarios({descartar=false}={}){
  if(!ehAdmin())return;
  if(!descartar&&temAlteracoesNaoSalvas('usuarios')){setMsg('usersMessage','Há alterações de usuários não salvas. Salve-as ou use Atualizar usuários para descartá-las.');return;}
  const estadoAoConsultar=JSON.stringify([...formulariosProtegidos].filter(([chave])=>chave.startsWith('usuarios:')).map(([chave,r])=>[chave,estadoCampos(r.campos)]));
  $('usersMessage').textContent='Carregando usuários...';
  const sessao=usuarioAtual,valida=contextoConsulta();iniciarConsultaTela('usuarios');
  const [res,log]=await Promise.all([
    db.rpc('v6_listar_usuarios'),
    db.from('auditoria_perfis').select('usuario_alvo,alterado_por,alterado_em,dados_anteriores,dados_novos').order('alterado_em',{ascending:false}).limit(30)
  ]);
  if(!valida()||usuarioAtual!==sessao || !ehAdmin())return;
  if(res.error){concluirConsultaTela('usuarios',false);setMsg('usersMessage','Erro ao listar usuários: '+erroAmigavel(res.error),true);return;}
  const estadoAtual=JSON.stringify([...formulariosProtegidos].filter(([chave])=>chave.startsWith('usuarios:')).map(([chave,r])=>[chave,estadoCampos(r.campos)]));
  if(estadoAtual!==estadoAoConsultar){concluirConsultaTela('usuarios',false);setMsg('usersMessage','O formulário foi alterado durante a consulta. Seu preenchimento foi mantido.');return;}
  limparProtecaoUsuarios();
  const tbody=$('usersBody');tbody.replaceChildren();
  (res.data||[]).forEach(u=>{
    const tr=document.createElement('tr');
    celula(tr,u.email);const tdNome=document.createElement('td');
    const nome=document.createElement('input');nome.value=u.nome||'';nome.maxLength=160;nome.setAttribute('aria-label','Nome de '+u.email);tdNome.appendChild(nome);tr.appendChild(tdNome);
    const tdPerfil=document.createElement('td'),perfil=document.createElement('select');
    perfil.append(opcao('operador','Operador'),opcao('administrador','Administrador'));perfil.value=u.perfil;tdPerfil.appendChild(perfil);tr.appendChild(tdPerfil);
    const tdAtivo=document.createElement('td'),ativo=document.createElement('input');ativo.type='checkbox';ativo.checked=u.ativo;ativo.style.width='16px';ativo.style.height='16px';ativo.setAttribute('aria-label','Conta ativa: '+u.email);tdAtivo.appendChild(ativo);tr.appendChild(tdAtivo);
    const tdAcao=document.createElement('td'),botao=document.createElement('button');botao.type='button';botao.className='secondary mini';botao.textContent='Salvar alterações';
    if(u.id===usuarioAtual?.id){perfil.disabled=true;ativo.disabled=true;botao.title='Seu próprio perfil pode ter apenas o nome alterado';}
    botao.addEventListener('click',async()=>{
      const novoNome=nome.value.trim();if(novoNome.length<2){setMsg('usersMessage','Informe um nome com pelo menos 2 caracteres.',true);return;}
      if(!confirm('Confirmar atualização do acesso de '+u.email+'?'))return;
      botao.disabled=true;
      try{
        const {error}=await db.rpc('v6_atualizar_usuario',{p_usuario_id:u.id,p_nome:novoNome,p_perfil:perfil.value,p_ativo:ativo.checked});
        if(!valida())return;
        if(error)throw error;
        registrarFormularioSalvo('usuarios:'+u.id);
        setMsg('usersMessage','Perfil atualizado: '+u.email);
        botao.disabled=false;
        await carregarUsuarios();
      }catch(e){setMsg('usersMessage','Não foi possível atualizar: '+erroAmigavel(e),true);botao.disabled=false;}
    });
    tdAcao.appendChild(botao);tr.appendChild(tdAcao);tbody.appendChild(tr);
    protegerCampos('usuarios:'+u.id,'Usuários',[nome,perfil,ativo]);
  });
  if(!(res.data||[]).length){const tr=document.createElement('tr');const td=celula(tr,'Nenhum usuário encontrado.');td.colSpan=5;tbody.appendChild(tr);}
  $('usersMessage').textContent=`${(res.data||[]).length} conta(s) listada(s).`;
  const logBody=$('usersAuditBody');logBody.replaceChildren();
  if(log.error){concluirConsultaTela('usuarios',false);$('usersAuditMessage').textContent='Auditoria indisponível: '+erroAmigavel(log.error);return;}
  const emails=new Map((res.data||[]).map(u=>[u.id,u.email]));
  (log.data||[]).forEach(x=>{
    const tr=document.createElement('tr');
    [formatarDataHoraBrasilia(x.alterado_em),emails.get(x.usuario_alvo)||x.usuario_alvo,emails.get(x.alterado_por)||x.alterado_por].forEach(v=>celula(tr,v));
    tr.className='audit-event';logBody.appendChild(tr);
    const detalhes=document.createElement('tr');detalhes.className='audit-event-details';const td=celula(detalhes,'');td.colSpan=3;
    renderizarDetalhesAuditoria(td,{operacao:'UPDATE',dados_anteriores:x.dados_anteriores,dados_novos:x.dados_novos});logBody.appendChild(detalhes);
  });
  $('usersAuditMessage').textContent=`${(log.data||[]).length} alteração(ões) de perfil exibida(s).`;
  concluirConsultaTela('usuarios');
}
$('reloadUsers').addEventListener('click',()=>{if(confirmarDescarte('usuarios'))void carregarUsuarios({descartar:true});});
