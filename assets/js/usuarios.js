'use strict';

// V6: gestao de perfis via RPC com verificacao de admin no servidor.
async function carregarUsuarios(){
  if(!ehAdmin())return;
  $('usersMessage').textContent='Carregando usuários...';
  const sessao=usuarioAtual;
  const [res,log]=await Promise.all([
    db.rpc('v6_listar_usuarios'),
    db.from('auditoria_perfis').select('usuario_alvo,alterado_por,alterado_em,dados_anteriores,dados_novos').order('alterado_em',{ascending:false}).limit(30)
  ]);
  if(usuarioAtual!==sessao || !ehAdmin())return;
  if(res.error){setMsg('usersMessage','Erro ao listar usuários: '+erroAmigavel(res.error),true);return;}
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
        if(error)throw error;
        setMsg('usersMessage','Perfil atualizado: '+u.email);
        await carregarUsuarios();
      }catch(e){setMsg('usersMessage','Não foi possível atualizar: '+erroAmigavel(e),true);botao.disabled=false;}
    });
    tdAcao.appendChild(botao);tr.appendChild(tdAcao);tbody.appendChild(tr);
  });
  if(!(res.data||[]).length){const tr=document.createElement('tr');const td=celula(tr,'Nenhum usuário encontrado.');td.colSpan=5;tbody.appendChild(tr);}
  $('usersMessage').textContent=`${(res.data||[]).length} conta(s) listada(s).`;
  const logBody=$('usersAuditBody');logBody.replaceChildren();
  if(log.error){$('usersAuditMessage').textContent='Auditoria indisponível: '+erroAmigavel(log.error);return;}
  (log.data||[]).forEach(x=>{
    const tr=document.createElement('tr');
    [new Date(x.alterado_em).toLocaleString('pt-BR'),x.usuario_alvo,x.alterado_por,
      JSON.stringify(x.dados_anteriores),JSON.stringify(x.dados_novos)].forEach(v=>celula(tr,v));
    logBody.appendChild(tr);
  });
  $('usersAuditMessage').textContent=`${(log.data||[]).length} alteração(ões) de perfil exibida(s).`;
}
$('reloadUsers').addEventListener('click',()=>{void carregarUsuarios();});
