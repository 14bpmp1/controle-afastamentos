'use strict';

async function iniciar(){
  const botao=$('loginButton');botao.disabled=true;
  try{
    if(!window.supabase?.createClient)throw new Error('Biblioteca do Supabase não carregou. Verifique sua conexão e atualize a página.');
    if(!SUPABASE_KEY||SUPABASE_KEY.includes('COLE_AQUI')||SUPABASE_KEY.includes('SUA_CHAVE'))throw new Error('Cole sua Publishable key no código antes de publicar.');
    if(SUPABASE_KEY.startsWith('sb_secret_'))throw new Error('Não use chave secreta no site. Utilize a Publishable key.');
    db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    if(!db?.auth)throw new Error('Não foi possível inicializar a conexão com o Supabase.');
    console.info('Cliente Supabase inicializado.');
    setMsg('loginMessage','Conexão inicializada.');
    await verificarSessao();
  }catch(error){console.error('Erro de inicialização:',error);setMsg('loginMessage','Erro de configuração: '+erroAmigavel(error),true);}
  finally{botao.disabled=!db?.auth;botao.textContent='Entrar';}
}
// V28: conferência local e checklist administrativo; não substitui auditoria de banco.
const securityChecklistText=`Homologação de segurança — Controle de Afastamentos 14º BPM\n[ ] Autorização institucional\n[ ] RLS e políticas revisadas\n[ ] Testes com operador e administrador\n[ ] Acesso anônimo negado\n[ ] Backup e restauração testados\n[ ] Política de retenção e privacidade aprovada`;
$('securityCheck').addEventListener('click',async()=>{
  if(!ehAdmin()||!db){$('securityResult').textContent='Acesso restrito.';return;}
  const itens=[];
  itens.push(SUPABASE_KEY.startsWith('sb_publishable_')?'Chave: publishable identificada.':'Chave: verifique se é publishable/anon; nunca use secret/service_role.');
  const {data,error}=await db.auth.getUser();
  itens.push(!error&&data?.user?.id===usuarioAtual?.id?'Sessão autenticada: confirmada.':'Sessão autenticada: não confirmada.');
  itens.push(perfilAtual?.ativo&&perfilAtual?.perfil==='administrador'?'Perfil administrativo local: identificado.':'Perfil administrativo local: não confirmado.');
  itens.push('RLS, privilégios, backups e criptografia do servidor: NÃO verificados por este painel.');
  $('securityResult').textContent=itens.join(' | ');
});
$('securityCopy').addEventListener('click',async()=>{
  if(!ehAdmin())return;
  try{await navigator.clipboard.writeText(securityChecklistText);$('securityResult').textContent='Checklist copiado.';}
  catch(e){$('securityResult').textContent='Não foi possível copiar automaticamente. Use o checklist exibido.';}
});
document.querySelectorAll('.securityItem').forEach(el=>el.addEventListener('change',()=>{
  const total=document.querySelectorAll('.securityItem').length;
  const checked=document.querySelectorAll('.securityItem:checked').length;
  $('securityChecklistStatus').textContent=`${checked} de ${total} itens conferidos nesta sessão. As marcações não são salvas nem representam auditoria.`;
}));

void iniciar();
